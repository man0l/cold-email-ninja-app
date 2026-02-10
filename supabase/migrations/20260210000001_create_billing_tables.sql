-- Migration 20260210000001: Create billing tables for freemium model
-- Tables: billing_plans, user_subscriptions, usage_logs, invoices

-- ═══════════════════════════════════════════════════════════════════════
-- 1. BILLING PLANS TABLE
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE ninja.billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  -- free, pro, enterprise
  tier TEXT NOT NULL UNIQUE CHECK (tier IN ('free', 'pro', 'enterprise')),
  
  -- Monthly lead limits
  monthly_leads_limit INT NOT NULL,
  -- -1 = unlimited
  
  -- Pricing (in cents, USD)
  monthly_price_cents INT NOT NULL DEFAULT 0,
  
  -- Cost per lead exceeding monthly limit (cents)
  overage_price_per_lead_cents INT DEFAULT 10,
  
  -- Features as JSONB
  features JSONB DEFAULT '{}',
  
  -- Metadata
  description TEXT,
  active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO ninja.billing_plans (name, tier, monthly_leads_limit, monthly_price_cents, overage_price_per_lead_cents, description, display_order, features)
VALUES 
  ('Free', 'free', 1000, 0, 10, 'Get started with 1,000 leads/month', 1, '{"includes_api": true, "includes_ai_agent": false}'::jsonb),
  ('Pro', 'pro', 10000, 2900, 10, '10,000 leads/month + AI agent', 2, '{"includes_api": true, "includes_ai_agent": true}'::jsonb),
  ('Enterprise', 'enterprise', -1, 0, 0, 'Unlimited leads + dedicated support', 3, '{"includes_api": true, "includes_ai_agent": true, "includes_support": true}'::jsonb);

GRANT ALL ON ninja.billing_plans TO anon, authenticated, service_role;
CREATE INDEX idx_billing_plans_tier ON ninja.billing_plans(tier);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. USER SUBSCRIPTIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE ninja.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES ninja.billing_plans(id),
  
  -- Stripe integration
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_payment_method_id TEXT,
  
  -- Subscription status: active, past_due, canceled, unpaid
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'unpaid', 'trial')),
  
  -- Billing cycle dates
  billing_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  billing_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 month'),
  trial_ends_at TIMESTAMPTZ,
  
  -- Usage tracking for current period
  leads_used_this_month INT DEFAULT 0,
  overage_charges_cents INT DEFAULT 0,
  
  -- Auto-renew flag
  auto_renew BOOLEAN DEFAULT true,
  
  -- Metadata
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON ninja.user_subscriptions TO anon, authenticated, service_role;
CREATE INDEX idx_user_subscriptions_customer ON ninja.user_subscriptions(customer_id);
CREATE INDEX idx_user_subscriptions_plan ON ninja.user_subscriptions(plan_id);
CREATE INDEX idx_user_subscriptions_stripe_sub ON ninja.user_subscriptions(stripe_subscription_id);
CREATE INDEX idx_user_subscriptions_status ON ninja.user_subscriptions(status);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. USAGE LOGS TABLE
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE ninja.usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES ninja.campaigns(id) ON DELETE CASCADE,
  
  -- Action that generated leads: scrape, import, manual
  action TEXT NOT NULL CHECK (action IN ('scrape', 'import', 'manual')),
  
  -- Number of leads in this action
  leads_count INT NOT NULL CHECK (leads_count > 0),
  
  -- Which job triggered this (optional, for traceability)
  bulk_job_id UUID REFERENCES ninja.bulk_jobs(id) ON DELETE SET NULL,
  
  -- Custom note/source
  note TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON ninja.usage_logs TO anon, authenticated, service_role;
CREATE INDEX idx_usage_logs_customer ON ninja.usage_logs(customer_id);
CREATE INDEX idx_usage_logs_campaign ON ninja.usage_logs(campaign_id);
CREATE INDEX idx_usage_logs_created ON ninja.usage_logs(created_at);
CREATE INDEX idx_usage_logs_period ON ninja.usage_logs(customer_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════
-- 4. INVOICES TABLE
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE ninja.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES ninja.user_subscriptions(id) ON DELETE CASCADE,
  
  -- Stripe integration
  stripe_invoice_id TEXT UNIQUE,
  
  -- Invoice status: draft, pending, paid, failed, voided
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'paid', 'failed', 'voided')),
  
  -- Billing period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Line items
  base_amount_cents INT NOT NULL DEFAULT 0,
  overage_amount_cents INT DEFAULT 0,
  tax_amount_cents INT DEFAULT 0,
  total_amount_cents INT NOT NULL,
  
  -- Payment tracking
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON ninja.invoices TO anon, authenticated, service_role;
CREATE INDEX idx_invoices_customer ON ninja.invoices(customer_id);
CREATE INDEX idx_invoices_subscription ON ninja.invoices(subscription_id);
CREATE INDEX idx_invoices_status ON ninja.invoices(status);
CREATE INDEX idx_invoices_stripe ON ninja.invoices(stripe_invoice_id);
CREATE INDEX idx_invoices_created ON ninja.invoices(created_at);

-- ═══════════════════════════════════════════════════════════════════════
-- 5. UPDATE EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- app_settings: add freemium config
ALTER TABLE ninja.app_settings
  ADD COLUMN IF NOT EXISTS free_leads_limit INT DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS trial_period_days INT DEFAULT 14,
  ADD COLUMN IF NOT EXISTS overage_price_cents INT DEFAULT 10,
  ADD COLUMN IF NOT EXISTS stripe_api_key_public TEXT,
  ADD COLUMN IF NOT EXISTS stripe_api_key_secret TEXT ENCRYPTED WITH (
    algorithm = 'aes-256-cbc',
    key = 'stripe-keys'
  );

-- campaigns: track lead count + archive
ALTER TABLE ninja.campaigns
  ADD COLUMN IF NOT EXISTS leads_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_campaigns_leads_count ON ninja.campaigns(leads_count);

-- ═══════════════════════════════════════════════════════════════════════
-- 6. TRIGGER: Auto-create subscription on first auth login
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ninja.create_default_subscription()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new user is created in auth.users, auto-assign Free plan
  INSERT INTO ninja.user_subscriptions (
    customer_id,
    plan_id,
    status,
    billing_period_start,
    billing_period_end
  )
  VALUES (
    NEW.id,
    (SELECT id FROM ninja.billing_plans WHERE tier = 'free' LIMIT 1),
    'active',
    now(),
    now() + interval '1 month'
  )
  ON CONFLICT (customer_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION ninja.create_default_subscription();

-- ═══════════════════════════════════════════════════════════════════════
-- 7. UTILITY FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Get current subscription + plan
CREATE OR REPLACE FUNCTION ninja.get_user_subscription_info(customer_id_param UUID)
RETURNS TABLE(
  subscription_id UUID,
  plan_name TEXT,
  tier TEXT,
  monthly_leads_limit INT,
  leads_used_this_month INT,
  leads_remaining INT,
  is_free_tier BOOLEAN,
  billing_period_end TIMESTAMPTZ,
  status TEXT,
  stripe_subscription_id TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    us.id,
    bp.name,
    bp.tier,
    bp.monthly_leads_limit,
    us.leads_used_this_month,
    CASE 
      WHEN bp.monthly_leads_limit = -1 THEN -1
      ELSE bp.monthly_leads_limit - us.leads_used_this_month
    END,
    bp.tier = 'free',
    us.billing_period_end,
    us.status,
    us.stripe_subscription_id
  FROM ninja.user_subscriptions us
  JOIN ninja.billing_plans bp ON us.plan_id = bp.id
  WHERE us.customer_id = customer_id_param
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Check if user can add N leads
CREATE OR REPLACE FUNCTION ninja.can_add_leads(customer_id_param UUID, leads_to_add INT)
RETURNS TABLE(allowed BOOLEAN, reason TEXT) AS $$
DECLARE
  v_leads_remaining INT;
  v_tier TEXT;
BEGIN
  SELECT
    CASE 
      WHEN bp.monthly_leads_limit = -1 THEN 999999
      ELSE bp.monthly_leads_limit - us.leads_used_this_month
    END,
    bp.tier
  INTO v_leads_remaining, v_tier
  FROM ninja.user_subscriptions us
  JOIN ninja.billing_plans bp ON us.plan_id = bp.id
  WHERE us.customer_id = customer_id_param
  AND us.status NOT IN ('canceled', 'unpaid');
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'No active subscription found'::TEXT;
    RETURN;
  END IF;
  
  IF v_leads_remaining >= leads_to_add THEN
    RETURN QUERY SELECT true, 'OK'::TEXT;
  ELSE
    RETURN QUERY SELECT false, format('Insufficient quota. %s plan allows %s more leads.', v_tier, v_leads_remaining)::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Log lead usage
CREATE OR REPLACE FUNCTION ninja.log_lead_usage(
  customer_id_param UUID,
  campaign_id_param UUID,
  leads_count_param INT,
  action_param TEXT,
  note_param TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  usage_id UUID;
BEGIN
  INSERT INTO ninja.usage_logs (customer_id, campaign_id, action, leads_count, note)
  VALUES (customer_id_param, campaign_id_param, action_param, leads_count_param, note_param)
  RETURNING id INTO usage_id;
  
  -- Update subscription usage
  UPDATE ninja.user_subscriptions
  SET leads_used_this_month = leads_used_this_month + leads_count_param
  WHERE customer_id = customer_id_param
  AND now() BETWEEN billing_period_start AND billing_period_end;
  
  RETURN usage_id;
END;
$$ LANGUAGE plpgsql;

-- Monthly reset (run by cron)
CREATE OR REPLACE FUNCTION ninja.reset_monthly_usage()
RETURNS TABLE(updated_count INT) AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE ninja.user_subscriptions
  SET 
    leads_used_this_month = 0,
    overage_charges_cents = 0,
    billing_period_start = now(),
    billing_period_end = now() + interval '1 month'
  WHERE billing_period_end <= now()
  AND status NOT IN ('canceled', 'unpaid');
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN QUERY SELECT v_updated;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION ninja.get_user_subscription_info TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION ninja.can_add_leads TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION ninja.log_lead_usage TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION ninja.reset_monthly_usage TO authenticated, service_role;
