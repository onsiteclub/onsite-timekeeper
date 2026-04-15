-- ============================================
-- Migration 009: Add phone to core_profiles
-- ============================================
-- Phone number used for OTP verification and password reset.
-- The `profiles` VIEW is recreated to include the new column.

ALTER TABLE core_profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Recreate the profiles VIEW to expose phone
CREATE OR REPLACE VIEW profiles AS
  SELECT id, email, full_name, phone, avatar_url, created_at, updated_at
  FROM core_profiles;
