-- Migration 002: leads table
-- Production base (public.leads) + directive extension fields

CREATE TABLE ninja.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES ninja.campaigns(id) ON DELETE CASCADE,

  -- === PRODUCTION FIELDS (exact match to public.leads) ===
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  company_name TEXT,
  company_website TEXT,
  email TEXT,
  personal_email TEXT,
  linkedin TEXT,
  title TEXT,
  industry TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  ice_breaker TEXT,
  ice_status TEXT NOT NULL DEFAULT 'pending',  -- pending -> queued -> done -> error
  enriched_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verification_status TEXT,
  verification_checked_at TIMESTAMPTZ,

  -- === DIRECTIVE EXTENSIONS ===
  -- From scrape_google_maps.md
  domain TEXT,
  place_id TEXT,
  rating NUMERIC,
  reviews INT,
  category TEXT,
  address TEXT,
  zip TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  search_keyword TEXT,
  search_location TEXT,
  phone TEXT,

  -- From find_decision_makers.md + anymail_find_emails.md
  decision_maker_name TEXT,
  decision_maker_title TEXT,
  decision_maker_email TEXT,
  decision_maker_email_status TEXT,
  decision_maker_linkedin TEXT,
  decision_maker_source TEXT,
  decision_maker_confidence TEXT,
  company_linkedin TEXT,

  -- From find_emails.md (OpenWeb Ninja enrichment)
  emails JSONB DEFAULT '[]',
  phones JSONB DEFAULT '[]',
  social_facebook TEXT,
  social_instagram TEXT,
  social_linkedin TEXT,
  social_twitter TEXT,

  -- From casualise_company_name.md
  company_name_casual TEXT,

  -- From spam_keywords_cleanup.md
  ice_breaker_cleaned TEXT,

  -- Meta
  source TEXT,  -- 'apollo_import', 'google_maps', 'csv_import', 'manual'
  enrichment_status JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE UNIQUE INDEX ninja_leads_campaign_email_unique
  ON ninja.leads(campaign_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX ninja_leads_campaign_id_idx ON ninja.leads(campaign_id);
CREATE INDEX ninja_leads_ice_status_idx ON ninja.leads(ice_status);

-- Grant explicit permissions
GRANT ALL ON ninja.leads TO anon, authenticated, service_role;
