import { supabase } from "../lib/supabaseClient";
import { ScoutResult, ItemSpecifics } from "../types";

// Helper to create error results
const createErrorResult = (msg: string): ScoutResult => ({
  itemTitle: msg,
  estimatedSoldPrice: 0,
  estimatedShippingCost: 0,
  estimatedWeight: "0 oz",
  confidence: 0,
  description: "Error",
  listingSources: []
});

/**
 * Calls the Supabase Edge Function 'analyze-item'.
 * This completely replaces the client-side GoogleGenAI usage.
 */
async function callEdgeFunction(action: string, payload: any) {
  try {
    console.log(`[Edge] Invoking action: ${action}`);
    const { data, error } = await supabase.functions.invoke('analyze-item', {
      body: { action, payload }
    });

    if (error) {
      console.error(`[Edge] Invocation Error (${action}):`, error);
      throw new Error(error.message || `Failed to connect to AI service (${action})`);
    }

    // Check if the service returned an internal error
    if (data?.error) {
      console.error(`[Edge] Internal Logic Error (${action}):`, data.error);
      throw new Error(data.error);
    }

    console.log(`[Edge] Success (${action})`);
    return data;
  } catch (e: any) {
    console.error(`[Edge] Critical Link Error (${action}):`, e);
    throw e;
  }
}

export const analyzeItemImage = async (imageBase64: string, barcode?: string, isBulkMode: boolean = false, isLiteMode: boolean = false): Promise<ScoutResult> => {
  try {
    const result = await callEdgeFunction('analyze-image', {
      imageBase64, barcode, isBulkMode, isLiteMode
    });
    return result as ScoutResult;
  } catch (error: any) {
    console.error("Deep Analysis Catch Block:", error);
    return createErrorResult(`Connection Error: ${error.message}`);
  }
};

// --- NEW FAST PIPELINE ---

export const identifyItem = async (imageBase64: string, barcode?: string): Promise<{ itemTitle: string, searchQuery: string, listingSources: any[] }> => {
  try {
    const result = await callEdgeFunction('identify-item', { imageBase64, barcode });
    return result;
  } catch (e: any) {
    console.error("Fast ID Catch Block:", e);
    return { itemTitle: `Error: ${e.message || "Unknown"}`, searchQuery: "", listingSources: [] };
  }
};

export const analyzeItemDetails = async (imageBase64: string, identifiedTitle: string): Promise<Partial<ScoutResult>> => {
  try {
    const result = await callEdgeFunction('analyze-details', { imageBase64, identifiedTitle });
    return result;
  } catch (e) {
    return {};
  }
};

export const analyzeItemText = async (query: string): Promise<ScoutResult> => {
  try {
    const result = await callEdgeFunction('analyze-text', { query });
    return result as ScoutResult;
  } catch (e: any) {
    return createErrorResult(e.message);
  }
};

export const optimizeTitle = async (currentTitle: string): Promise<string> => {
  try {
    const result = await callEdgeFunction('optimize-title', { currentTitle });
    return result.title || currentTitle;
  } catch (e) {
    return currentTitle;
  }
};

export const suggestItemSpecifics = async (title: string, notes: string): Promise<ItemSpecifics> => {
  try {
    const result = await callEdgeFunction('suggest-specifics', { title, notes });
    return result as ItemSpecifics;
  } catch (e) {
    return {};
  }
};

export const refinePriceAnalysis = async (title: string, condition: 'NEW' | 'USED'): Promise<number> => {
  try {
    const result = await callEdgeFunction('refine-price', { title, condition });
    return result.estimatedSoldPrice || 0;
  } catch (e) {
    return 0;
  }
};

export const generateListingDescription = async (title: string, notes: string, platform: string) => {
  try {
    const result = await callEdgeFunction('generate-description', { title, notes, platform });
    return result.description || "";
  } catch (e: any) {
    return "Error generating description.";
  }
};

export const optimizeProductImage = async (imageUrlOrBase64: string, itemTitle?: string, backgroundColor: string = 'pure white (#FFFFFF)'): Promise<{ image: string | null, tokenUsage?: { input: number, output: number, total: number } }> => {
  try {
    const result = await callEdgeFunction('optimize-image', { imageUrlOrBase64, itemTitle, backgroundColor });
    return {
      image: result.image || null,
      tokenUsage: result.tokenUsage
    };
  } catch (e: any) {
    // Detect Quota Error friendly return
    if (e.message?.includes('Quota') || e.message?.includes('Limit')) {
      throw new Error("Daily AI Image Limit Reached. Please try again later.");
    }
    throw new Error(e.message || "Optimization Failed");
  }
};

// eBay Listing Optimization (for Command Tab)
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY || '');

interface ListingData {
  title: string;
  price: string;
  category?: string;
  condition?: string;
  specifics?: any[];
  url: string;
}

interface AnalysisMetric {
  label: string;
  value: number;
  color: string;
}

interface MarketData {
  median: string;
  range: string;
  sellThrough: string;
  velocity: 'High' | 'Medium' | 'Low';
}

interface Issue {
  type: 'warning' | 'info' | 'success' | 'error';
  text: string;
}

export interface AnalysisResult {
  title: string;
  price: string;
  score: number;
  metrics: AnalysisMetric[];
  market: MarketData;
  issues: Issue[];
  improvedTitle: string;
}

export const analyzeListingWithGemini = async (listingData: ListingData): Promise<AnalysisResult | null> => {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const prompt = `
    Analyze this eBay listing and return a structured JSON object for optimization.
    Use the provided listing data, including "Item Specifics", and market context to give high-quality, actionable advice.
    CRITICAL: Acknowledge the "Condition" of the item (New vs Used). Pricing recommendations and market comparisons MUST be based on the same condition.
    Pay close attention to whether critical item specifics (like Brand, MPN, UPC, Material, etc.) are present and accurate, as these heavily influence eBay search ranking.

    Listing Data:
    - Title: ${listingData.title}
    - Current Price: ${listingData.price}
    - Category: ${listingData.category}
    - Condition: ${listingData.condition}
    - Item Specifics: ${JSON.stringify(listingData.specifics)}
    - URL: ${listingData.url}

    The response MUST be a JSON object with these EXACT keys:
    1. "title": The original product title.
    2. "price": The current price.
    3. "score": A numeric health score (0-100) based on title quality, pricing competitiveness, and metadata.
    4. "metrics": Array of 4 objects { "label": string, "value": number (0-100), "color": string }
       - Labels: "Title Quality", "Price Value", "Search Rank", "Market Demand"
       - Colors: Use "var(--success)" for >70, "var(--warning)" for 40-70, "var(--error)" for <40.
    5. "market": Object { "median": string, "range": string, "sellThrough": string, "velocity": "High" | "Medium" | "Low" }.
    6. "issues": Array of objects { "type": "warning" | "info" | "success" | "error", "text": string } explaining specific improvements.
    7. "improvedTitle": A high-converting, SEO-optimized title. 
       CRITICAL RULES:
       - MUST be a COMPLETE title with NO cut-off words (e.g., "Boo" instead of "Book" is WRONG)
       - MUST be under 80 characters total (including spaces)
       - Try to use 70-79 characters to maximize SEO while ensuring completeness
       - Include: Brand, Model, Key Features, Condition, Size/Color if applicable
       - Pack in high-value keywords but ONLY complete words
       - If a word won't fit, use a shorter alternative or omit it entirely
       Example: "Warhammer 40k Codex Adeptus Astartes Blood Angels 7th Edition Hardcover"

    Return ONLY the raw JSON object.
    `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const cleanedText = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanedText);
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return null;
  }
};
