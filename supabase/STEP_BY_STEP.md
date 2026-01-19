# Avatar Setup - Passo a Passo (Se houver erros)

Se você estiver tendo problemas ao executar o SQL completo, execute cada bloco separadamente no SQL Editor do Supabase:

---

## PASSO 1: Criar Bucket

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
```

✅ Verifique: Vá em **Storage** → Deve aparecer bucket `avatars` com status público

---

## PASSO 2: Políticas de Visualização

```sql
CREATE POLICY "Users can view all avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```

---

## PASSO 3: Política de Upload

```sql
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## PASSO 4: Política de Update

```sql
CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## PASSO 5: Política de Delete

```sql
CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

## PASSO 6: Adicionar Coluna avatar_url

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

---

## PASSO 7: Habilitar RLS em profiles

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
```

---

## PASSO 8: Política para Ver Perfil

```sql
DROP POLICY IF EXISTS "Users can view their own profile" ON profiles;

CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
USING (auth.uid() = id);
```

---

## PASSO 9: Política para Atualizar Perfil

```sql
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);
```

---

## PASSO 10: Grants

```sql
GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, UPDATE ON profiles TO anon;
```

---

## PASSO 11: Função handle_new_user

```sql
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
```

---

## PASSO 12: Trigger on_auth_user_created

```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

---

## PASSO 13: Função delete_old_avatar

```sql
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
```

---

## PASSO 14: Trigger delete_old_avatar_on_update

```sql
DROP TRIGGER IF EXISTS delete_old_avatar_on_update ON profiles;

CREATE TRIGGER delete_old_avatar_on_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION delete_old_avatar();
```

---

## ✅ Verificação Final

Execute para verificar se tudo está OK:

```sql
-- Verificar bucket
SELECT * FROM storage.buckets WHERE id = 'avatars';

-- Verificar políticas do storage
SELECT * FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE '%avatar%';

-- Verificar coluna avatar_url
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'avatar_url';

-- Verificar políticas da tabela profiles
SELECT * FROM pg_policies WHERE tablename = 'profiles';
```

---

## 🐛 Erros Comuns

### "policy already exists"
- Ignore ou execute `DROP POLICY IF EXISTS` antes

### "permission denied"
- Certifique-se de estar logado como admin no Supabase
- Verifique se está no projeto correto

### "column already exists"
- Ignore, significa que já existe (OK)

### "relation does not exist"
- Verifique se a tabela `profiles` existe
- Se não existir, crie com:
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```
