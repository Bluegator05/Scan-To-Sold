-- Add usage tracking columns to profiles table
-- This enables server-side enforcement of subscription limits

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS total_scans INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_optimizations INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_scans_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_optimizations_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reset_date DATE DEFAULT CURRENT_DATE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_reset_date ON profiles(last_reset_date);

-- Add comment for documentation
COMMENT ON COLUMN profiles.total_scans IS 'Lifetime total scans (for FREE tier 15-scan limit)';
COMMENT ON COLUMN profiles.total_optimizations IS 'Lifetime total image optimizations';
COMMENT ON COLUMN profiles.daily_scans_count IS 'Scans performed today (resets daily)';
COMMENT ON COLUMN profiles.daily_optimizations_count IS 'Image optimizations performed today (resets daily)';
COMMENT ON COLUMN profiles.last_reset_date IS 'Last date daily counters were reset';
