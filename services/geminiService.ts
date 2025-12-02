
import { GoogleGenAI } from "@google/genai";
import { ScoutResult } from "../types";

// Initialize Gemini Client
// Support both process.env (AI Studio) and import.meta.env (Vite/Web)
// @ts-ignore - import.meta is valid in ESM environments
const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;

if (!apiKey) {
  console.warn("API Key not found. Ensure process.env.API_KEY or VITE_API_KEY is set.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const analyzeItemImage = async (base64Image: string, knownBarcode?: string, isBulkMode: boolean = false): Promise<ScoutResult> => {
  try {
    // Remove header if present
    const cleanBase64 = base64Image.split(',')[1];

    // Feature 4: Death Pile / Bulk Mode Prompt
    const bulkInstruction = `
      MODE: BULK LOT / DEATH PILE ANALYSIS
      - The image contains multiple items (a "lot" or "pile").
      - DO NOT focus on a single item. Identify the collective group (e.g., "Lot of 15 assorted power cables", "Box of vintage toys", "Pile of mixed remote controls").
      - 'itemTitle' should be a descriptive title for the entire lot.
      - 'estimatedSoldPrice' should be the conservative total value if sold as ONE lot on eBay.
      - 'estimatedShippingCost' should be higher, reflecting a box of items (default to $15-$25 range if unsure).
    `;

    // Strict Barcode Instruction
    const standardInstruction = knownBarcode 
      ? `*** SEARCH STRATEGY: BARCODE PRIORITY WITH VISUAL FALLBACK ***

         Target Barcode: "${knownBarcode}"

         STEP 1: INITIAL SEARCH (STRICT BARCODE)
         - Execute Google Search using ONLY the barcode: "${knownBarcode}"
         - Execute Google Search using: "${knownBarcode} ebay sold"
         - DO NOT include any visual terms in these initial searches.

         STEP 2: EVALUATE & RE-SEARCH (IF NEEDED)
         - Check the search results from Step 1.
         - RESULT: SUCCESS if specific product found. Use that data.
         - RESULT: FAILURE if 0 results or only generic UPC databases found.
         - ON FAILURE: You MUST perform a new search using the visual item title derived from the image (e.g., "Nike Air Max 90 Red").
         
         CRITICAL: If the barcode yields no results, you MUST fallback to the visual title search to find the Sold Price and Shipping Weight. Do not return $0 just because the barcode failed.

         STEP 3: PRICE & SHIPPING (USPS WEIGHT BASED)
         - Locate ITEM WEIGHT in the search results.
         - Calculate 'estimatedShippingCost' based on the weight using these USPS Ground Advantage rates:
             * 0-4 oz: $5.00
             * 4-8 oz: $6.50
             * 8-12 oz: $8.00
             * 12oz-1lb: $9.50
             * 1-2 lbs: $12.00
             * 2-3 lbs: $15.00
             * 3-4 lbs: $18.00
             * 4-5 lbs: $22.00
             * 5+ lbs: $25.00 + ($3/lb)
         - If weight is missing, estimate based on visual object type.
         - 'estimatedSoldPrice' should be the average sold price (excluding shipping).

         STEP 4: DATA EXTRACTION
         - 'itemTitle': The precise product name found (via barcode or visual fallback).
         - 'priceSourceUri': The exact URL of the listing used for pricing.`
      : `PHASE: VISUAL IDENTIFICATION ONLY
         - No barcode provided. Analyze the image visually.
         - Identify Brand, Model, Edition.
         - Search for the item to find weight and market value.
         - Estimate Shipping using these USPS Ground Advantage rates:
             * 0-4 oz: $5.00
             * 4-8 oz: $6.50
             * 8-12 oz: $8.00
             * 12oz-1lb: $9.50
             * 1-2 lbs: $12.00
             * 2-3 lbs: $15.00
             * 3-4 lbs: $18.00
             * 4-5 lbs: $22.00
             * 5+ lbs: $25.00 + ($3/lb)`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: `Analyze this item for a reseller.
            
            ${isBulkMode ? bulkInstruction : standardInstruction}

            OUTPUT FORMAT (JSON ONLY):
            {
              "itemTitle": "String (Exact Official Title)",
              "barcode": "${knownBarcode || ""}",
              "estimatedSoldPrice": Number,
              "estimatedShippingCost": Number,
              "priceSourceUri": "String (URL)",
              "confidence": Number (0-100),
              "description": "String (Brief summary of findings)"
            }`
          }
        ]
      },
      config: {
        // Grounding is essential for accurate pricing
        tools: [{ googleSearch: {} }],
        systemInstruction: "You are an expert reseller assistant. You strictly follow the search strategy: Barcode first, then Visual. You provide accurate shipping estimates based on weight.",
      },
    });

    return parseGeminiResponse(response, knownBarcode, isBulkMode);

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return createErrorResult();
  }
};

// NEW: Manual Text/UPC Search
export const analyzeItemText = async (query: string): Promise<ScoutResult> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [{
          text: `
            Analyze this item based on the manual search query: "${query}".

            TASK:
            1. IDENTIFY: Determine the specific product (Brand, Model, Title).
            2. SEARCH: Use Google Search to find "Sold" listings (eBay, Mercari) for this item.
            3. ESTIMATE: 
               - 'estimatedSoldPrice': The average market value (excluding shipping).
               - 'estimatedShippingCost': Estimate based on typical item weight (USPS Ground Advantage rates).
            
            OUTPUT FORMAT (JSON ONLY):
            {
              "itemTitle": "String (Exact Official Title)",
              "barcode": "${/^\d+$/.test(query) ? query : ""}",
              "estimatedSoldPrice": Number,
              "estimatedShippingCost": Number,
              "priceSourceUri": "String (URL)",
              "confidence": Number (0-100),
              "description": "String (Brief summary of findings)"
            }
          `
        }]
      },
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction: "You are an expert reseller assistant. Find accurate sold prices.",
      },
    });

    return parseGeminiResponse(response, /^\d+$/.test(query) ? query : undefined);

  } catch (error) {
    console.error("Gemini Text Analysis Error:", error);
    return createErrorResult();
  }
};

// Helper to parse response
const parseGeminiResponse = (response: any, knownBarcode?: string, isBulkMode?: boolean): ScoutResult => {
    const text = response.text || "{}";
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let result: ScoutResult;
    try {
      result = JSON.parse(cleanText) as ScoutResult;
    } catch (e) {
      console.error("Failed to parse JSON:", cleanText);
      result = {
        itemTitle: "Item Identified (Parse Error)",
        estimatedSoldPrice: 0,
        estimatedShippingCost: 10,
        confidence: 0,
        description: cleanText.substring(0, 100),
        listingSources: []
      };
    }

    // Sanitize barcode field
    if (result.barcode && (result.barcode === "null" || result.barcode.toLowerCase() === "null" || result.barcode.trim() === "")) {
      delete result.barcode;
    }
    
    if (isBulkMode) {
        result.isBulkLot = true;
    }

    result.listingSources = [];

    // Extract Grounding Metadata
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      const sources = groundingChunks
        .filter((chunk: any) => chunk.web && chunk.web.uri && chunk.web.title)
        .map((chunk: any) => ({
          title: chunk.web!.title!,
          uri: chunk.web!.uri!
        }));
      
      const uniqueSourcesMap = new Map<string, { title: string; uri: string }>();
      sources.forEach((source: any) => {
        uniqueSourcesMap.set(source.uri, source);
      });
      result.listingSources = Array.from(uniqueSourcesMap.values());
    }

    if (knownBarcode) {
      result.barcode = knownBarcode;
      if (!result.itemTitle.includes("Parse Error")) {
        result.confidence = Math.max(result.confidence, 90);
      }
    }

    return result;
}

const createErrorResult = (): ScoutResult => ({
  itemTitle: "Connection Failed",
  estimatedSoldPrice: 0,
  estimatedShippingCost: 0,
  confidence: 0,
  description: "Could not connect to analysis service.",
  listingSources: []
});

// Feature 1: AI Listing Generator
export const generateListingDescription = async (title: string, conditionNotes: string, platform: 'EBAY' | 'FACEBOOK'): Promise<string> => {
  try {
    const prompt = platform === 'EBAY' 
      ? `Write a professional eBay listing title (max 80 chars) and description for: "${title}".
         Condition Notes: "${conditionNotes}".
         Style: Professional, SEO-focused, bullet points for features. Include a "Shipping" and "Returns" placeholder section.`
      : `Write a catchy Facebook Marketplace listing for: "${title}".
         Condition Notes: "${conditionNotes}".
         Style: Casual, friendly, urgency. Use 3-5 relevant emojis. Include 10 relevant hashtags at the bottom.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [{ text: prompt }]
      }
    });

    return response.text || "Could not generate listing.";
  } catch (error) {
    console.error("Listing Gen Error:", error);
    return "Error generating listing description.";
  }
};
    