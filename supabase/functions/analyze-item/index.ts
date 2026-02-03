import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { corsHeaders, verifyUser, checkUsage } from '../_shared/auth.ts';

// @ts-ignore
const API_KEY = Deno.env.get('GEMINI_API_KEY') || "";

const ai = new GoogleGenerativeAI(API_KEY);
console.log(`[Edge Function] AI Initialized. API Key Present: ${!!API_KEY}`);

// Helper to robustly extract JSON from AI text responses
const extractJSON = (text: string): any => {
    try {
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("JSON Extraction Failed. Raw text:", text);
        throw new Error("AI Response could not be parsed as JSON.");
    }
};

const createErrorResult = (msg: string) => ({
    itemTitle: msg,
    estimatedSoldPrice: 0,
    estimatedShippingCost: 0,
    estimatedWeight: "0 oz",
    confidence: 0,
    description: "Error",
    listingSources: []
});

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // STRICT SECURITY GUARD
        const { user, supabase } = await verifyUser(req);

        // DAILY THROTTLE: Limit to 100 uses per day
        await checkUsage(supabase, user.id, 'ai_analysis', 100);

        console.log(`[analyze-item] Secured call from User: ${user.id}`);

        if (!API_KEY) {
            throw new Error("GEMINI_API_KEY is not set in Edge Function secrets.");
        }

        const { action, payload } = await req.json();
        if (!action || !payload) {
            throw new Error("Missing action or payload in request body.");
        }
        console.log(`[Edge Function] Action: ${action}`, JSON.stringify(payload).substring(0, 100));

        let result;

        switch (action) {
            case 'analyze-image':
                result = await handleAnalyzeItemImage(payload);
                break;
            case 'identify-item':
                result = await handleIdentifyItem(payload);
                break;
            case 'analyze-details':
                result = await handleAnalyzeItemDetails(payload);
                break;
            case 'analyze-text':
                result = await handleAnalyzeItemText(payload);
                break;
            case 'optimize-title':
                result = await handleOptimizeTitle(payload);
                break;
            case 'suggest-specifics':
                result = await handleSuggestItemSpecifics(payload);
                break;
            case 'refine-price':
                result = await handleRefinePriceAnalysis(payload);
                break;
            case 'generate-description':
                result = await handleGenerateListingDescription(payload);
                break;
            case 'optimize-image':
                result = await handleOptimizeProductImage(payload);
                break;
            case 'analyze-listing':
                result = await handleAnalyzeListing(payload);
                break;
            default:
                throw new Error(`Unknown action: ${action}`);
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error("Edge Function Critical Error:", error);
        return new Response(JSON.stringify({
            error: error.message || "Unknown error",
            details: error.toString()
        }), {
            status: error.message.includes('authorization') ? 401 : 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})

// --- HANDLERS ---

// --- HANDLERS ---

async function handleAnalyzeItemImage({ imageBase64, imagesBase64, barcode, isBulkMode, isLiteMode }: any) {
    const images = imagesBase64 || (imageBase64 ? [imageBase64] : []);
    if (images.length === 0) throw new Error("No images provided for analysis.");

    const imageParts = images.map((img: string) => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: img.replace(/^data:image\/[a-z]+;base64,/, "")
        }
    }));

    let prompt;
    if (isLiteMode) {
        prompt = `
          Act as an expert reseller. Analyze the provided image(s).
          ${barcode ? `Barcode: ${barcode}.` : ""}
          
          TASK:
          1. Identify the item (Brand + Model + Key Variant).
          2. Create a "Comp Search Query" (Max 4-5 words). STRICTLY Brand + Model + MPN. 
             - CRITICAL: This query is for finding SOLD items on eBay.
             - DO NOT include colors, adjectives ("vintage", "rare"), or generic descriptors ("toy", "electronics", "unit").
             - If the model name is unique, just Brand + Model is best.
             - Example: "Sony Walkman WM-2" (NOT "Red Sony Walkman WM-2 Cassette Player").
          
          Output JSON ONLY:
          {
            "itemTitle": "string",
            "searchQuery": "string",
            "extractedDetails": "string (Self-verify: Mention a specific detail you found in the photo to prove analysis)"
          }
        `;
    } else {
        prompt = `
          Act as an expert reseller (eBay/flipper). Analyze ALL provided images (${images.length} photos provided).
          CRITICAL: Do not just focus on the first image. Synthesize information from ALL images to get a complete view.
          - CHECK for labels, manufacture dates, serial numbers, and fine print on the back/bottom of the item.
          - If a manufacture date or year is visible on any image, include it in the title or specifics.
          ${isBulkMode ? "MODE: BULK LOT / DEATH PILE. Identify the group of items." : "Identify the specific item."}
          ${barcode ? `Barcode provided: ${barcode}.` : ""}
          
          Task:
          1. Identify the item precisely.
          2. TITLE OPTIMIZATION: Create a "Search Optimized Title" (Max 10 words). 
             - Use ONLY: Brand + Model + Key Variant/Part Number.
             - DO NOT include filler words like "Rare", "Vintage" (unless needed for ID), "Good Condition", "Look!", or emojis.
             - Example: "Sony Walkman WM-2 Red Cassette Player" (NOT "Vintage Sony Walkman Working Rare Look")
          3. SEARCH QUERY GENERATION: Create a reduced "Comp Search Query" (Max 3-5 words).
             - Aim for Brand + Model + MPN.
             - EXCLUDE: colors, condition (New/Used), adjectives (Vintage/Rare), and generic nouns (Camera, Toy, Bag).
             - EXCEPTION: Include keywords that are PART of the official model name.
             - Example: "Sony Walkman WM-2" (Correct) vs "Red Sony Walkman WM-2 Cassette Player" (Incorrect).
          4. DETERMINE CONDITION: Look for signs of wear, packaging (Sealed/Boxed vs Loose/Used). Defaults to USED if unsure.
          5. Estimate current sold price (market value) for that SPECIFIC condition.
          6. ESTIMATE SHIPPING WEIGHT:
             - Include item + typical packaging (box/bubble wrap).
             - Format MUST be "X lbs Y oz" or "Z oz" (e.g., "1 lb 4 oz", "12 oz").
          7. ESTIMATE SHIPPING COST:
             - Based on USPS Ground Advantage rates for the estimated weight.
           8. ESTIMATE PACKAGE DIMENSIONS (REQUIRED):
             - You MUST estimate the typical shipping box size (Length x Width x Height) in inches.
             - Format: "L x W x H" (e.g., "12 x 10 x 8").
             - If unsure, provide your best guess for this item type. DO NOT LEAVE EMPTY.
             - Provide a brief "dimensionReasoning" explaining why you chose these dimensions (e.g. "Standard shoe box size").
          9. Estimate Market Demand (Sell-Through Rate).
          10. EXTRACT ITEM SPECIFICS:
             - Identify Brand, Model, MPN (Manufacturer Part Number), UPC (if visible), Type, and Country of Manufacture.
             - Return as an object 'itemSpecifics'. Use "Unbranded" or "Unknown" if not found.
          11. WRITE A SELLING DESCRIPTION:
             - Write a FACTUAL, CONCISE, and EASY TO READ description.
             - Use BULLET POINTS for key features.
             - NO fluff, NO marketing speak. Just facts.
             - Format:
               * [Key Feature 1]
               * [Key Feature 2]
               * [Condition Note]
               * [Flaws if any]
    
          Output JSON (Do not add markdown formatting):
          {
            "itemTitle": "string",
            "searchQuery": "string",
            "condition": "NEW" | "USED",
            "estimatedSoldPrice": number,
            "estimatedShippingCost": number,
            "estimatedWeight": "string",
            "estimatedDimensions": "string",
            "dimensionReasoning": "string",
            "marketDemand": "HIGH" | "MEDIUM" | "LOW",
            "itemSpecifics": {
                "Brand": "string",
                "Model": "string",
                "MPN": "string",
                "UPC": "string",
                "Type": "string",
                "CountryRegionOfManufacture": "string"
            },
            "description": "string",
            "confidence": number,
            "barcode": "string",
            "extractedDetails": "string (Self-verify: Mention a specific detail from any image, especially if multi-image. If single image, mention a detail like 'Detected [Brand] label' or '[X] condition details')"
          }
        `;
    }

    const model = ai.getGenerativeModel({
        model: 'gemini-2.0-flash'
    });

    const result_ai = await model.generateContent([
        ...imageParts,
        { text: prompt }
    ]);

    const response = result_ai.response;
    const text = response.text() || "{}";

    let result;
    try {
        result = extractJSON(text);
    } catch (e) {
        console.error("[Edge] JSON Parse Error. Text preview:", text.substring(0, 100));
        return createErrorResult("AI Response not JSON");
    }

    const listingSources: any[] = [];
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks) {
        groundingMetadata.groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
                listingSources.push({ title: chunk.web.title || "Source", uri: chunk.web.uri });
            }
        });
    }

    const usage = response.usageMetadata;
    const tokenUsage = usage ? {
        input: usage.promptTokenCount || 0,
        output: usage.candidatesTokenCount || 0,
        total: usage.totalTokenCount || 0
    } : undefined;

    return {
        itemTitle: result.itemTitle || "Unknown Item",
        searchQuery: result.searchQuery,
        estimatedSoldPrice: typeof result.estimatedSoldPrice === 'number' ? result.estimatedSoldPrice : 0,
        estimatedShippingCost: typeof result.estimatedShippingCost === 'number' ? result.estimatedShippingCost : 0,
        estimatedWeight: result.estimatedWeight,
        estimatedDimensions: result.estimatedDimensions,
        dimensionReasoning: result.dimensionReasoning,
        marketDemand: result.marketDemand,
        condition: result.condition,
        confidence: result.confidence || 85,
        description: result.description || "No description generated.",
        listingSources,
        itemSpecifics: result.itemSpecifics,
        tokenUsage,
        barcode: result.barcode || barcode,
        isBulkLot: isBulkMode,
        extractedDetails: result.extractedDetails,
        totalImagesAnalyzed: images.length
    };
}

async function handleIdentifyItem({ imageBase64, imagesBase64, barcode }: any) {
    const images = imagesBase64 || (imageBase64 ? [imageBase64] : []);
    if (images.length === 0) throw new Error("No images provided for identification.");

    const imageParts = images.map((img: string) => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: img.replace(/^data:image\/[a-z]+;base64,/, "")
        }
    }));

    const prompt = `
    Act as an expert reseller. FAST ID. Analyze the provided image(s).
    ${barcode ? `Barcode: ${barcode}` : ""}
    
    1. Identify the item in the image(s) (Brand + Model + Key Variant).
    2. Create a "Comp Search Query" (Max 3-5 words) for finding SOLD listings.
       - STRICTLY: Brand + Model + MPN.
       - EXCLUDE: colors (unless part of model), "vintage", "rare", "new", "used", "l@@k".
    
    Output JSON ONLY: { 
      "itemTitle": "string", 
      "searchQuery": "string",
      "extractedDetails": "string (Briefly state one specific detail identified from visual inspection)"
    }
  `;

    const model = ai.getGenerativeModel({
        model: 'gemini-2.0-flash'
    });

    const result_ai = await model.generateContent([
        ...imageParts,
        { text: prompt }
    ]);

    const response = result_ai.response;
    const text = response.text() || "{}";
    const result = extractJSON(text);

    const listingSources: any[] = [];
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks) {
        groundingMetadata.groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) listingSources.push({ title: chunk.web.title || "Source", uri: chunk.web.uri });
        });
    }

    return {
        itemTitle: result.itemTitle || "Unknown Item",
        searchQuery: result.searchQuery || result.itemTitle,
        listingSources
    };
}

async function handleAnalyzeItemDetails({ imageBase64, imagesBase64, identifiedTitle }: any) {
    const images = imagesBase64 || (imageBase64 ? [imageBase64] : []);
    if (images.length === 0) throw new Error("No images provided for deep analysis.");

    const imageParts = images.map((img: string) => ({
        inlineData: {
            mimeType: 'image/jpeg',
            data: img.replace(/^data:image\/[a-z]+;base64,/, "")
        }
    }));

    const prompt = `
    Analyze the provided ${images.length} image(s) of: "${identifiedTitle}".
    
    TASK: Create a professional eBay listing by synthesizing data from ALL images.
    - Labeled details, MPNs, and manufacture dates from secondary images are extremely important.
    
    1. WRITE AN OPTIMIZED TITLE(Crucial):
    - Max 80 Characters.
       - Format: Brand + Model + Key Variant + Key Specs + Condition(if applicable).
       - NO filler words("Look", "Wow").
       - Example: "Sony Walkman WM-2 Cassette Player Red Vintage Portable working"

    2. WRITE A DESCRIPTION:
    - Format:
    [Main Title Line]

        ** Features:**
            -[Key Feature 1(Material, Style, etc)]
            - [Key Feature 2]
            - [Key Feature 3]

            ** Measurements / Size:**
         - [Approximate Estimated Dimensions/Size]

                ** Condition:**
                    [Condition Note - Be specific about wear / flaws]

                    ** Shipping:**
                        Ships via USPS Ground Advantage.Securely packaged.
    
    3. ESTIMATE DATA(Search Web):
    - Price: Average Sold Price for this condition.
       - Shipping: Accurate Weight & Dimensions for this model.
    
    4. EXTRACT ITEM SPECIFICS(REQUIRED):
    - You MUST populate the 'itemSpecifics' object.
       - keys: "Brand", "Model", "MPN"(if found), and other category - specific attributes(e.g. "Size", "Color", "Material", "Platform").
       - Do NOT leave empty.If unknown, use "Unbranded" or "Unknown".
    
    Output JSON ONLY:
    {
      "itemTitle": "string (optimized 80 char title)",
      "searchQuery": "string (3-5 keywords: Brand + Model + MPN)",
      "condition": "USED",
      "estimatedSoldPrice": number,
      "estimatedShippingCost": number,
      "estimatedWeight": "string",
      "estimatedDimensions": "string",
      "itemSpecifics": { "Brand": "string", "Model": "string", "MPN": "string" },
      "description": "string",
      "extractedDetails": "string",
      "totalImagesAnalyzed": number
    }
    `;

    const model = ai.getGenerativeModel({
        model: 'gemini-2.0-flash'
    });

    const result_ai = await model.generateContent([
        ...imageParts,
        { text: prompt }
    ]);

    const response = result_ai.response;
    const text = response.text() || "{}";
    const parsed = extractJSON(text);
    return {
        ...parsed,
        itemTitle: parsed.itemTitle || parsed.optimizedTitle || identifiedTitle,
        searchQuery: parsed.searchQuery || identifiedTitle
    };
}


async function handleAnalyzeItemText({ query }: any) {
    const isBarcode = /^\d{8,14}$/.test(query.trim());

    let prompt;
    if (isBarcode) {
        prompt = `
            You are a specialized Barcode Lookup Tool.
            TARGET BARCODE: "${query}"
            
            STRICT INSTRUCTIONS:
    1. Execute Google Search using ONLY these digits: "${query}".
    2. DO NOT add words like "item", "toy", "electronics", "dvd" to the search query.Search the raw numbers.
            3. If the number corresponds to a product, Identify it.
            4. Identify the specific product(Brand + Model + Variant).
            5. Estimate price and weight based on the EXACT match found.
            
            Return JSON: {
        itemTitle,
            searchQuery,
            estimatedSoldPrice,
            estimatedShippingCost,
            estimatedWeight,
            description,
            confidence,
            marketDemand: "HIGH" | "MEDIUM" | "LOW",
                condition: "NEW" | "USED",
                    itemSpecifics: { "Brand": "", "Model": "", "Type": "" }
    }
    `;
    } else {
        prompt = `
            Identify item from query: "${query}".

        TASK:
    1. Identify product(Brand + Model + Variant).No fluff.
            2. Create a comp - friendly search query.
            3. Estimate price and weight.
            4. Identify Item Specifics(Brand, Model, Type, etc).
            
            Return JSON: {
        itemTitle,
            searchQuery,
            estimatedSoldPrice,
            estimatedShippingCost,
            estimatedWeight,
            description,
            confidence,
            marketDemand: "HIGH" | "MEDIUM" | "LOW",
                condition: "NEW" | "USED",
                    itemSpecifics: { "Brand": "", "Model": "", "Type": "" }
    }
    `;
    }

    const model = ai.getGenerativeModel({
        model: 'gemini-2.0-flash'
    });

    const result_ai = await model.generateContent(prompt);
    const response = result_ai.response;
    const text = response.text() || "{}";

    let result;
    try {
        result = extractJSON(text);
    } catch (e) {
        console.error("[Edge] JSON Parse Error Query. Text preview:", text.substring(0, 100));
        return createErrorResult("AI Response Not JSON");
    }

    const listingSources: any[] = [];
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks) {
        groundingMetadata.groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
                listingSources.push({ title: chunk.web.title || "Source", uri: chunk.web.uri });
            }
        });
    }

    return {
        itemTitle: result.itemTitle || query,
        searchQuery: result.searchQuery || query,
        condition: result.condition || 'USED',
        estimatedSoldPrice: result.estimatedSoldPrice || 0,
        estimatedShippingCost: result.estimatedShippingCost || 10,
        estimatedWeight: String(result.estimatedWeight || "1 lb"),
        confidence: result.confidence || 0,
        description: result.description || "",
        listingSources: listingSources,
        marketDemand: result.marketDemand || 'MEDIUM',
        itemSpecifics: result.itemSpecifics || {},
        barcode: isBarcode ? query : undefined
    };
}

async function handleOptimizeTitle({ currentTitle }: any) {
    const prompt = `
    Act as an expert eBay Copywriter.Rewrite the following title to maximize search visibility(SEO).
      
      Original Title: "${currentTitle}"
      
      CRITICAL RULES:
    1. ** ABSOLUTE LIMIT:** The output MUST be 80 characters or less.Count carefully.
      2. ** STRUCTURE:** Brand + Model + Product Type + Key Specs / Color + Condition(if New).
      3. ** KEYWORDS:** Infer high - value keywords from sold listings of similar items.
      4. ** CLEANUP:** Remove punctuation, "L@@K", "Wow", emojis, or duplicate words.
      5. ** FORMAT:** Title Case.
      
      If the title is too long, remove the least important words(like "Very", "Nice", "The").
      
      Return ONLY the optimized title string.
    `;
    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result_ai = await model.generateContent(prompt);
    const response = result_ai.response;
    const text = response.text() || currentTitle;
    let finalTitle = text.trim();
    if (finalTitle.length > 80) {
        finalTitle = finalTitle.substring(0, 80);
    }
    return { title: finalTitle.replace(/"/g, '') };
}

async function handleSuggestItemSpecifics({ title, notes }: any) {
    const prompt = `
          Based on the item title: "${title}" and condition notes: "${notes}", identify the likely eBay Item Specifics.
          
          Return JSON format only:
    {
        "Brand": "string",
            "Model": "string",
                "MPN": "string (or 'Does not apply')",
                    "Type": "string",
                        "UPC": "string (or 'Does not apply')",
                            "CountryRegionOfManufacture": "string"
    }
    `;

    const model = ai.getGenerativeModel({
        model: 'gemini-2.0-flash'
    });

    const result_ai = await model.generateContent(prompt);
    const response = result_ai.response;
    const text = response.text() || "{}";
    return extractJSON(text);
}

async function handleRefinePriceAnalysis({ title, condition }: any) {
    const prompt = `
    Re - evaluate the market price for this item: "${title}".
      CONDITION CHANGED TO: ${condition}.

    Task:
      Find the average sold price for this item specifically in ${condition} condition.
      
      Output JSON: { "estimatedSoldPrice": number }
    `;

    const model = ai.getGenerativeModel({
        model: 'gemini-2.0-flash'
    });

    const result_ai = await model.generateContent(prompt);
    const response = result_ai.response;
    const text = response.text() || "{}";
    const result = extractJSON(text);
    return { estimatedSoldPrice: result.estimatedSoldPrice || 0 };
}

async function handleGenerateListingDescription({ title, notes, platform }: any) {
    const prompt = platform === 'EBAY'
        ? `TASK: Write a plain text listing description for eBay.
        ITEM: "${title}"
    CONDITION: "${notes}"

        CRITICAL RULES:
    1. OUTPUT FORMAT: RAW PLAIN TEXT ONLY.DO NOT return JSON.DO NOT use Markdown(no ** bold **, no # headers).
        2. TONE: Strictly factual, dry, and objective.NO marketing fluff(No "Beautiful", "Stunning", "Perfect for").
        3. FORMATTING: Use simple newlines for spacing and dashes(-) for lists.
        4. CONTENT:
           ${title}

    Details:
    - Brand: [Brand]
        - Model: [Model]
            - [Spec 1]
            - [Spec 2]

    Condition:
           ${notes ? notes : "Pre-owned. See photos for details."}

    Shipping:
           Ships via USPS Ground Advantage.`
        : `Write a short, factual Facebook Marketplace listing for "${title}".Condition: "${notes}".Price: Firm.No fluff.Plain text only.`;

    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result_ai = await model.generateContent(prompt);
    const response = result_ai.response;
    const text_raw = response.text() || "";

    let text = text_raw;

    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
        try {
            const json = JSON.parse(text);
            if (json.description) text = json.description;
            else if (json.content) text = json.content;
        } catch (e) { /* proceed as text */ }
    }

    text = text.replace(/```(?: html | text | json) ? /gi, '').replace(/```/g, '');
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/\*\*/g, '');

    return { description: text.trim() };
}

async function handleOptimizeProductImage({ imageUrlOrBase64, itemTitle, backgroundColor = 'pure white (#FFFFFF)' }: any) {
    let base64Data = imageUrlOrBase64;

    if (imageUrlOrBase64.startsWith('http')) {
        const resp = await fetch(imageUrlOrBase64);
        const arrayBuffer = await resp.arrayBuffer();
        base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    }

    const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, "");

    const prompt = `
            TASK: STRICT BACKGROUND REMOVAL & CENTERING.
            Target Item: "${itemTitle || "The main central object"}".
            
            ACTION PLAN:
    1. CUT OUT the target item precisely.
            2. PLACE it on a ${backgroundColor} background.
            3. CENTER the item in the frame with balanced padding.
            4. LIGHTING: NEUTRAL, FLAT lighting only.Do not add dramatic shadows or highlights.

        CRITICAL "DO NOT TOUCH" RULES(ZERO TOLERANCE):
            - ** PRESERVE PIXELS:** The item itself must remain 100 % IDENTICAL to the original.
            - ** NO REPAIRS:** Do NOT fix scratches, dents, dust, rust, or tears.This is a USED item for sale; flaws MUST be visible.
            - ** NO GENERATIVE FILL:** Do NOT generate new parts of the item.If a part is cut off, leave it cut off.
            - ** NO COLOR GRADING:** Do not change the color temperature or saturation of the item.
            - ** NO TEXTURE SMOOTHING:** Do not apply "beauty filters" to the object.

        SUMMARY: Change the background to ${backgroundColor}. Move the item to the center.DO NOT TOUCH THE ITEM OTHERWISE.
            
            Return ONLY the generated image.
        `;

    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result_ai = await model.generateContent([
        { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
        { text: prompt }
    ]);

    const response = result_ai.response;

    const usage = response.usageMetadata;
    const tokenUsage = usage ? {
        input: usage.promptTokenCount || 0,
        output: usage.candidatesTokenCount || 0,
        total: usage.totalTokenCount || 0
    } : undefined;

    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return {
                    image: `data:${part.inlineData.mimeType}; base64, ${part.inlineData.data} `,
                    tokenUsage
                };
            }
        }
    }

    throw new Error("AI refused to process image.");
}

async function handleAnalyzeListing(listingData: any) {
    const model = ai.getGenerativeModel({
        model: 'gemini-2.0-flash'
    });

    const prompt = `
    Analyze this eBay listing and return a structured JSON object for optimization.
    
    Listing Data:
        - Title: ${listingData.title}
    - Current Price: ${listingData.price}
    - Category: ${listingData.category}
    - Condition: ${listingData.condition}
    - Item Specifics: ${JSON.stringify(listingData.specifics)}
    - URL: ${listingData.url}
    - Image: ${listingData.imageUrl}

    TASK:
    1. Score the Title(0 - 100) based on keyword usage and character count(Target 80).
    2. Score the Price(0 - 100) vs expected market value for ${listingData.condition} items.
    3. Generate 4 key health metrics(Title Quality, Search Rank, Market Demand, Pricing).
    4. Provide 3 - 5 Actionable Fixes.
    5. Suggest an Improved Title(EXACTLY 80 chars, Brand + Model + Specs + Condition).

    The response MUST be valid JSON(no markdown) with these keys:
    {
        "score": number,
            "metrics": [{ "label": "Title Quality", "value": number, "color": "var(--success)|var(--warning)|var(--error)" }, ...],
                "market": { "median": "string", "range": "string", "sellThrough": "string", "velocity": "High" | "Medium" | "Low" },
        "issues": [{ "type": "warning" | "info" | "success" | "error", "text": "string" }],
            "improvedTitle": "string (exactly 80 chars)",
            "searchQuery": "string (3-5 keywords optimized for eBay sold search)"
    }
    `;

    try {
        const result_ai = await model.generateContent(prompt);
        const text = result_ai.response.text();
        const parsed = extractJSON(text);

        return {
            title: listingData.title,
            price: listingData.price,
            score: parsed.score || 0,
            metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [
                { label: "Title Quality", value: 50, color: "var(--warning)" },
                { label: "Price Value", value: 50, color: "var(--warning)" },
                { label: "Search Rank", value: 50, color: "var(--warning)" },
                { label: "Market Demand", value: 50, color: "var(--warning)" }
            ],
            market: parsed.market || { median: "---", range: "---", sellThrough: "---", velocity: "Medium" },
            issues: Array.isArray(parsed.issues) ? parsed.issues : [{ type: "info", text: "Optimizing listing data..." }],
            improvedTitle: parsed.improvedTitle || listingData.title,
            searchQuery: parsed.searchQuery || listingData.title
        };
    } catch (e) {
        console.error("AI Analysis Failed:", e);
        return {
            title: listingData.title,
            price: listingData.price,
            score: 0,
            metrics: [
                { label: "Title Quality", value: 0, color: "var(--error)" },
                { label: "Price Value", value: 0, color: "var(--error)" },
                { label: "Search Rank", value: 0, color: "var(--error)" },
                { label: "Market Demand", value: 0, color: "var(--error)" }
            ],
            market: { median: "N/A", range: "N/A", sellThrough: "N/A", velocity: "Medium" },
            issues: [{ type: "error", text: "Failed to generate AI insights. Please try again." }],
            improvedTitle: listingData.title
        };
    }
}
