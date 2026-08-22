BEGIN;

CREATE TABLE IF NOT EXISTS public.external_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform text NOT NULL CHECK (source_platform IN ('youtube','tiktok','facebook','instagram','other_authorized_source')),
  original_content_id text NOT NULL,
  original_url text NOT NULL,
  creator_name text NOT NULL,
  creator_attribution text NOT NULL,
  thumbnail_url text,
  embed_url text,
  title text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('Funny','Music','Experience','Sports','Learning','Serious Topics')),
  published_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  authorization_type text NOT NULL CHECK (authorization_type IN ('official_api','official_embed','licensed_feed','creator_authorized_account','user_authorized_import')),
  external_status text NOT NULL DEFAULT 'active' CHECK (external_status IN ('active','unavailable','disabled','revoked')),
  last_synced_at timestamptz,
  country_code text,
  language_code text,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_platform, original_content_id)
);

CREATE INDEX IF NOT EXISTS external_videos_feed_idx
  ON public.external_videos (external_status, category, published_at DESC);
CREATE INDEX IF NOT EXISTS external_videos_country_idx
  ON public.external_videos (country_code);

ALTER TABLE public.external_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_videos_public_read ON public.external_videos;
CREATE POLICY external_videos_public_read ON public.external_videos
  FOR SELECT USING (external_status = 'active');
GRANT SELECT ON public.external_videos TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.external_ingestion_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  automatic_ingestion_enabled boolean NOT NULL DEFAULT false,
  user_upload_priority numeric(5,2) NOT NULL DEFAULT 0.70 CHECK (user_upload_priority BETWEEN 0 AND 1),
  max_external_feed_ratio numeric(5,2) NOT NULL DEFAULT 0.30 CHECK (max_external_feed_ratio BETWEEN 0 AND 1),
  external_content_limit integer NOT NULL DEFAULT 20 CHECK (external_content_limit > 0),
  ingestion_frequency_minutes integer NOT NULL DEFAULT 360 CHECK (ingestion_frequency_minutes >= 15),
  approved_categories text[] NOT NULL DEFAULT ARRAY['Funny','Music','Experience','Sports','Learning','Serious Topics'],
  supported_countries text[] NOT NULL DEFAULT ARRAY['NG'],
  enabled_providers text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.external_ingestion_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.external_ingestion_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_ingestion_config FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.external_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  discovered_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  unavailable_count integer NOT NULL DEFAULT 0,
  error_message text
);
ALTER TABLE public.external_ingestion_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.external_ingestion_runs FROM anon, authenticated;

COMMIT;
