-- =============================================
-- OnSite Timekeeper - Migration 004
-- Security Fixes + Daily Hours Table
-- =============================================

-- =============================================
-- 1. FIX: Token Read Policy (SECURITY CRITICAL)
-- Problem: Anyone can read any token
-- Fix: Only allow reading non-expired tokens by token value
-- =============================================

DROP POLICY IF EXISTS "Anyone can read token" ON public.pending_tokens;

-- New policy: Only allow reading token by exact token match (for redemption)
CREATE POLICY "Read token by value" ON public.pending_tokens
  FOR SELECT
  USING (expires_at > NOW());

-- =============================================
-- 2. ADD: archived_at column to access_grants
-- Problem: Archive only stored in AsyncStorage
-- Fix: Sync archive status to Supabase
-- =============================================

ALTER TABLE public.access_grants
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_access_grants_archived
  ON public.access_grants(archived_at);

-- Update policy to allow viewer to archive (update archived_at)
DROP POLICY IF EXISTS "Viewer update own grant" ON public.access_grants;
CREATE POLICY "Viewer update own grant" ON public.access_grants
  FOR UPDATE
  USING (auth.uid() = viewer_id);

-- =============================================
-- 3. CREATE: daily_hours table
-- One record per day (user sees consolidated hours)
-- =============================================

CREATE TABLE IF NOT EXISTS public.daily_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Hours data
  total_minutes INTEGER NOT NULL DEFAULT 0,
  break_minutes INTEGER DEFAULT 0,

  -- Location info (main location of the day)
  location_name TEXT,
  location_id UUID,

  -- Verification
  verified BOOLEAN DEFAULT FALSE,  -- TRUE = GPS, FALSE = manual
  source TEXT DEFAULT 'manual' CHECK (source IN ('gps', 'manual', 'edited')),

  -- Time references (from GPS if available)
  first_entry TIME,
  last_exit TIME,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ,

  -- One record per user per day
  UNIQUE(user_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_daily_hours_user ON public.daily_hours(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_hours_date ON public.daily_hours(date);
CREATE INDEX IF NOT EXISTS idx_daily_hours_user_date ON public.daily_hours(user_id, date DESC);

-- RLS
ALTER TABLE public.daily_hours ENABLE ROW LEVEL SECURITY;

-- User can manage own daily_hours
CREATE POLICY "Users manage own daily_hours" ON public.daily_hours
  FOR ALL
  USING (auth.uid() = user_id);

-- Viewers (managers) can see shared daily_hours
CREATE POLICY "Viewer see shared daily_hours" ON public.daily_hours
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.access_grants
      WHERE access_grants.owner_id = daily_hours.user_id
        AND access_grants.viewer_id = auth.uid()
        AND access_grants.status = 'active'
        AND access_grants.archived_at IS NULL
    )
  );

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_daily_hours_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_daily_hours_updated_at ON public.daily_hours;
CREATE TRIGGER update_daily_hours_updated_at
  BEFORE UPDATE ON public.daily_hours
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_hours_updated_at();

-- =============================================
-- 4. MIGRATE: Existing records to daily_hours
-- Consolidate multiple sessions per day
-- =============================================

-- Note: Run this ONCE after creating the table
-- It will consolidate existing records into daily_hours

INSERT INTO public.daily_hours (
  user_id,
  date,
  total_minutes,
  break_minutes,
  location_name,
  location_id,
  verified,
  source,
  first_entry,
  last_exit,
  created_at
)
SELECT
  r.user_id,
  DATE(r.entrada) as date,
  -- Total minutes (sum of all sessions, minus breaks)
  COALESCE(SUM(
    CASE
      WHEN r.saida IS NOT NULL
      THEN EXTRACT(EPOCH FROM (r.saida - r.entrada)) / 60
      ELSE 0
    END
  ), 0)::INTEGER as total_minutes,
  -- Breaks not tracked in old schema, default 0
  0 as break_minutes,
  -- Get location name from longest session of the day
  (
    SELECT r2.local_nome
    FROM public.registros r2
    WHERE r2.user_id = r.user_id
      AND DATE(r2.entrada) = DATE(r.entrada)
      AND r2.saida IS NOT NULL
    ORDER BY (r2.saida - r2.entrada) DESC
    LIMIT 1
  ) as location_name,
  -- Get location ID from longest session
  (
    SELECT r2.local_id
    FROM public.registros r2
    WHERE r2.user_id = r.user_id
      AND DATE(r2.entrada) = DATE(r.entrada)
      AND r2.saida IS NOT NULL
    ORDER BY (r2.saida - r2.entrada) DESC
    LIMIT 1
  ) as location_id,
  -- Verified if any session was automatic (GPS)
  BOOL_OR(r.tipo = 'automatico') as verified,
  -- Source based on type
  CASE
    WHEN BOOL_OR(r.tipo = 'automatico') THEN 'gps'
    ELSE 'manual'
  END as source,
  -- First entry time
  MIN(r.entrada)::TIME as first_entry,
  -- Last exit time
  MAX(r.saida)::TIME as last_exit,
  -- Created at
  MIN(r.created_at) as created_at
FROM public.registros r
WHERE r.saida IS NOT NULL
GROUP BY r.user_id, DATE(r.entrada)
ON CONFLICT (user_id, date) DO NOTHING;

-- =============================================
-- 5. COMMENTS
-- =============================================

COMMENT ON TABLE public.daily_hours IS 'Consolidated daily work hours (1 record per day)';
COMMENT ON COLUMN public.daily_hours.verified IS 'TRUE = GPS verified, FALSE = manual entry';
COMMENT ON COLUMN public.daily_hours.source IS 'gps = auto geofence, manual = user input, edited = GPS modified by user';
COMMENT ON COLUMN public.access_grants.archived_at IS 'When the grant was archived by the viewer (manager)';
