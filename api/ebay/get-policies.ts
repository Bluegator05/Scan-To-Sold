
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { Buffer } from 'buffer';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const refreshAccessToken = async (refreshToken: string, userId: string) => {
  try {
    const payload = new URLSearchParams();
    payload.append('grant_type', 'refresh_token');
    payload.append('refresh_token', refreshToken);
    payload.append('scope', 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.inventory');

    const authHeader = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');

    const response = await axios.post('https://api.ebay.com/identity/v1/oauth2/token', payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${authHeader}`
      }
    });

    const { access_token, expires_in } = response.data;
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

    await supabase.from('integration_tokens').update({
      access_token: access_token,
      token_expires_at: expiresAt,
      updated_at: new Date()
    }).eq('user_id', userId).eq('platform', 'ebay');

    return access_token;
  } catch (error: any) {
    console.error("Token Refresh Failed:", error.response?.data || error.message);
    throw new Error("Failed to refresh eBay token.");
  }
};

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

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'Missing User ID' });

  try {
    const { data: tokenData } = await supabase
      .from('integration_tokens')
      .select('access_token, refresh_token, token_expires_at')
      .eq('user_id', userId)
      .eq('platform', 'ebay')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!tokenData || tokenData.length === 0) return res.status(401).json({ error: 'Not connected to eBay.' });

    let accessToken = tokenData[0].access_token;
    const refreshToken = tokenData[0].refresh_token;
    const expiresAt = new Date(tokenData[0].token_expires_at);
    const now = new Date();

    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      accessToken = await refreshAccessToken(refreshToken, userId as string);
    }

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
    };

    const [payRes, retRes, shipRes] = await Promise.all([
      axios.get('https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id=EBAY_US', { headers }),
      axios.get('https://api.ebay.com/sell/account/v1/return_policy?marketplace_id=EBAY_US', { headers }),
      axios.get('https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US', { headers })
    ]);

    res.status(200).json({
      paymentPolicies: payRes.data.paymentPolicies || [],
      returnPolicies: retRes.data.returnPolicies || [],
      shippingPolicies: shipRes.data.fulfillmentPolicies || []
    });

  } catch (error: any) {
    console.error("Fetch Policies Error:", error.message, error.response?.data);
    res.status(500).json({ error: `Failed to fetch policies: ${error.message}` });
  }
}
