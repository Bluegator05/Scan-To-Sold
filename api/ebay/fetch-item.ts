
import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Buffer } from 'buffer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { itemId } = req.query;

  if (!itemId) return res.status(400).json({ error: 'Missing Item ID' });

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

    // 2. Fetch Item Details (Browse API)
    // We request 'return_description' to get the HTML content
    const response = await axios.get(`https://api.ebay.com/buy/browse/v1/item/${itemId}`, {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    });

    const item = response.data;

    // 3. Extract & Map Data
    // Map Aspect name/value pairs to a clean object
    const specifics: Record<string, string> = {};
    if (item.localizedAspects) {
      item.localizedAspects.forEach((aspect: any) => {
        if (aspect.name && aspect.value) {
          specifics[aspect.name] = aspect.value;
        }
      });
    }

    // Extract Weight
    let weight = "";
    if (item.packageWeightAndSize?.weight) {
      const w = item.packageWeightAndSize.weight;
      if (w.unit === 'POUND') weight = `${w.value} lbs`;
      else if (w.unit === 'OUNCE') weight = `${w.value} oz`;
      else weight = `${w.value} ${w.unit}`;
    }
    // Fallback to Item Specifics if structured data missing
    if (!weight && specifics['Weight']) {
      weight = specifics['Weight'];
    }

    // Clean description (remove complex HTML wrappers if possible, or just return raw)
    const description = item.description || "";

    // Return simplified structure
    res.status(200).json({
      title: item.title,
      price: item.price?.value,
      categoryId: item.categoryId,
      categoryPath: item.categoryPath,
      itemSpecifics: specifics,
      description: description,
      condition: item.condition,
      url: item.itemWebUrl,
      weight: weight
    });

  } catch (error: any) {
    console.error("Fetch Item Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch item details from eBay." });
  }
}
