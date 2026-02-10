# Billing System Testing Guide

## Local Development Setup

### 1. Get Stripe Test Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Enable **Test Mode** (toggle in top-right)
3. Copy your test keys:
   - **Publishable Key**: `pk_test_...`
   - **Secret Key**: `sk_test_...`

### 2. Environment Setup

Create `.env` in the Supabase project root:

```env
STRIPE_API_KEY_PUBLIC=pk_test_YOUR_KEY_HERE
STRIPE_API_KEY_SECRET=sk_test_YOUR_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_test_YOUR_SECRET_HERE
```

### 3. Create Stripe Products (Test Mode)

Via [Stripe Dashboard](https://dashboard.stripe.com/test/products):

#### Product 1: Free Plan
- **Name**: Free
- **Price**: $0/month (recurring)
- **Metadata**: `plan_id=free`, `leads_limit=1000`

#### Product 2: Pro Plan
- **Name**: Pro
- **Price**: $29.00/month (recurring)
- **Metadata**: `plan_id=pro`, `leads_limit=10000`

#### Product 3: Enterprise
- **Name**: Enterprise
- **Price**: Custom
- **Metadata**: `plan_id=enterprise`, `leads_limit=-1`

### 4. Local Webhook Testing

Use **Stripe CLI** to test webhooks locally:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login (one-time)
stripe login

# Forward webhooks to your local machine
stripe listen --forward-to localhost:3000/functions/billing/webhook
```

This outputs a webhook signing secret. Add it to `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Manual Testing

### Test 1: Check Billing Info

```bash
curl -X GET http://localhost:3000/functions/billing/get-billing-info \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "subscription_id": "uuid",
  "plan_name": "Free",
  "tier": "free",
  "is_free_tier": true,
  "monthly_leads_limit": 1000,
  "leads_used_this_month": 0,
  "leads_remaining": 1000,
  "percent_used": 0,
  "billing_period_end": "2026-03-10T00:00:00Z",
  "status": "active"
}
```

### Test 2: Check Limits (Within Quota)

```bash
curl -X POST http://localhost:3000/functions/billing/check-limits \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "leads_to_add": 500 }'
```

Expected (allowed):
```json
{
  "allowed": true,
  "reason": "OK",
  "tier": "free",
  "leads_remaining": 500,
  "percent_used": 50
}
```

### Test 3: Check Limits (Over Quota)

```bash
curl -X POST http://localhost:3000/functions/billing/check-limits \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "leads_to_add": 1500 }'
```

Expected (denied):
```json
{
  "allowed": false,
  "reason": "Insufficient quota. free plan allows 1000 more leads.",
  "tier": "free",
  "leads_remaining": 1000,
  "percent_used": 0
}
```

### Test 4: Log Usage

```bash
curl -X POST http://localhost:3000/functions/billing/log-usage \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user-uuid",
    "campaign_id": "campaign-uuid",
    "leads_count": 150,
    "action": "scrape",
    "note": "Test scrape"
  }'
```

Response:
```json
{
  "success": true,
  "usage_log_id": "log-uuid",
  "leads_logged": 150,
  "action": "scrape"
}
```

### Test 5: Trigger Scrape (Should Check Limits)

```bash
curl -X POST http://localhost:3000/functions/trigger-scrape \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "campaign_id": "campaign-uuid",
    "keywords": ["restaurant", "cafe"],
    "max_leads": 2000
  }'
```

If user is over quota:
```json
{
  "error": "Billing limit exceeded",
  "reason": "Insufficient quota. free plan allows 1000 more leads.",
  "upgrade_required": true
}
```

Status: 403

## SQL Queries for Testing

```sql
-- Check user's subscription
SELECT * FROM ninja.get_user_subscription_info('USER-UUID');

-- Check if user can add leads
SELECT * FROM ninja.can_add_leads('USER-UUID', 500);

-- View usage history
SELECT * FROM ninja.usage_logs 
WHERE customer_id = 'USER-UUID' 
ORDER BY created_at DESC 
LIMIT 10;

-- View subscription details
SELECT 
  us.id,
  bp.name,
  us.leads_used_this_month,
  us.billing_period_start,
  us.billing_period_end,
  us.status
FROM ninja.user_subscriptions us
JOIN ninja.billing_plans bp ON us.plan_id = bp.id
WHERE us.customer_id = 'USER-UUID';

-- View invoices
SELECT * FROM ninja.invoices 
WHERE customer_id = 'USER-UUID'
ORDER BY created_at DESC;

-- Monthly reset (test)
SELECT * FROM ninja.reset_monthly_usage();
```

## Simulating Stripe Webhooks (Stripe CLI)

Once `stripe listen` is running, trigger events:

```bash
# Simulate subscription update
stripe trigger payment_intent.succeeded \
  --stripe-account=acct_YOUR_ACCOUNT

# List recent webhook events
stripe logs tail

# Manually send webhook to local endpoint
stripe trigger customer.subscription.updated \
  --override subscription_status=past_due
```

## Mobile App Testing

The mobile app includes billing UI at:
- **Screen**: `/app/billing.tsx`
- **Component**: `BillingLimitWarning` modal
- **Query Hooks**: 
  - `useBillingInfo()` — Get subscription info
  - `useCheckLeadLimit()` — Check if scrape allowed

### Test Flow:

1. Sign in as test user
2. Navigate to **Settings** → **Billing**
3. Should see:
   - Free plan details
   - 0/1000 leads used
   - Upgrade button
4. Attempt to scrape >1000 leads
5. Should show limit warning modal
6. After upgrading in Stripe, refresh billing info
7. Should show Pro plan

## Rate Limiting & Abuse Prevention

The billing system includes:
- **RLS policies** — Users can only query their own data
- **Immutable logs** — `usage_logs` cannot be edited after creation
- **Monthly reset** — Usage resets automatically
- **Invoice idempotency** — Duplicate webhooks are safely ignored

## Production Checklist

- [ ] Stripe webhook configured in [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
- [ ] Webhook URL is publicly accessible
- [ ] `STRIPE_WEBHOOK_SECRET` environment variable set
- [ ] All migrations applied to production database
- [ ] RLS policies enabled on all billing tables
- [ ] Monitoring/alerting set up for webhook failures
- [ ] Stripe customer ID synced when users upgrade
- [ ] Monthly cron job configured for usage reset
- [ ] Billing dashboard visible in mobile app
- [ ] Test payment processed successfully

## Troubleshooting

**Q: Webhook not triggering**
- Verify webhook URL is accessible from internet
- Check Stripe Dashboard → Webhooks for delivery logs
- Ensure `STRIPE_WEBHOOK_SECRET` matches exactly

**Q: User can't upgrade**
- Verify Stripe products exist in test mode
- Check browser console for JS errors
- Ensure Stripe Checkout/Payment Element is loaded

**Q: Usage not incrementing**
- Verify job completes successfully
- Check `usage_logs` table for records
- Confirm `log_lead_usage()` RPC is being called

**Q: RLS preventing access**
- Verify user is authenticated
- Check RLS policies on `user_subscriptions` table
- Ensure `auth.uid()` matches `customer_id` in records
