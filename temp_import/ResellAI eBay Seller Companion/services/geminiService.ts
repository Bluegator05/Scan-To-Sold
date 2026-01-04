import { GoogleGenAI, Type } from "@google/genai";
import { ItemAnalysis, MarketAnalysis } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Step 1: Analyze the image to identify the item.
 * Uses gemini-2.5-flash for fast multimodal analysis.
 */
export const identifyItem = async (base64Image: string): Promise<ItemAnalysis> => {
  const model = "gemini-2.5-flash";
  
  const prompt = `
    You are an expert eBay reseller assistant. Analyze the image to identify the item.

    CRITICAL INSTRUCTION FOR 'keywords':
    - The 'keywords' field determines the market analysis search.
    - IT MUST BE A STRICT SEARCH QUERY.
    - DO NOT include uncertainty (e.g., "likely", "maybe", "7/8").
    - DO NOT include condition (e.g., "used", "good", "broken").
    - DO NOT include generic words like "smartwatch" if the model is known.
    - FORMAT: Brand + Model + Series + [Size/Color if clear].
    - Example Bad: "Apple Watch Series (Likely 7 or 8) Used"
    - Example Good: "Apple Watch Series 7 Aluminum Midnight"
    - If unsure of the model (e.g. Series 7 vs 8), pick the older one as a baseline or omit the series number if they look identical.

    Output JSON with:
    - title: A rich, descriptive title for the listing (can mention uncertainty or condition).
    - keywords: The strict 3-6 word search query.
    - category, condition, description, features, estimatedValue.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "A concise, SEO-friendly title for the listing" },
            keywords: { type: Type.STRING, description: "Strict, short search query (Brand Model Variant) - NO 'used' or 'likely'" },
            category: { type: Type.STRING },
            condition: { type: Type.STRING, description: "Visual condition assessment (e.g., New, Used, Damaged)" },
            description: { type: Type.STRING, description: "Short sales description highlighting key features and flaws if any" },
            features: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Key features list" },
            estimatedValue: {
              type: Type.OBJECT,
              properties: {
                min: { type: Type.NUMBER },
                max: { type: Type.NUMBER },
                currency: { type: Type.STRING }
              }
            }
          }
        }
      }
    });

    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text) as ItemAnalysis;

  } catch (error) {
    console.error("Identification failed:", error);
    throw error;
  }
};

/**
 * Step 2: Use Google Search Grounding to find real-world market data.
 * Returns listings and an estimated Sell Through Rate with counts.
 */
export const fetchMarketComps = async (query: string): Promise<MarketAnalysis> => {
  const model = "gemini-2.5-flash";
  
  // Revised prompt: Prioritize finding listings first, then estimating totals. 
  // Simplified instructions to prevent model refusal or confusion.
  const searchPrompt = `
    Item: "${query}"
    
    Task: Conduct market research on eBay to find comparable listings and estimate market demand.
    
    IMPORTANT: If the item name is generic, search for the most popular variants.
    
    Steps:
    1. Search for 15 specific "sold" listings (recent) and 15 "active" listings (current) for this item.
    2. Create a list of these specific items with their prices, titles, and links.
    3. Based on the search results, ESTIMATE the total number of active listings vs sold listings (in the last 90 days). 
       (e.g., if you see many pages of results, estimate the total count. If results are few, use the exact count).
    4. Calculate Sell-Through Rate (Sold / Active * 100).

    Output:
    Return ONLY a JSON object. Do not use markdown.

    {
      "listings": [
        { "source": "eBay", "title": "Item Title", "price": 10.99, "type": "sold", "link": "https://..." },
        { "source": "eBay", "title": "Item Title", "price": 12.50, "type": "active", "link": "https://..." }
      ],
      "activeCount": 100,
      "soldCount": 50,
      "sellThroughRate": 50,
      "marketStatus": "Balanced"
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        // responseMimeType is NOT supported when using tools. 
      }
    });

    let text = response.text;
    const defaultResult: MarketAnalysis = { 
        listings: [], 
        sellThroughRate: 0, 
        activeCount: 0, 
        soldCount: 0, 
        marketStatus: 'Slow' 
    };

    if (!text) {
        console.warn("Empty response from market analysis");
        return defaultResult;
    }
    
    // Clean up markdown code blocks if present (standardizes output)
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    // Check for refusals
    if (text.toLowerCase().includes("i cannot") || text.toLowerCase().includes("unable to")) {
       console.error("AI Refusal:", text);
       // Do not throw, return default so user can at least see the ID'd item
       return defaultResult;
    }

    try {
      const parsed = JSON.parse(text) as MarketAnalysis;
      
      // Safety: Ensure arrays exist
      if (!parsed.listings) parsed.listings = [];
      
      // Fallback: If AI returns 0 for counts but found listings, use listing count as floor
      const activeFound = parsed.listings.filter(l => l.type === 'active').length;
      const soldFound = parsed.listings.filter(l => l.type === 'sold').length;
      
      if (parsed.activeCount < activeFound) parsed.activeCount = activeFound;
      if (parsed.soldCount < soldFound) parsed.soldCount = soldFound;

      return parsed;

    } catch (e) {
      console.error("JSON Parse Error:", e, "Raw Text:", text);
      return defaultResult;
    }

  } catch (error) {
    console.error("Market analysis failed:", error);
    return { 
        listings: [], 
        sellThroughRate: 0, 
        activeCount: 0, 
        soldCount: 0, 
        marketStatus: 'Slow' 
    };
  }
};