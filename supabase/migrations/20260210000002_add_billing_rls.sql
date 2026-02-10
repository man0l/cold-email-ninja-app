-- Migration 20260210000002: Row Level Security (RLS) policies for billing tables

-- ═══════════════════════════════════════════════════════════════════════
-- ENABLE RLS ON BILLING TABLES
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE ninja.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninja.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninja.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ninja.invoices ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════
-- POLICIES: billing_plans (public read)
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "billing_plans are public readable" 
  ON ninja.billing_plans 
  FOR SELECT 
  USING (active = true);

-- Only service_role can modify
CREATE POLICY "only service role can modify billing plans" 
  ON ninja.billing_plans 
  FOR ALL 
  USING (false);

-- ═══════════════════════════════════════════════════════════════════════
-- POLICIES: user_subscriptions (users can see only their own)
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "users can view own subscription" 
  ON ninja.user_subscriptions 
  FOR SELECT 
  USING (customer_id = auth.uid());

CREATE POLICY "users can update own subscription" 
  ON ninja.user_subscriptions 
  FOR UPDATE 
  USING (customer_id = auth.uid())
  WITH CHECK (
    -- Can only update auto_renew, trial_ends_at, cancel_reason
    -- Cannot modify plan_id, stripe_*_id, leads_used_this_month, status directly
    customer_id = auth.uid()
  );

-- Service role can insert/update for payment webhooks
CREATE POLICY "service role manages subscriptions" 
  ON ninja.user_subscriptions 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════
-- POLICIES: usage_logs (users can read own, insert own)
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "users can read own usage logs" 
  ON ninja.usage_logs 
  FOR SELECT 
  USING (customer_id = auth.uid());

CREATE POLICY "service role logs lead usage" 
  ON ninja.usage_logs 
  FOR INSERT 
  WITH CHECK (auth.role() = 'service_role');

-- Log inserts are immutable (no updates)
CREATE POLICY "usage logs immutable" 
  ON ninja.usage_logs 
  FOR UPDATE 
  USING (false);

-- ═══════════════════════════════════════════════════════════════════════
-- POLICIES: invoices (users can read own, service role manages)
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "users can read own invoices" 
  ON ninja.invoices 
  FOR SELECT 
  USING (customer_id = auth.uid());

CREATE POLICY "service role manages invoices" 
  ON ninja.invoices 
  FOR ALL 
  USING (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════════════
-- RESTRICT RLS ON UPDATED TABLES
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users can view own api_keys" ON ninja.api_keys;
CREATE POLICY "users can view own api_keys" 
  ON ninja.api_keys 
  FOR SELECT 
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "users can modify own app_settings" ON ninja.app_settings;
CREATE POLICY "users can modify own app_settings" 
  ON ninja.app_settings 
  FOR SELECT 
  USING (customer_id = auth.uid());

-- Public billing settings (for all users to read config)
CREATE POLICY "app_settings billing config is readable" 
  ON ninja.app_settings 
  FOR SELECT 
  USING (customer_id IS NULL);
