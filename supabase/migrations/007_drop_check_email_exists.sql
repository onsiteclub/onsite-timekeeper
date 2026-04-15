-- Migration 007: Drop check_email_exists RPC
-- S1: This function was an email enumeration vulnerability.
-- It allowed anon users to probe whether an email was registered.
-- The auth flow now always goes to PasswordStep without checking.

DROP FUNCTION IF EXISTS public.check_email_exists(TEXT);
