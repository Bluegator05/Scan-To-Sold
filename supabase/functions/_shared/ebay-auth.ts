// eBay OAuth Token Management
// Handles token generation and caching for eBay API calls

let accessToken: string | null = null;
let tokenExpiry: number = 0;

export async function getEbayToken(): Promise<string> {
    // Return cached token if still valid
    if (accessToken && Date.now() < tokenExpiry) {
        return accessToken;
    }

    const clientId = Deno.env.get('EBAY_APP_ID');
    const clientSecret = Deno.env.get('EBAY_CERT_ID');

    if (!clientId || !clientSecret) {
        throw new Error('eBay OAuth credentials not configured');
    }

    const auth = btoa(`${clientId}:${clientSecret}`);

    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
    });

    if (!response.ok) {
        throw new Error(`eBay OAuth failed: ${response.status}`);
    }

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 60s early

    return accessToken;
}
