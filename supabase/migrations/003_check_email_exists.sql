-- Migration: Add check_email_exists RPC function
-- Required for the multi-step authentication flow

-- Function to check if an email exists in auth.users
-- This is used by the AuthScreen to determine if user should login or signup
CREATE OR REPLACE FUNCTION public.check_email_exists(email_to_check TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users
    WHERE email = lower(email_to_check)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.check_email_exists IS 'Checks if an email is already registered in auth.users. Returns true if exists, false otherwise.';
