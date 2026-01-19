-- ============================================
-- ONSITE TIMEKEEPER - PROFILE AVATARS (SIMPLIFIED)
-- ============================================
-- Execute este SQL no Supabase SQL Editor
-- ============================================

-- 1. CRIAR BUCKET DE STORAGE
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. POLÍTICAS DO BUCKET - Todos podem ver
CREATE POLICY "Users can view all avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- 3. POLÍTICAS DO BUCKET - Upload próprio
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. POLÍTICAS DO BUCKET - Update próprio
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 5. POLÍTICAS DO BUCKET - Delete próprio
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 6. GARANTIR COLUNA avatar_url NA TABELA profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

-- 7. HABILITAR RLS NA TABELA profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 8. POLÍTICAS RLS - Ver próprio perfil
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;
CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);

-- 9. POLÍTICAS RLS - Atualizar próprio perfil
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- 10. GRANTS
GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, UPDATE ON profiles TO anon;

-- 11. TRIGGER - Criar profile ao fazer signup
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
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 12. TRIGGER - Deletar avatar antigo ao fazer upload
CREATE OR REPLACE FUNCTION delete_old_avatar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  storage_path TEXT;
BEGIN
  IF OLD.avatar_url IS DISTINCT FROM NEW.avatar_url AND OLD.avatar_url IS NOT NULL THEN
    storage_path := regexp_replace(OLD.avatar_url, '^.*/storage/v1/object/public/', '');
    DELETE FROM storage.objects
    WHERE bucket_id = 'avatars' AND name = storage_path;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delete_old_avatar_on_update ON profiles;
CREATE TRIGGER delete_old_avatar_on_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION delete_old_avatar();

-- ============================================
-- VERIFICAÇÃO
-- ============================================
SELECT 'Bucket criado:' as status, * FROM storage.buckets WHERE id = 'avatars';
