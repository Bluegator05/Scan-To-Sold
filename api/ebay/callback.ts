
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { Buffer } from 'buffer';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code, state, error, error_description } = req.query;

  // 1. Handle explicit errors returned by eBay (e.g., User Denied Access)
  if (error) {
    console.error("eBay Auth Error (Callback):", error, error_description);
    return res.status(400).send(`eBay Connection Failed: ${error_description || error}`);
  }

  // 2. Handle missing parameters
  if (!code || !state) {
    console.error("Callback received missing params:", req.query);
    return res.status(400).send('Error: Missing code or state parameters from eBay redirect.');
  }

  let userId = state as string;
  let platform = 'web';

  // Try to parse JSON state (new format)
  try {
    const stateObj = JSON.parse(state as string);
    userId = stateObj.userId;
    platform = stateObj.platform;
  } catch (e) {
    // Fallback to old format (just userId string)
    userId = state as string;
  }

  try {
    // 3. Prepare Data for Token Exchange
    const payload = new URLSearchParams();
    payload.append('grant_type', 'authorization_code');
    payload.append('code', code as string);
    payload.append('redirect_uri', process.env.EBAY_RU_NAME!);

    // 4. Exchange Code for Access Token
    const tokenResponse = await axios.post(
      'https://api.ebay.com/identity/v1/oauth2/token',
      payload,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`
          ).toString('base64')}`,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

    // 5. Save Tokens to Supabase
    const { error: dbError } = await supabase.from('integration_tokens').upsert({
      user_id: userId,
      access_token,
      refresh_token,
      token_expires_at: expiresAt,
      platform: 'ebay',
      updated_at: new Date()
    }, {
      onConflict: 'user_id, platform'
    });

    if (dbError) {
      console.error('Supabase Write Error:', dbError);
      throw new Error('Failed to save token to database');
    }

    // 6. Success Page (Soft Landing)
    const debugInfo = `Platform: ${platform} | UserID: ${userId} | State: ${state}`;

    // If Native App, redirect to custom scheme
    if (platform === 'native') {
      res.setHeader('Content-Type', 'text/html');
      res.send(`
          <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { background: #0f172a; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
                    .btn { display: inline-block; background: #39ff14; color: #000; padding: 15px 30px; border-radius: 25px; text-decoration: none; font-weight: bold; margin-top: 20px; font-size: 18px; }
                    p { color: #94a3b8; margin: 10px 0; }
                </style>
            </head>
            <body>
              <h2>Almost there!</h2>
              <p>If the app didn't open automatically, click below:</p>
              <a class="btn" href="scantosold://ebay-callback">Open App</a>
              
              <p style="font-size: 10px; color: #ccc; margin-top: 50px;">${debugInfo}</p>
              <script>
                setTimeout(() => {
                    window.location.href = 'scantosold://ebay-callback';
                }, 1000);
              </script>
            </body>
          </html>
        `);
      return;
    }

    // Default Web Redirect
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <html>
        <head>
          <title>Connected!</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { background: #0f172a; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            h2 { color: #39ff14; margin-bottom: 10px; }
            p { color: #94a3b8; }
            .debug { margin-top: 20px; font-family: monospace; font-size: 12px; color: #64748b; background: #1e293b; padding: 10px; border-radius: 5px; max-width: 90%; word-break: break-all; }
          </style>
        </head>
        <body>
          <h2>Successfully Connected!</h2>
          <p>Taking you back to the app...</p>
          <div class="debug">
            DEBUG INFO:<br>
            ${debugInfo}
          </div>
          <script>
            // Signal the frontend that connection is complete
            localStorage.setItem('sts_ebay_connected', 'true');
            
            // Redirect back to home after a brief delay
            setTimeout(() => {
               window.location.href = '/';
            }, 3000); // Increased delay to read debug info
          </script>
        </body>
      </html>
    `);

  } catch (err: any) {
    console.error('eBay Auth Error:', err.response?.data || err.message);
    const msg = err.response?.data?.error_description || err.message;
    res.status(500).send(`Connection failed: ${msg}`);
  }
}
