import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  if (!userId) return res.status(400).json({ error: 'User ID required' });

  try {
    // DELETE the token row for this user
    const { error } = await supabase
      .from('integration_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'ebay');

    if (error) throw error;

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Disconnect Error:", error.message);
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
}