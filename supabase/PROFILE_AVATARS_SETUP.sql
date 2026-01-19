-- ============================================
-- ONSITE TIMEKEEPER - PROFILE AVATARS SETUP
-- ============================================
--
-- This SQL script creates:
-- 1. Storage bucket for user profile photos
-- 2. RLS policies for secure access
-- 3. Helper functions for avatar management
--
-- Run this in your Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. CREATE STORAGE BUCKET
-- ============================================

-- Create the avatars bucket (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true, -- Public bucket so avatars can be displayed without auth
  5242880, -- 5MB max file size
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. STORAGE POLICIES (RLS)
-- ============================================

-- DROP existing policies if they exist (for re-running script)
DROP POLICY IF EXISTS "Users can view all avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

-- POLICY 1: Anyone can view avatars (public bucket)
CREATE POLICY "Users can view all avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- POLICY 2: Users can only upload to their own folder (user_id)
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- POLICY 3: Users can only update their own avatar
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- POLICY 4: Users can only delete their own avatar
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- 3. PROFILES TABLE - Ensure avatar_url exists
-- ============================================

-- This should already exist from your schema, but just in case:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- ============================================
-- 4. HELPER FUNCTION - Get Avatar Public URL
-- ============================================

CREATE OR REPLACE FUNCTION get_avatar_url(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  avatar_path TEXT;
BEGIN
  -- Get avatar_url from profiles table
  SELECT avatar_url INTO avatar_path
  FROM profiles
  WHERE id = user_id;

  -- If avatar exists, return full public URL
  IF avatar_path IS NOT NULL THEN
    RETURN avatar_path;
  END IF;

  -- Return null if no avatar
  RETURN NULL;
END;
$$;

-- ============================================
-- 5. TRIGGER - Auto-create profile on signup
-- ============================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NULL -- avatar_url starts as NULL
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger on auth.users table
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- 6. RLS POLICIES FOR PROFILES TABLE
-- ============================================

-- Enable RLS on profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- POLICY 1: Users can view their own profile
CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- POLICY 2: Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- ============================================
-- 7. HELPER FUNCTION - Delete old avatar when uploading new one
-- ============================================

CREATE OR REPLACE FUNCTION delete_old_avatar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_avatar_path TEXT;
  storage_path TEXT;
BEGIN
  -- Only proceed if avatar_url is being changed
  IF OLD.avatar_url IS DISTINCT FROM NEW.avatar_url AND OLD.avatar_url IS NOT NULL THEN
    -- Extract storage path from full URL
    -- Example: https://xxx.supabase.co/storage/v1/object/public/avatars/user_id/file.jpg
    -- We need: avatars/user_id/file.jpg

    storage_path := regexp_replace(OLD.avatar_url, '^.*/storage/v1/object/public/', '');

    -- Delete the old file from storage
    DELETE FROM storage.objects
    WHERE bucket_id = 'avatars' AND name = storage_path;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS delete_old_avatar_on_update ON profiles;

-- Create trigger to auto-delete old avatar
CREATE TRIGGER delete_old_avatar_on_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION delete_old_avatar();

-- ============================================
-- 8. GRANTS (ensure proper permissions)
-- ============================================

-- Grant usage on profiles table
GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, UPDATE ON profiles TO anon;

-- ============================================
-- SETUP COMPLETE
-- ============================================

-- Verify bucket creation
SELECT * FROM storage.buckets WHERE id = 'avatars';

-- Verify policies
SELECT * FROM pg_policies WHERE tablename = 'objects' AND policyname LIKE '%avatar%';

COMMENT ON TABLE profiles IS 'User profile information including avatar URL';
COMMENT ON COLUMN profiles.avatar_url IS 'Public URL to user avatar image in storage bucket';
