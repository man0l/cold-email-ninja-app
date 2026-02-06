-- Migration 006: api_keys + app_settings tables

CREATE TABLE ninja.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL UNIQUE,
  -- Services: openai, anymail, rapidapi_maps, rapidapi_linkedin,
  --           dataforseo, openwebninja, oxylabs
  api_key TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON ninja.api_keys TO anon, authenticated, service_role;

CREATE TABLE ninja.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  google_drive_folder_id TEXT,
  default_locations_csv TEXT,
  worker_poll_interval_seconds INT DEFAULT 5,
  settings JSONB DEFAULT '{}'
);

INSERT INTO ninja.app_settings (id) VALUES (1);

GRANT ALL ON ninja.app_settings TO anon, authenticated, service_role;
