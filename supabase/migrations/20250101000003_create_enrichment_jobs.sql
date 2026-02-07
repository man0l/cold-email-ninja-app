-- Migration 003: enrichment_jobs table
-- Per-lead enrichment queue (mirrors production pattern)

CREATE TABLE ninja.enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ninja.campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES ninja.leads(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued -> processing -> done -> error
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ninja_enrichment_jobs_status_idx ON ninja.enrichment_jobs(status);
CREATE INDEX ninja_enrichment_jobs_lead_idx ON ninja.enrichment_jobs(lead_id);

GRANT ALL ON ninja.enrichment_jobs TO anon, authenticated, service_role;
