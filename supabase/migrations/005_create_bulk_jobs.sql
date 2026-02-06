-- Migration 005: bulk_jobs table
-- Campaign-wide operations dispatched to Contabo Python workers
-- Separate from enrichment_jobs (which is per-lead)

CREATE TABLE ninja.bulk_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES ninja.campaigns(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  -- Types: scrape_maps, find_emails, find_decision_makers,
  --        anymail_emails, clean_leads, casualise_names,
  --        clean_spam, export, import
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending -> running -> completed / failed / cancelled
  config JSONB DEFAULT '{}',
  progress JSONB DEFAULT '{}',
  result JSONB DEFAULT '{}',
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ninja_bulk_jobs_status_idx ON ninja.bulk_jobs(status);

GRANT ALL ON ninja.bulk_jobs TO anon, authenticated, service_role;
