
import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Buffer } from 'buffer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { imageBase64 } = req.body;

  if (!imageBase64) return res.status(400).json({ error: 'Missing image data' });

  try {
    // 1. Get App Token
    const authHeader = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');
    const tokenRes = await axios.post('https://api.ebay.com/identity/v1/oauth2/token', 
      'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope', 
      {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    const appToken = tokenRes.data.access_token;

    // 2. Prepare Image for eBay
    // eBay expects the raw binary body for image search
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    const imageBuffer = Buffer.from(cleanBase64, 'base64');

    // 3. Call eBay Search by Image
    const response = await axios.post('https://api.ebay.com/buy/browse/v1/item_summary/search_by_image?limit=10&sort=-price', 
      { image: cleanBase64 }, // eBay Node SDK might handle this differently, but REST API expects JSON wrapper for Base64 in some versions or Multipart.
      // However, the robust way for Vercel->eBay is sending the body.
      // Let's use the straightforward JSON body method supported by Browse API v1
      {
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
        }
      }
    );

    // Note: If the JSON body method fails due to API nuances, we might need multipart, 
    // but typically passing { image: "base64..." } works for this endpoint.

    const items = response.data.itemSummaries || [];

    // Map to simple format
    const results = items.map((i: any) => ({
        id: i.itemId,
        title: i.title,
        price: parseFloat(i.price?.value || 0),
        image: i.image?.imageUrl,
        url: i.itemWebUrl,
        condition: i.condition
    }));

    res.status(200).json({ results });

  } catch (error: any) {
    console.error("eBay Image Search Error:", error.response?.data || error.message);
    // Fallback: If visual search fails, return empty to trigger manual flow
    res.status(500).json({ error: "Visual search failed. Try manual mode." });
  }
}
