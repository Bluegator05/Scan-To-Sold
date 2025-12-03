
import { GoogleGenAI } from "@google/genai";
import { ScoutResult, ItemSpecifics } from "../types";

// @ts-ignore
const apiKey = import.meta.env.VITE_API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

// Helper to robustly extract JSON from AI text responses
const extractJSON = (text: string): any => {
  try {
    // 1. Clean markdown wrappers if present
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    // 2. Try finding the first '{' and last '}' to isolate the object
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

export const analyzeItemImage = async (imageBase64: string, barcode?: string, isBulkMode: boolean = false, isLiteMode: boolean = false): Promise<ScoutResult> => {
  if (!apiKey) return createErrorResult("Missing API Key");

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    let prompt;
    if (isLiteMode) {
      // LITE MODE PROMPT: EXTREMELY FAST, MINIMAL DATA
      prompt = `
          Act as an expert reseller. Analyze this image.
          ${barcode ? `Barcode: ${barcode}.` : ""}
          
          TASK:
          1. Identify the item (Brand + Model + Key Variant).
          2. Create a "Comp Search Query" (Max 4-5 words). STRICTLY Brand + Model + MPN. 
             - DO NOT include colors, adjectives, "vintage", "rare", or generic words like "toy" or "electronics" unless part of the model name.
             - Example: "Sony Walkman WM-2" (NOT "Red Sony Walkman WM-2 Cassette Player").
          3. Estimate current sold price (USD).
          
          Output JSON ONLY:
          {
            "itemTitle": "string",
            "searchQuery": "string",
            "estimatedSoldPrice": number
          }
        `;
    } else {
      // NORMAL / BULK MODE PROMPT
      prompt = `
          Act as an expert reseller (eBay/flipper). Analyze this image.
          ${isBulkMode ? "MODE: BULK LOT / DEATH PILE. Identify the group of items." : "Identify the specific item."}
          ${barcode ? `Barcode provided: ${barcode}.` : ""}
          
          Task:
          1. Identify the item precisely.
          2. TITLE OPTIMIZATION: Create a "Search Optimized Title" (Max 10 words). 
             - Use ONLY: Brand + Model + Key Variant/Part Number.
             - DO NOT include filler words like "Rare", "Vintage" (unless needed for ID), "Good Condition", "Look!", or emojis.
             - Example: "Sony Walkman WM-2 Red Cassette Player" (NOT "Vintage Sony Walkman Working Rare Look")
          3. SEARCH QUERY GENERATION: Create a reduced "Comp Search Query" (Max 4-5 words).
             - Use strictly the most important keywords for finding sold comps (Brand + Model + MPN). 
             - Remove colors, adjectives, or generic words.
             - Example: "Sony Walkman WM-2" (NOT "Red Cassette Player")
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
            "barcode": "string"
          }
        `;
    }

    // Use Flash 2.5 for Image Analysis (Faster, excellent vision)
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        tools: isLiteMode ? undefined : [{ googleSearch: {} }]
      }
    });

    const text = response.text || "{}";
    let result;
    try {
      result = extractJSON(text);
    } catch (e) {
      return createErrorResult("AI Response not JSON");
    }

    const listingSources: { title: string, uri: string }[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
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
    };

  } catch (error: any) {
    console.error("Analysis Error:", error);
    return createErrorResult(error.message);
  }
};

export const analyzeItemText = async (query: string): Promise<ScoutResult> => {
  if (!apiKey) return createErrorResult("Missing API Key");

  try {
    const isBarcode = /^\d{8,14}$/.test(query.trim());

    let prompt;
    if (isBarcode) {
      // STRICT BARCODE PROMPT
      prompt = `
            You are a specialized Barcode Lookup Tool.
            TARGET BARCODE: "${query}"
            
            STRICT INSTRUCTIONS:
            1. Execute Google Search using ONLY these digits: "${query}".
            2. DO NOT add words like "item", "toy", "electronics", "dvd" to the search query. Search the raw numbers.
            3. If the number corresponds to a product, Identify it.
            4. Identify the specific product (Brand + Model + Variant).
            5. Estimate price and weight based on the EXACT match found.
            
            Return JSON: { 
                itemTitle,
                searchQuery, 
                estimatedSoldPrice, 
                estimatedShippingCost, 
                estimatedWeight, 
                description, 
                confidence, 
                marketDemand: "HIGH"|"MEDIUM"|"LOW", 
                condition: "NEW"|"USED",
                itemSpecifics: { "Brand": "", "Model": "", "Type": "" }
            }
        `;
    } else {
      prompt = `
            Identify item from query: "${query}". 
            
            TASK:
            1. Identify product (Brand + Model + Variant). No fluff.
            2. Create a comp-friendly search query.
            3. Estimate price and weight.
            4. Identify Item Specifics (Brand, Model, Type, etc).
            
            Return JSON: { 
                itemTitle, 
                searchQuery,
                estimatedSoldPrice, 
                estimatedShippingCost, 
                estimatedWeight, 
                description, 
                confidence, 
                marketDemand: "HIGH"|"MEDIUM"|"LOW", 
                condition: "NEW"|"USED",
                itemSpecifics: { "Brand": "", "Model": "", "Type": "" }
            }
        `;
    }

    // Keep Pro 3.0 for Barcode/Text logic as it follows negative constraints better
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text || "{}";
    let result;
    try {
      result = extractJSON(text);
    } catch (e) {
      return createErrorResult("AI Response Not JSON");
    }

    const listingSources: { title: string, uri: string }[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
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
  } catch (e: any) {
    return createErrorResult(e.message);
  }
};

export const optimizeTitle = async (currentTitle: string): Promise<string> => {
  if (!apiKey) return currentTitle;
  try {
    const prompt = `
      Act as an expert eBay Copywriter. Rewrite the following title to maximize search visibility (SEO).
      
      Original Title: "${currentTitle}"
      
      CRITICAL RULES:
      1. **ABSOLUTE LIMIT:** The output MUST be 80 characters or less. Count carefully.
      2. **STRUCTURE:** Brand + Model + Product Type + Key Specs/Color + Condition (if New).
      3. **KEYWORDS:** Infer high-value keywords from sold listings of similar items.
      4. **CLEANUP:** Remove punctuation, "L@@K", "Wow", emojis, or duplicate words.
      5. **FORMAT:** Title Case.
      
      If the title is too long, remove the least important words (like "Very", "Nice", "The").
      
      Return ONLY the optimized title string.
    `;
    // Use 3.0 Pro for better adherence to character limits
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: prompt }] }
    });

    let title = response.text?.trim() || currentTitle;
    // Hard safety fallback
    if (title.length > 80) {
      title = title.substring(0, 80);
    }
    return title.replace(/"/g, '');
  } catch (e) {
    console.error("Title Opt Error:", e);
    return currentTitle;
  }
};

export const suggestItemSpecifics = async (title: string, notes: string): Promise<ItemSpecifics> => {
  if (!apiKey) return {};
  try {
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

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: prompt }] },
      config: { tools: [{ googleSearch: {} }] }
    });

    const text = response.text || "{}";
    const result = extractJSON(text);
    return result;
  } catch (e) {
    console.error("Specifics Suggestion Error:", e);
    return {};
  }
};

export const refinePriceAnalysis = async (title: string, condition: 'NEW' | 'USED'): Promise<number> => {
  if (!apiKey) return 0;
  try {
    const prompt = `
      Re-evaluate the market price for this item: "${title}".
      CONDITION CHANGED TO: ${condition}.
      
      Task:
      Find the average sold price for this item specifically in ${condition} condition.
      
      Output JSON: { "estimatedSoldPrice": number }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: prompt }] },
      config: { tools: [{ googleSearch: {} }] }
    });

    const text = response.text || "{}";
    const result = extractJSON(text);
    return result.estimatedSoldPrice || 0;
  } catch (e) {
    console.error("Refine Price Error:", e);
    return 0;
  }
};

export const generateListingDescription = async (title: string, notes: string, platform: string) => {
  if (!apiKey) return "Missing API Key";

  const prompt = platform === 'EBAY'
    ? `TASK: Write a plain text listing description for eBay.
        ITEM: "${title}"
        CONDITION: "${notes}"

        CRITICAL RULES:
        1. OUTPUT FORMAT: RAW PLAIN TEXT ONLY. DO NOT return JSON. DO NOT use Markdown (no **bold**, no # headers).
        2. TONE: Strictly factual, dry, and objective. NO marketing fluff (No "Beautiful", "Stunning", "Perfect for").
        3. FORMATTING: Use simple newlines for spacing and dashes (-) for lists.
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
    : `Write a short, factual Facebook Marketplace listing for "${title}". Condition: "${notes}". Price: Firm. No fluff. Plain text only.`;

  // 2.5 Flash is sufficient for text generation (faster/cheaper)
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [{ text: prompt }] }
  });

  let text = response.text || "";

  // Clean up any accidental markdown code blocks or HTML tags or JSON wrappers
  if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
    // If AI ignored us and returned JSON, try to extract description field
    try {
      const json = JSON.parse(text);
      if (json.description) text = json.description;
      else if (json.content) text = json.content;
    } catch (e) { /* proceed as text */ }
  }

  text = text.replace(/```(?:html|text|json)?/gi, '').replace(/```/g, '');
  text = text.replace(/<[^>]*>/g, ''); // Strip any HTML tags just in case
  text = text.replace(/\*\*/g, ''); // Strip bold markdown

  return text.trim();
};

export const optimizeProductImage = async (imageUrlOrBase64: string, itemTitle?: string): Promise<{ image: string | null, tokenUsage?: { input: number, output: number, total: number } }> => {
  if (!apiKey) return { image: null };
  try {
    let base64Data = imageUrlOrBase64;

    // If input is a URL, fetch it first
    if (imageUrlOrBase64.startsWith('http')) {
      try {
        const resp = await fetch(imageUrlOrBase64);
        const blob = await resp.blob();
        base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob as Blob);
        });
      } catch (fetchErr) {
        console.error("Failed to fetch image from URL for optimization:", fetchErr);
        throw new Error("Network Error: Could not download image. Ensure CORS is enabled or upload a new photo.");
      }
    }

    const cleanBase64 = base64Data.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");

    const prompt = `
            Task: Optimize this product image for an e-commerce listing.
            Target Item: "${itemTitle || "The main central object"}".
            
            INSTRUCTIONS:
            1. REMOVE BACKGROUND: Replace the background with pure white (#FFFFFF).
            2. CENTER & CROP: Center the item and crop so it fills approx 80% of the frame.
            3. LIGHTING: Improve lighting ONLY to make the item clearly visible.
            
            CRITICAL PRESERVATION RULES (STRICT):
            - **DO NOT ALTER THE ITEM'S APPEARANCE.**
            - **DO NOT DISTRESS, AGE, OR ADD WEAR.** The item must look EXACTLY as it does in the original photo.
            - **DO NOT SMOOTH TEXTURES.** If the item has scratches, dust, or wear, KEEP THEM. The buyer needs to see the true condition.
            - **DO NOT CHANGE COLORS.** Maintain accurate colors.
            - **DO NOT ROTATE.** Keep original orientation.
            - **DO NOT HALLUCINATE.** Do not add or remove parts.
            
            Return ONLY the generated image.
        `;

    // Use 'gemini-3-pro-image-preview' for high-quality editing (better background removal & lighting)
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt }
        ]
      }
    });

    const usage = response.usageMetadata;
    const tokenUsage = usage ? {
      input: usage.promptTokenCount || 0,
      output: usage.candidatesTokenCount || 0,
      total: usage.totalTokenCount || 0
    } : undefined;

    // Iterate through parts to find the image
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return {
            image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
            tokenUsage
          };
        }
      }
    }

    if (response.text) {
      console.warn("AI returned text instead of image:", response.text);
      throw new Error("AI refused to process image. Quota limit or filter.");
    }

    return { image: null, tokenUsage };
  } catch (e: any) {
    console.error("Image Optimization Error:", e);
    // Detect Quota Error (429)
    if (e.message?.includes('429') || e.message?.includes('Quota') || e.status === 429 || e.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new Error("Daily AI Image Limit Reached. Please try again later.");
    }
    throw new Error(e.message || "Optimization Failed");
  }
};

const createErrorResult = (msg: string): ScoutResult => ({
  itemTitle: msg,
  estimatedSoldPrice: 0,
  estimatedShippingCost: 0,
  estimatedWeight: "0 oz",
  confidence: 0,
  description: "Error",
  listingSources: []
});
