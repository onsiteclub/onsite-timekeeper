-- ============================================
-- Migration 006: Delete User Account RPC
-- ============================================
-- Required by Apple App Store (account deletion mandate)
-- Uses SECURITY DEFINER to allow deleting from auth.users
-- CASCADE on FKs handles dependent data automatically,
-- but we explicitly delete first for safety.

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
  DELETE FROM public.location_audit WHERE user_id = current_user_id;

  -- Legacy tables (may not exist, wrapped in exception handler)
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

  -- Delete geofences (app_timekeeper_geofences)
  BEGIN
    DELETE FROM public.app_timekeeper_geofences WHERE user_id = current_user_id;
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
