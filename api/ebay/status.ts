
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { userId } = req.query;

  if (!userId) return res.status(400).json({ connected: false });

  try {
    // Check if we have a token for this user
    // We use limit(1) instead of single() to avoid errors if 0 or >1 rows are returned.
    const { data } = await supabase
      .from('integration_tokens')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', 'ebay')
      .limit(1);

    // If data exists and has at least one entry, we are connected.
    return res.status(200).json({
      connected: !!(data && data.length > 0),
      debug: {
        userIdReceived: userId,
        rowCount: data?.length,
        error: null
      }
    });
  } catch (error: any) {
    return res.status(200).json({
      connected: false,
      debug: {
        userIdReceived: userId,
        rowCount: 0,
        error: error.message
      }
    });
  }
}
