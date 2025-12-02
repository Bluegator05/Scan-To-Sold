
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { Buffer } from 'buffer';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const escapeXml = (unsafe: string) => {
    if (!unsafe) return '';
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
};

const parseWeight = (weightStr: string) => {
    if (!weightStr) return { major: 1, minor: 0 }; // Default 1lb
    const lower = weightStr.toLowerCase();
    let major = 0; // lbs
    let minor = 0; // oz

    // "1 lb 4 oz" or "1lb"
    const lbMatch = lower.match(/(\d+(\.\d+)?)\s*lb/);
    if (lbMatch) major = Math.floor(parseFloat(lbMatch[1]));

    const ozMatch = lower.match(/(\d+(\.\d+)?)\s*oz/);
    if (ozMatch) minor = Math.floor(parseFloat(ozMatch[1]));

    // If lbs has decimal (e.g. 1.5 lbs) -> 1 lb 8 oz
    if (lbMatch && lbMatch[1].includes('.')) {
        const decimal = parseFloat(lbMatch[1]);
        major = Math.floor(decimal);
        minor = Math.round((decimal - major) * 16);
    }

    // Fallback: just a number -> assume lbs if small, oz if large?
    // Default to 1lb if failing to parse meaningful numbers
    if (major === 0 && minor === 0) {
        const rawNum = parseFloat(lower);
        if (!isNaN(rawNum)) {
            if (rawNum < 16) return { major: 0, minor: Math.ceil(rawNum) }; // Assume oz
            return { major: 1, minor: 0 };
        }
        return { major: 1, minor: 0 };
    }

    return { major, minor };
};

const refreshAccessToken = async (refreshToken: string, userId: string) => {
    try {
        const payload = new URLSearchParams();
        payload.append('grant_type', 'refresh_token');
        payload.append('refresh_token', refreshToken);
        payload.append('scope', 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.inventory');

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
        throw new Error("Failed to refresh eBay token. Please reconnect your account in Settings.");
    }
};

const uploadEbayImage = async (accessToken: string, pictureUrlOrBase64: string): Promise<string | null> => {
    try {
        const isUrl = pictureUrlOrBase64.startsWith('http');

        let xmlBody;
        if (isUrl) {
            xmlBody = `<?xml version="1.0" encoding="utf-8"?>
       <UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
           <PictureSet>Standard</PictureSet>
           <ExtensionInDays>30</ExtensionInDays>
           <ExternalPictureURL>${escapeXml(pictureUrlOrBase64)}</ExternalPictureURL>
       </UploadSiteHostedPicturesRequest>`;
        } else {
            const cleanBase64 = pictureUrlOrBase64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '');
            xmlBody = `<?xml version="1.0" encoding="utf-8"?>
       <UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
           <PictureSet>Standard</PictureSet>
           <ExtensionInDays>30</ExtensionInDays>
           <PictureData>${cleanBase64}</PictureData>
       </UploadSiteHostedPicturesRequest>`;
        }

        const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlBody, {
            headers: {
                'X-EBAY-API-SITEID': '0',
                'X-EBAY-API-COMPATIBILITY-LEVEL': '1371',
                'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
                'X-EBAY-API-IAF-TOKEN': accessToken,
                'Content-Type': 'text/xml'
            },
            timeout: 60000
        });

        const parser = new XMLParser({ ignoreAttributes: false });
        const result = parser.parse(response.data);

        if (result?.UploadSiteHostedPicturesResponse?.Errors) {
            const errs = result.UploadSiteHostedPicturesResponse.Errors;
            console.error("eBay Image Upload Error:", JSON.stringify(errs));

            if (isUrl) {
                try {
                    const imgRes = await axios.get(pictureUrlOrBase64, { responseType: 'arraybuffer' });
                    const base64 = Buffer.from(imgRes.data, 'binary').toString('base64');
                    return await uploadEbayImage(accessToken, base64);
                } catch (downloadErr) {
                    return null;
                }
            }
            return null;
        }

        let fullUrl = result?.UploadSiteHostedPicturesResponse?.SiteHostedPictureDetails?.FullURL;
        if (!fullUrl) {
            const match = response.data.match(/<FullURL>([^<]+)<\/FullURL>/);
            if (match && match[1]) fullUrl = match[1];
        }
        return fullUrl || null;
    } catch (e) {
        console.error("Error uploading image to eBay:", e);
        return null;
    }
};

const fetchDefaultPolicies = async (accessToken: string) => {
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
    };

    try {
        const [payRes, retRes, shipRes] = await Promise.all([
            axios.get('https://api.ebay.com/sell/account/v1/payment_policy?marketplace_id=EBAY_US', { headers }),
            axios.get('https://api.ebay.com/sell/account/v1/return_policy?marketplace_id=EBAY_US', { headers }),
            axios.get('https://api.ebay.com/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US', { headers })
        ]);

        const getDef = (list: any[]) => list?.find((p: any) => p.categoryTypes?.some((c: any) => c.default)) || list?.[0];

        const payment = getDef(payRes.data.paymentPolicies);
        const returnPol = getDef(retRes.data.returnPolicies);
        const shipping = getDef(shipRes.data.fulfillmentPolicies);

        if (payment && returnPol && shipping) {
            return {
                paymentId: payment.paymentPolicyId,
                returnId: returnPol.returnPolicyId,
                shippingId: shipping.fulfillmentPolicyId
            };
        }
        return null;
    } catch (e: any) {
        return null;
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

    const { userId, item } = req.body;
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
            accessToken = await refreshAccessToken(refreshToken, userId);
        }

        const title = (item.title || "Untitled Item").substring(0, 79);
        const price = String(item.price);
        const rawDesc = item.description || "Listed via ScanToSold";

        let categoryId = '172008';
        try {
            const catRes = await axios.get(`https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(title)}`, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
            });
            if (catRes.data.categorySuggestions && catRes.data.categorySuggestions.length > 0) {
                categoryId = catRes.data.categorySuggestions[0].category.categoryId;
            }
        } catch (e) { /* warn */ }

        const allImages = [];
        if (item.imageUrl) allImages.push(item.imageUrl);
        if (item.additionalImages && Array.isArray(item.additionalImages)) {
            allImages.push(...item.additionalImages);
        }

        const hostedUrls: string[] = [];
        let imageWarning = '';

        for (const img of allImages) {
            if (!img) continue;
            const hosted = await uploadEbayImage(accessToken, img);
            if (hosted) {
                hostedUrls.push(hosted);
            } else {
                imageWarning = ' (Some images failed to upload)';
            }
        }

        let pictureDetailsBlock = '<PictureDetails>';
        if (hostedUrls.length > 0) {
            hostedUrls.forEach(url => {
                pictureDetailsBlock += `<PictureURL>${url}</PictureURL>`;
            });
        } else {
            pictureDetailsBlock += `<PictureURL>https://upload.wikimedia.org/wikipedia/commons/1/14/No_Image_Available.jpg</PictureURL>`;
        }
        pictureDetailsBlock += '</PictureDetails>';

        let policyIds = {
            paymentId: item.ebayPaymentPolicyId,
            returnId: item.ebayReturnPolicyId,
            shippingId: item.ebayShippingPolicyId
        };

        if (!policyIds.paymentId || !policyIds.returnId || !policyIds.shippingId) {
            const defaults = await fetchDefaultPolicies(accessToken);
            if (defaults) {
                if (!policyIds.paymentId) policyIds.paymentId = defaults.paymentId;
                if (!policyIds.returnId) policyIds.returnId = defaults.returnId;
                if (!policyIds.shippingId) policyIds.shippingId = defaults.shippingId;
            }
        }

        if (!policyIds.paymentId || !policyIds.shippingId || !policyIds.returnId) {
            throw new Error("Could not determine eBay Business Policies. Please configure policies on eBay.");
        }

        // Description: Plain Text converted to HTML.
        const descriptionHTML = `<font face="Arial" size="4"><p>${escapeXml(rawDesc).replace(/\n/g, '<br>')}</p></font>`;

        let conditionId = '3000';
        const cText = (item.condition || '').toLowerCase();
        if (cText.includes('new') || cText.includes('sealed')) conditionId = '1000';
        else if (cText.includes('parts') || cText.includes('repair')) conditionId = '7000';

        const policyXmlBlock = `
        <SellerProfiles>
            <SellerPaymentProfile>
                <PaymentProfileID>${policyIds.paymentId}</PaymentProfileID>
            </SellerPaymentProfile>
            <SellerReturnProfile>
                <ReturnProfileID>${policyIds.returnId}</ReturnProfileID>
            </SellerReturnProfile>
            <SellerShippingProfile>
                <ShippingProfileID>${policyIds.shippingId}</ShippingProfileID>
            </SellerShippingProfile>
        </SellerProfiles>`;

        const specifics = item.itemSpecifics || {};
        if (!specifics.Brand) specifics.Brand = "Unbranded";
        if (!specifics.Type) specifics.Type = "Other";

        const weightStr = specifics.Weight || item.weight || "1 lb 0 oz";
        const { major, minor } = parseWeight(weightStr);

        let specificsXml = '<ItemSpecifics>';
        for (const [key, val] of Object.entries(specifics)) {
            if (key !== 'Weight' && val && typeof val === 'string' && val.trim() !== '') {
                specificsXml += `
            <NameValueList>
                <Name>${escapeXml(key)}</Name>
                <Value>${escapeXml(val)}</Value>
            </NameValueList>`;
            }
        }
        specificsXml += '</ItemSpecifics>';

        // Construct SKU: Unit - Bin - Cost - Date
        let customSku = `${item.storageUnitId}`;
        if (item.binLocation) customSku += `-${item.binLocation}`;

        // FIX: Safety Check for CNaN
        if (item.costCode && !item.costCode.includes('NaN')) {
            customSku += `-${item.costCode}`;
        }

        // FIX: Append Date (MMDD)
        const dateObj = new Date();
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const day = dateObj.getDate().toString().padStart(2, '0');
        customSku += `-${month}${day}`;

        const postalCode = item.postalCode || "95125";

        const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
    <AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <ErrorLanguage>en_US</ErrorLanguage>
        <WarningLevel>High</WarningLevel>
        <Item>
            <Title>${escapeXml(title)}</Title>
            <SKU>${escapeXml(customSku)}</SKU>
            <Description><![CDATA[${descriptionHTML}]]></Description>
            <PrimaryCategory><CategoryID>${categoryId}</CategoryID></PrimaryCategory>
            <StartPrice currencyID="USD">${price}</StartPrice>
            <ConditionID>${conditionId}</ConditionID>
            <Country>US</Country>
            <Currency>USD</Currency>
            <DispatchTimeMax>3</DispatchTimeMax>
            <ListingDuration>GTC</ListingDuration>
            <ListingType>FixedPriceItem</ListingType>
            ${pictureDetailsBlock}
            ${specificsXml}
            <ShippingPackageDetails>
                <ShippingPackage>PackageThickEnvelope</ShippingPackage>
                <WeightMajor unit="lbs">${major}</WeightMajor>
                <WeightMinor unit="oz">${minor}</WeightMinor>
            </ShippingPackageDetails>
            <ShipToLocations>US</ShipToLocations>
            <PostalCode>${escapeXml(postalCode)}</PostalCode>
            <Quantity>1</Quantity>
            <Site>US</Site>
            ${policyXmlBlock}
        </Item>
    </AddFixedPriceItemRequest>`;

        const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlBody, {
            headers: {
                'X-EBAY-API-SITEID': '0',
                'X-EBAY-API-COMPATIBILITY-LEVEL': '1371',
                'X-EBAY-API-CALL-NAME': 'AddFixedPriceItem',
                'X-EBAY-API-IAF-TOKEN': accessToken,
                'Content-Type': 'text/xml'
            }
        });

        const parser = new XMLParser();
        const result = parser.parse(response.data);
        const ack = result.AddFixedPriceItemResponse?.Ack;

        if (ack === 'Success' || ack === 'Warning') {
            const itemId = result.AddFixedPriceItemResponse.ItemID;
            // Return URL correctly
            const inventoryUrl = `https://www.ebay.com/itm/${itemId}`;
            return res.status(200).json({
                success: true,
                itemId: itemId,
                inventoryUrl: inventoryUrl,
                message: `Item Listed Successfully!${imageWarning}`,
                isDraft: false
            });
        } else {
            const errs = result.AddFixedPriceItemResponse?.Errors;
            const msg = Array.isArray(errs) ? errs[0].LongMessage : errs?.LongMessage;

            if (msg && msg.includes('agreement')) {
                return res.status(200).json({
                    success: false,
                    actionRequiredUrl: 'https://useragreement.ebay.com/usragmt/agreement/APM_USER_AGREEMENT?ru=http%3A%2F%2Fmy.ebay.com%2Fws%2FeBayISAPI.dll%3FMyEbay&fId=4',
                    message: "You must accept the eBay User Agreement."
                });
            }

            throw new Error(msg || "eBay API Error");
        }

    } catch (error: any) {
        console.error("Listing Error:", error.message, error.response?.data);
        res.status(500).json({ error: `Action Failed: ${error.message}` });
    }
}
