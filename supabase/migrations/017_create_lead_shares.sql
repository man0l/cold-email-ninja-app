-- Migration 017: Create lead_shares table
-- Enables shareable lead views with public/private access control.
-- Each share generates a unique token for URL-based access.
--
-- Deployment:
--   1. Copy to salonease/supabase/ninja-migrations/
--   2. Pipe SQL to remote DB container
--   3. Restart supabase-rest (PostgREST caches schema)

-- ═══════════════════════════════════════════════════════════════════════
-- 1. CREATE TABLE
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ninja.lead_shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  campaign_id UUID NOT NULL REFERENCES ninja.campaigns(id) ON DELETE CASCADE,
  token       VARCHAR(32) NOT NULL,
  name        TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,

  CONSTRAINT lead_shares_token_unique UNIQUE (token)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. INDEXES
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS ninja_lead_shares_customer_idx
  ON ninja.lead_shares(customer_id);

CREATE INDEX IF NOT EXISTS ninja_lead_shares_campaign_idx
  ON ninja.lead_shares(campaign_id);

-- Token lookup is the hot path for public access
CREATE INDEX IF NOT EXISTS ninja_lead_shares_token_idx
  ON ninja.lead_shares(token);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE ninja.lead_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_isolation_select ON ninja.lead_shares;
CREATE POLICY customer_isolation_select ON ninja.lead_shares
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS customer_isolation_modify ON ninja.lead_shares;
CREATE POLICY customer_isolation_modify ON ninja.lead_shares
  FOR ALL USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);
