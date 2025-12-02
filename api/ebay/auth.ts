
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { userId, platform } = req.query;

    if (!userId || userId === 'undefined' || userId === 'null') {
      return res.status(400).send('Error: User ID is missing in the request.');
    }

    // Standard Trading API Scopes (Reliable)
    const scopes = [
      'https://api.ebay.com/oauth/api_scope',
      'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
      'https://api.ebay.com/oauth/api_scope/sell.account',
      'https://api.ebay.com/oauth/api_scope/sell.inventory'
    ].join(' ');

    // Encode state with platform info
    const state = JSON.stringify({
      userId: String(userId),
      platform: platform ? String(platform) : 'web'
    });
    const redirectUri = process.env.EBAY_RU_NAME;

    if (!redirectUri) {
      throw new Error("Server Error: EBAY_RU_NAME is not defined in environment variables.");
    }

    // Construct Authorization URL with proper encoding
    const authUrl = `https://auth.ebay.com/oauth2/authorize?` +
      `client_id=${process.env.EBAY_APP_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${encodeURIComponent(state)}`;

    res.redirect(authUrl);

  } catch (error: any) {
    console.error("Auth Route Crash:", error);
    res.status(500).send(`Auth Route Crash: ${error.message}`);
  }
}
