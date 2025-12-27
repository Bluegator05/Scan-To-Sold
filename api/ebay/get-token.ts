
import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Buffer } from 'buffer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const appId = (process.env.EBAY_APP_ID || '').trim();
    const certId = (process.env.EBAY_CERT_ID || '').trim();

    try {
        const authHeader = Buffer.from(`${appId}:${certId}`).toString('base64');
        const tokenParams = new URLSearchParams();
        tokenParams.append('grant_type', 'client_credentials');
        tokenParams.append('scope', 'https://api.ebay.com/oauth/api_scope');

        const tokenRes = await axios.post('https://api.ebay.com/identity/v1/oauth2/token', tokenParams, {
            headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        res.status(200).json({ token: tokenRes.data.access_token });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
}
