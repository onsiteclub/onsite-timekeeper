-- =============================================
-- OnSite Timekeeper - Daily Hours Shared Access (V3)
--
-- Adds RLS policy on daily_hours so viewers (managers)
-- with active access_grants can read owner's daily hours.
--
-- Replaces the old app_timekeeper_entries policy from 002.
-- =============================================

-- 1. RLS policy on daily_hours for shared access
DROP POLICY IF EXISTS "Viewer see shared daily_hours" ON public.daily_hours;
CREATE POLICY "Viewer see shared daily_hours" ON public.daily_hours FOR SELECT USING (
  -- Owner can always see their own
  auth.uid() = user_id
  OR
  -- Viewer with active grant can see owner's data
  EXISTS (
    SELECT 1 FROM public.access_grants
    WHERE access_grants.owner_id = daily_hours.user_id
      AND access_grants.viewer_id = auth.uid()
      AND access_grants.status = 'active'
  )
);

-- 2. Clean up old policy on non-existent table (safe to run even if table doesn't exist)
-- DROP POLICY IF EXISTS "Viewer see shared records" ON public.app_timekeeper_entries;
-- (Commented out because the table may not exist, which would error)
