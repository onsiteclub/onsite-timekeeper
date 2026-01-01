-- =============================================
-- OnSite Timekeeper - Supabase Migration
-- 001: Create Tables
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- LOCAIS (Geofences)
-- =============================================
CREATE TABLE IF NOT EXISTS public.locais (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  raio INTEGER DEFAULT 100,
  cor TEXT DEFAULT '#3B82F6',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deleted', 'pending_delete', 'syncing')),
  deleted_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_locais_user_id ON public.locais(user_id);
CREATE INDEX idx_locais_status ON public.locais(status);
CREATE INDEX idx_locais_user_status ON public.locais(user_id, status);

-- RLS
ALTER TABLE public.locais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own locais"
  ON public.locais FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own locais"
  ON public.locais FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own locais"
  ON public.locais FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own locais"
  ON public.locais FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- REGISTROS (Work Sessions)
-- =============================================
CREATE TABLE IF NOT EXISTS public.registros (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id UUID NOT NULL REFERENCES public.locais(id) ON DELETE CASCADE,
  local_nome TEXT,
  entrada TIMESTAMPTZ NOT NULL,
  saida TIMESTAMPTZ,
  tipo TEXT DEFAULT 'automatico' CHECK (tipo IN ('automatico', 'manual')),
  editado_manualmente BOOLEAN DEFAULT FALSE,
  motivo_edicao TEXT,
  hash_integridade TEXT,
  cor TEXT,
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_registros_user_id ON public.registros(user_id);
CREATE INDEX idx_registros_local_id ON public.registros(local_id);
CREATE INDEX idx_registros_entrada ON public.registros(entrada);
CREATE INDEX idx_registros_user_entrada ON public.registros(user_id, entrada DESC);

-- RLS
ALTER TABLE public.registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own registros"
  ON public.registros FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own registros"
  ON public.registros FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own registros"
  ON public.registros FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own registros"
  ON public.registros FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- SYNC_LOG (Audit Trail)
-- =============================================
CREATE TABLE IF NOT EXISTS public.sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('local', 'registro')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'sync_up', 'sync_down')),
  old_value JSONB,
  new_value JSONB,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'conflict', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sync_log_user ON public.sync_log(user_id);
CREATE INDEX idx_sync_log_entity ON public.sync_log(entity_type, entity_id);
CREATE INDEX idx_sync_log_created ON public.sync_log(created_at DESC);

-- RLS
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync_log"
  ON public.sync_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync_log"
  ON public.sync_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_locais_updated_at
  BEFORE UPDATE ON public.locais
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON TABLE public.locais IS 'Locais de trabalho (geofences) dos usuários';
COMMENT ON TABLE public.registros IS 'Registros de ponto (entrada/saída)';
COMMENT ON TABLE public.sync_log IS 'Log de auditoria de sincronização';
