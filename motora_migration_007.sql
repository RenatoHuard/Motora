-- =============================================================
-- Motora — Migration 007
-- Cria tabela de perfis de usuário (display_name, foto, plano).
-- Cria bucket público de avatares no Supabase Storage.
-- =============================================================

-- Tabela de perfis
CREATE TABLE IF NOT EXISTS motora_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT,
  photo_url       TEXT,
  plan_active     BOOLEAN     DEFAULT false,
  plan_expires_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE motora_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile"
  ON motora_profiles FOR ALL
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Bucket público para fotos de perfil
INSERT INTO storage.buckets (id, name, public)
  VALUES ('motora-avatars', 'motora-avatars', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar upload own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'motora-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Avatar update own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'motora-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Avatar public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'motora-avatars');
