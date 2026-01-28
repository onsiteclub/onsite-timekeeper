-- =============================================
-- OnSite Timekeeper - Access Grants (QR Code Linking)
-- Tables: app_timekeeper_entries, app_timekeeper_geofences
-- =============================================

-- 1. Tabela de tokens temporários (QR code - 5 min expiry)
CREATE TABLE IF NOT EXISTS public.pending_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token VARCHAR(32) UNIQUE NOT NULL,
  owner_name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_tokens_token ON public.pending_tokens(token);
CREATE INDEX IF NOT EXISTS idx_pending_tokens_expires ON public.pending_tokens(expires_at);
ALTER TABLE public.pending_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manage pending_tokens" ON public.pending_tokens;
CREATE POLICY "Owner manage pending_tokens" ON public.pending_tokens FOR ALL USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Anyone can read token" ON public.pending_tokens;
CREATE POLICY "Anyone can read token" ON public.pending_tokens FOR SELECT USING (true);

-- 2. Tabela de grants (links permanentes worker <-> manager)
CREATE TABLE IF NOT EXISTS public.access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token VARCHAR(32) NOT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  label VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE(owner_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS idx_access_grants_owner ON public.access_grants(owner_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_viewer ON public.access_grants(viewer_id);
CREATE INDEX IF NOT EXISTS idx_access_grants_status ON public.access_grants(status);
ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manage access_grants" ON public.access_grants;
CREATE POLICY "Owner manage access_grants" ON public.access_grants FOR ALL USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Viewer see own grants" ON public.access_grants;
CREATE POLICY "Viewer see own grants" ON public.access_grants FOR SELECT USING (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "Create pending grant" ON public.access_grants;
DROP POLICY IF EXISTS "Viewer create active grant" ON public.access_grants;
CREATE POLICY "Viewer create active grant" ON public.access_grants FOR INSERT WITH CHECK (auth.uid() = viewer_id AND status = 'active');

DROP POLICY IF EXISTS "Viewer update own grant" ON public.access_grants;
CREATE POLICY "Viewer update own grant" ON public.access_grants FOR UPDATE USING (auth.uid() = viewer_id);

-- 3. RLS para records compartilhados
DROP POLICY IF EXISTS "Viewer see shared records" ON public.app_timekeeper_entries;
CREATE POLICY "Viewer see shared records" ON public.app_timekeeper_entries FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.access_grants
    WHERE access_grants.owner_id = app_timekeeper_entries.user_id
      AND access_grants.viewer_id = auth.uid()
      AND access_grants.status = 'active'
  )
);

-- 4. RLS para locations compartilhados
DROP POLICY IF EXISTS "Viewer see shared locations" ON public.app_timekeeper_geofences;
CREATE POLICY "Viewer see shared locations" ON public.app_timekeeper_geofences FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.access_grants
    WHERE access_grants.owner_id = app_timekeeper_geofences.user_id
      AND access_grants.viewer_id = auth.uid()
      AND access_grants.status = 'active'
  )
);

-- 5. Função para limpar tokens expirados
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM public.pending_tokens WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários
COMMENT ON TABLE public.pending_tokens IS 'Temporary QR code tokens (5 min expiry)';
COMMENT ON TABLE public.access_grants IS 'Permanent links between workers and managers';
COMMENT ON COLUMN public.access_grants.owner_id IS 'Worker who shares their data';
COMMENT ON COLUMN public.access_grants.viewer_id IS 'Manager who receives read access';
