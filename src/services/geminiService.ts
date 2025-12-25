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
