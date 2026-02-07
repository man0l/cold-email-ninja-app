-- Migration 016: Add customer_id multi-tenancy
-- Adds customer_id (= auth.users.id) to all ninja schema tables for per-user
-- data isolation. Enables RLS with customer-scoping policies. Updates RPC
-- functions and adds an on_auth_user_created trigger for default app_settings.
--
-- Deployment:
--   1. Apply this migration to supabase-db17
--   2. Restart supabase-rest (PostgREST caches schema)
--   3. Sync updated Edge Functions to salonease/supabase/functions/

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ADD customer_id COLUMN TO ALL TABLES
-- ═══════════════════════════════════════════════════════════════════════
-- Added as nullable first; backfill + NOT NULL applied at the end.

ALTER TABLE ninja.campaigns
  ADD COLUMN IF NOT EXISTS customer_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);

ALTER TABLE ninja.leads
  ADD COLUMN IF NOT EXISTS customer_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);

ALTER TABLE ninja.bulk_jobs
  ADD COLUMN IF NOT EXISTS customer_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);

ALTER TABLE ninja.enrichment_jobs
  ADD COLUMN IF NOT EXISTS customer_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);

ALTER TABLE ninja.email_verification_files
  ADD COLUMN IF NOT EXISTS customer_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);

ALTER TABLE ninja.agent_conversations
  ADD COLUMN IF NOT EXISTS customer_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);

ALTER TABLE ninja.api_keys
  ADD COLUMN IF NOT EXISTS customer_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);

-- app_settings: drop singleton constraint, add customer_id
ALTER TABLE ninja.app_settings DROP CONSTRAINT IF EXISTS app_settings_id_check;
ALTER TABLE ninja.app_settings
  ADD COLUMN IF NOT EXISTS customer_id UUID DEFAULT auth.uid() REFERENCES auth.users(id);


-- ═══════════════════════════════════════════════════════════════════════
-- 2. INDEXES on customer_id
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS ninja_campaigns_customer_idx
  ON ninja.campaigns(customer_id);

CREATE INDEX IF NOT EXISTS ninja_leads_customer_idx
  ON ninja.leads(customer_id);

CREATE INDEX IF NOT EXISTS ninja_bulk_jobs_customer_idx
  ON ninja.bulk_jobs(customer_id);

CREATE INDEX IF NOT EXISTS ninja_enrichment_jobs_customer_idx
  ON ninja.enrichment_jobs(customer_id);

CREATE INDEX IF NOT EXISTS ninja_email_verification_files_customer_idx
  ON ninja.email_verification_files(customer_id);

CREATE INDEX IF NOT EXISTS ninja_agent_conversations_customer_idx
  ON ninja.agent_conversations(customer_id);

CREATE INDEX IF NOT EXISTS ninja_api_keys_customer_idx
  ON ninja.api_keys(customer_id);

CREATE INDEX IF NOT EXISTS ninja_app_settings_customer_idx
  ON ninja.app_settings(customer_id);


-- ═══════════════════════════════════════════════════════════════════════
-- 3. UPDATE CONSTRAINTS
-- ═══════════════════════════════════════════════════════════════════════

-- api_keys: change UNIQUE(service) to UNIQUE(customer_id, service)
DO $$
BEGIN
  -- Drop old unique constraint (auto-generated name may vary)
  ALTER TABLE ninja.api_keys DROP CONSTRAINT IF EXISTS api_keys_service_key;
  -- Also try the schema-prefixed name
  ALTER TABLE ninja.api_keys DROP CONSTRAINT IF EXISTS ninja_api_keys_service_key;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ninja_api_keys_customer_service_unique
  ON ninja.api_keys(customer_id, service);

-- app_settings: UNIQUE on customer_id (one settings row per user)
CREATE UNIQUE INDEX IF NOT EXISTS ninja_app_settings_customer_unique
  ON ninja.app_settings(customer_id) WHERE customer_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- 4. ENABLE ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE ninja.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninja.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninja.bulk_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninja.enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninja.email_verification_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninja.agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninja.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninja.app_settings ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════
-- 5. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════
-- Each table gets SELECT + ALL (insert/update/delete) policies.
-- service_role bypasses RLS automatically — no special handling needed.

-- campaigns
DROP POLICY IF EXISTS customer_isolation_select ON ninja.campaigns;
CREATE POLICY customer_isolation_select ON ninja.campaigns
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS customer_isolation_modify ON ninja.campaigns;
CREATE POLICY customer_isolation_modify ON ninja.campaigns
  FOR ALL USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- leads
DROP POLICY IF EXISTS customer_isolation_select ON ninja.leads;
CREATE POLICY customer_isolation_select ON ninja.leads
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS customer_isolation_modify ON ninja.leads;
CREATE POLICY customer_isolation_modify ON ninja.leads
  FOR ALL USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- bulk_jobs
DROP POLICY IF EXISTS customer_isolation_select ON ninja.bulk_jobs;
CREATE POLICY customer_isolation_select ON ninja.bulk_jobs
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS customer_isolation_modify ON ninja.bulk_jobs;
CREATE POLICY customer_isolation_modify ON ninja.bulk_jobs
  FOR ALL USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- enrichment_jobs
DROP POLICY IF EXISTS customer_isolation_select ON ninja.enrichment_jobs;
CREATE POLICY customer_isolation_select ON ninja.enrichment_jobs
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS customer_isolation_modify ON ninja.enrichment_jobs;
CREATE POLICY customer_isolation_modify ON ninja.enrichment_jobs
  FOR ALL USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- email_verification_files
DROP POLICY IF EXISTS customer_isolation_select ON ninja.email_verification_files;
CREATE POLICY customer_isolation_select ON ninja.email_verification_files
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS customer_isolation_modify ON ninja.email_verification_files;
CREATE POLICY customer_isolation_modify ON ninja.email_verification_files
  FOR ALL USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- agent_conversations
DROP POLICY IF EXISTS customer_isolation_select ON ninja.agent_conversations;
CREATE POLICY customer_isolation_select ON ninja.agent_conversations
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS customer_isolation_modify ON ninja.agent_conversations;
CREATE POLICY customer_isolation_modify ON ninja.agent_conversations
  FOR ALL USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- api_keys
DROP POLICY IF EXISTS customer_isolation_select ON ninja.api_keys;
CREATE POLICY customer_isolation_select ON ninja.api_keys
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS customer_isolation_modify ON ninja.api_keys;
CREATE POLICY customer_isolation_modify ON ninja.api_keys
  FOR ALL USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- app_settings
DROP POLICY IF EXISTS customer_isolation_select ON ninja.app_settings;
CREATE POLICY customer_isolation_select ON ninja.app_settings
  FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS customer_isolation_modify ON ninja.app_settings;
CREATE POLICY customer_isolation_modify ON ninja.app_settings
  FOR ALL USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);


-- ═══════════════════════════════════════════════════════════════════════
-- 6. UPDATE RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- enqueue_lead_enrichment: derive customer_id from campaign
CREATE OR REPLACE FUNCTION ninja.enqueue_lead_enrichment(
  p_campaign_id UUID,
  p_lead_ids UUID[]
) RETURNS INT AS $$
DECLARE
  inserted_count INT;
BEGIN
  INSERT INTO ninja.enrichment_jobs (campaign_id, lead_id, customer_id)
  SELECT p_campaign_id, lid, c.customer_id
  FROM unnest(p_lead_ids) AS lid
  CROSS JOIN ninja.campaigns c
  WHERE c.id = p_campaign_id
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Update cleanup function: handle per-customer retention settings
CREATE OR REPLACE FUNCTION public.cleanup_system_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  retention_days int;
BEGIN
  -- TIER 1: Logs — 3 hour retention
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '3 hours';
  DELETE FROM net._http_response WHERE created < now() - interval '3 hours';
  BEGIN
    DELETE FROM pgmq.a_lead_enrichment WHERE archived_at < now() - interval '3 hours';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- TIER 2: System/operational data — 1 week retention
  DELETE FROM ninja.bulk_jobs
  WHERE status IN ('completed', 'failed')
    AND completed_at < now() - interval '1 week';

  BEGIN
    DELETE FROM public.enrichment_jobs
    WHERE status IN ('done', 'error') AND updated_at < now() - interval '1 week';
    DELETE FROM public.enrichment_jobs
    WHERE status = 'queued' AND created_at < now() - interval '1 week';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- Agent conversations: use minimum retention across all customers (default 7 days)
  SELECT COALESCE(
    MIN((settings->'agent'->'defaults'->>'conversation_retention_days')::int),
    7
  ) INTO retention_days
  FROM ninja.app_settings;

  DELETE FROM ninja.agent_conversations
  WHERE updated_at < now() - (retention_days || ' days')::interval;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════
-- 7. NEW USER TRIGGER: auto-create app_settings row
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ninja.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ninja
AS $$
BEGIN
  INSERT INTO ninja.app_settings (customer_id, settings)
  VALUES (NEW.id, '{}'::jsonb)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION ninja.handle_new_user();


-- ═══════════════════════════════════════════════════════════════════════
-- 8. BACKFILL existing data
-- ═══════════════════════════════════════════════════════════════════════
-- Assign all existing data to the first auth user (if any).
-- On fresh installs this is a no-op.

DO $$
DECLARE
  v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users ORDER BY created_at ASC LIMIT 1;

  IF v_uid IS NOT NULL THEN
    UPDATE ninja.campaigns SET customer_id = v_uid WHERE customer_id IS NULL;
    UPDATE ninja.leads SET customer_id = v_uid WHERE customer_id IS NULL;
    UPDATE ninja.bulk_jobs SET customer_id = v_uid WHERE customer_id IS NULL;
    UPDATE ninja.enrichment_jobs SET customer_id = v_uid WHERE customer_id IS NULL;
    UPDATE ninja.email_verification_files SET customer_id = v_uid WHERE customer_id IS NULL;
    UPDATE ninja.agent_conversations SET customer_id = v_uid WHERE customer_id IS NULL;
    UPDATE ninja.api_keys SET customer_id = v_uid WHERE customer_id IS NULL;
    UPDATE ninja.app_settings SET customer_id = v_uid WHERE customer_id IS NULL;

    -- Now safe to set NOT NULL
    ALTER TABLE ninja.campaigns ALTER COLUMN customer_id SET NOT NULL;
    ALTER TABLE ninja.leads ALTER COLUMN customer_id SET NOT NULL;
    ALTER TABLE ninja.bulk_jobs ALTER COLUMN customer_id SET NOT NULL;
    ALTER TABLE ninja.enrichment_jobs ALTER COLUMN customer_id SET NOT NULL;
    ALTER TABLE ninja.email_verification_files ALTER COLUMN customer_id SET NOT NULL;
    ALTER TABLE ninja.agent_conversations ALTER COLUMN customer_id SET NOT NULL;
    ALTER TABLE ninja.api_keys ALTER COLUMN customer_id SET NOT NULL;
    ALTER TABLE ninja.app_settings ALTER COLUMN customer_id SET NOT NULL;
  END IF;
END $$;

-- Grant execute on new functions
GRANT EXECUTE ON FUNCTION ninja.handle_new_user() TO service_role;
