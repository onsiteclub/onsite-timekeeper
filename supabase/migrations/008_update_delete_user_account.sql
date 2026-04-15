-- ============================================
-- Migration 008: Update delete_user_account RPC
-- ============================================
-- Adds cleanup for tables missing from migration 006:
-- - business_profiles
-- - ai_verdicts
-- - core_profiles (the actual table behind "profiles" VIEW)

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
BEGIN
  -- Get the authenticated user's ID
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Explicitly delete user data from all tables
  DELETE FROM public.daily_hours WHERE user_id = current_user_id;
  DELETE FROM public.access_grants WHERE owner_id = current_user_id OR viewer_id = current_user_id;
  DELETE FROM public.pending_tokens WHERE owner_id = current_user_id;

  -- GPS audit trail
  BEGIN
    DELETE FROM public.location_audit WHERE user_id = current_user_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Business profiles
  BEGIN
    DELETE FROM public.business_profiles WHERE user_id = current_user_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- AI verdicts
  BEGIN
    DELETE FROM public.ai_verdicts WHERE user_id = current_user_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Core profiles (the actual table behind "profiles" VIEW)
  BEGIN
    DELETE FROM public.core_profiles WHERE id = current_user_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Geofences
  BEGIN
    DELETE FROM public.app_timekeeper_geofences WHERE user_id = current_user_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Legacy tables (may not exist)
  BEGIN
    DELETE FROM public.registros WHERE user_id = current_user_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.sync_log WHERE user_id = current_user_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.locais WHERE user_id = current_user_id;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Finally, delete the auth user (CASCADE handles anything remaining)
  DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;

-- Only authenticated users can call this function
REVOKE ALL ON FUNCTION public.delete_user_account() FROM anon;
REVOKE ALL ON FUNCTION public.delete_user_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
