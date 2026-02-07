-- Migration 004: email_verification_files table
-- Batch email verification tracking (mirrors production)

CREATE TABLE ninja.email_verification_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES ninja.campaigns(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  file_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  lines INT,
  filter_query JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT,  -- 'processing', 'finished', 'error'
  lines_processed INT,
  link1 TEXT,
  link2 TEXT,
  checked_at TIMESTAMPTZ,
  processed BOOLEAN NOT NULL DEFAULT false,
  emails JSONB
);

GRANT ALL ON ninja.email_verification_files TO anon, authenticated, service_role;
