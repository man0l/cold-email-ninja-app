# Setup Instructions

This guide walks you through setting up OpenSDR from scratch. The system has three components: a **Supabase backend** (database + Edge Functions), a **Python worker** for long-running jobs, and a **React Native mobile app**.

---

## Prerequisites

- **Node.js** >= 18
- **Python** >= 3.11
- **Supabase CLI** (`npm install -g supabase`)
- **Expo CLI** (`npm install -g expo-cli`)
- A **Supabase project** (cloud or self-hosted)
- API keys for enrichment services (see [Step 5](#5-configure-api-keys))

---

## 1. Clone the Repository

```bash
git clone https://github.com/man0l/cold-email-ninja-app.git
cd cold-email-ninja-app
```

---

## 2. Set Up Supabase

You can use either **Supabase Cloud** (recommended for getting started) or a **self-hosted** instance.

### Option A: Supabase Cloud

1. Create a new project at [supabase.com](https://supabase.com).
2. Go to **Project Settings > Database** and copy the connection string (URI format).
3. Expose the `ninja` schema via PostgREST:
   - Go to **Project Settings > API > Exposed schemas** and add `ninja` to the list.

### Option B: Self-Hosted Supabase

If you're running Supabase via Docker Compose, add `ninja` to the PostgREST config:

```
PGRST_DB_SCHEMAS=public,ninja
```

Then restart PostgREST: `docker compose restart rest`

### Apply Migrations

All database tables live in a dedicated `ninja` schema, fully isolated from the default `public` schema.

**Using the Supabase CLI (recommended):**

```bash
supabase db push --db-url "YOUR_DATABASE_CONNECTION_STRING"
```

**Or using the included shell script:**

```bash
cd supabase
./apply_migrations.sh "postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:5432/postgres"
```

This creates the `ninja` schema with all tables: `campaigns`, `leads`, `bulk_jobs`, `enrichment_jobs`, `api_keys`, `app_settings`, and more.

---

## 3. Deploy Edge Functions

Edge Functions handle API requests from the mobile app (triggering scrapes, enrichment, data cleanup, etc.).

### Supabase Cloud

```bash
supabase functions deploy --project-ref YOUR_PROJECT_REF
```

### Self-Hosted

Edge Functions are packaged into a Docker image via `supabase/Dockerfile.functions`. If you're using the CI/CD pipeline, pushing to `main` builds and deploys automatically via GitHub Actions + Watchtower.

For manual builds:

```bash
docker build -t opensdr-functions -f supabase/Dockerfile.functions ./supabase
```

---

## 4. Set Up the Worker

The Python worker polls the `bulk_jobs` table and processes long-running tasks (scraping Google Maps, enriching leads, cleaning data).

```bash
cd workers
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Fill in your credentials:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase API URL (e.g. `https://xyzproject.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Service role key (from Supabase dashboard > API) |
| `OPENAI_API_KEY` | OpenAI key (for AI-powered enrichment) |
| `OPENWEBNINJA_API_KEY` | OpenWeb Ninja key (email/social discovery) |
| `ANYMAIL_FINDER_API_KEY` | Anymail Finder key (decision-maker emails) |
| `RAPIDAPI_MAPS_DATA_API_KEY` | RapidAPI key (Google Maps scraping) |
| `RAPIDAPI_LI_DATA_SCRAPER_KEY` | RapidAPI key (LinkedIn data) |
| `DATAFORSEO_USERNAME` | DataForSEO username (optional) |
| `DATAFORSEO_PASSWORD` | DataForSEO password (optional) |

Start the worker:

```bash
python worker.py
```

The worker runs in a loop, polling for new jobs every 5 seconds (configurable via `WORKER_POLL_INTERVAL`).

For production, the worker runs as a Docker container. The CI/CD pipeline builds and pushes the image to GHCR on every push to `main`, and Watchtower auto-pulls on the server.

---

## 5. Configure API Keys

OpenSDR uses several external APIs for the enrichment pipeline. You need at minimum:

| Service | Used For | Required? |
|---|---|---|
| **RapidAPI** (Maps Data) | Scraping Google Maps for leads | Yes |
| **OpenWeb Ninja** | Finding emails, phones, socials | Yes |
| **Anymail Finder** | Finding decision-maker emails | Yes |
| **OpenAI / Anthropic** | AI-powered name casualisation, icebreakers | Recommended |
| **RapidAPI** (LinkedIn) | LinkedIn profile scraping | Optional |
| **DataForSEO** | Additional SEO data | Optional |

API keys are configured in two places:
1. **Worker `.env` file** — used by the Python worker directly.
2. **In-app Settings** — users can add their own API keys via the mobile app's Settings screen, stored in the `ninja.api_keys` table.

---

## 6. Run the Mobile App

```bash
cd mobile
npm install
```

Create a `.env` file (or set environment variables) with your Supabase credentials:

```
EXPO_PUBLIC_SUPABASE_URL=https://xyzproject.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Start the development server:

```bash
npx expo start
```

This works on iOS, Android, and Web. For web specifically:

```bash
npx expo start --web
```

### Authentication

The app uses Supabase Auth with Google OAuth. The `auth-relay` Edge Function handles the OAuth flow for the mobile app. You'll need to:

1. Set up a Google OAuth client in the [Google Cloud Console](https://console.cloud.google.com/).
2. Configure the Google provider in your Supabase project under **Authentication > Providers > Google**.

---

## 7. CI/CD (Optional)

The repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that deploys all three components on push to `main`:

1. **Worker** — builds Docker image, pushes to GHCR, Watchtower auto-pulls on the server.
2. **Edge Functions** — builds Docker image with functions baked in, pushes to GHCR, Watchtower auto-pulls.
3. **Migrations** — runs `supabase db push` directly against the database.

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `SUPABASE_DB_URL` | Direct PostgreSQL connection string |

The workflow uses `GITHUB_TOKEN` (automatic) for GHCR authentication.

---

## Project Structure

```
cold-email-ninja-app/
├── mobile/              # React Native (Expo) app
│   ├── app/             # Screens (file-based routing via Expo Router)
│   ├── components/      # Reusable UI components
│   ├── hooks/           # Realtime subscription hooks
│   └── lib/             # Supabase client, queries, types, auth
├── supabase/
│   ├── functions/       # Edge Functions (Deno/TypeScript)
│   │   ├── _shared/     # Shared utilities (client, CORS, responses)
│   │   └── main/        # Edge Runtime router (required entrypoint)
│   └── migrations/      # SQL migrations (applied sequentially)
└── workers/             # Python workers for long-running jobs
    ├── worker.py        # Main polling loop
    ├── base.py          # Base worker class
    └── *.py             # Individual job processors
```

---

## Enrichment Pipeline

Once everything is running, the enrichment pipeline works as follows:

1. **Scrape** — Extract leads from Google Maps by location + keyword.
2. **Clean** — Validate websites (HTTP 200 check) and filter unwanted categories.
3. **Find Emails** — Discover emails, phones, and socials via OpenWeb Ninja.
4. **Find Decision Makers** — Scrape "About" pages, then fall back to LinkedIn.
5. **Find DM Emails** — Get verified decision-maker emails via Anymail Finder.
6. **Casualise Names** — Strip "Inc/LLC/Agency" suffixes using heuristics + AI.
7. **Clean Spam** — Remove 400+ spam trigger keywords from company names.

Steps 1-5 run as async background jobs (via the worker). Steps 6-7 run inline in Edge Functions.

---

## Billing & Subscription System

ZeroGTM includes a built-in freemium billing system with Stripe integration for handling paid subscriptions.

### Overview

- **Free Plan**: 1,000 leads/month (unlimited users)
- **Pro Plan**: 10,000 leads/month at $29/month
- **Enterprise**: Unlimited leads (custom pricing)

All users automatically start on the Free plan. The system tracks monthly usage and enforces quotas before allowing scrapes/imports.

### Setup

#### 1. Database Migrations (Automatic)

Run all migrations:

```bash
cd supabase
./apply_migrations.sh
```

This creates:
- `ninja.billing_plans` — Plan definitions
- `ninja.user_subscriptions` — Per-user subscription + usage tracking
- `ninja.usage_logs` — Immutable lead creation audit log
- `ninja.invoices` — Billing history for each period

All billing tables have:
- **Row-Level Security (RLS)** — Users can only see their own data
- **Indexes** — Optimized for queries by `customer_id` and date ranges

#### 2. Stripe Configuration (Required for Paid Plans)

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Create three **Products**:
   - `Free` — $0/month, 1,000 leads/month
   - `Pro` — $29/month, 10,000 leads/month
   - `Enterprise` — Custom pricing, unlimited leads

3. Copy your Stripe API keys to your `.env`:
   ```env
   STRIPE_API_KEY_PUBLIC=pk_...
   STRIPE_API_KEY_SECRET=sk_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

4. Configure webhook endpoint in Stripe dashboard:
   - **URL**: `https://your-api.example.com/functions/billing/webhook`
   - **Events**: 
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

#### 3. Environment Variables

Add to `.env` (Supabase backend):

```env
STRIPE_API_KEY_PUBLIC=pk_test_...
STRIPE_API_KEY_SECRET=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
```

### How It Works

#### User Signup

1. User signs up via Google OAuth
2. `ninja.user_subscriptions` row is automatically created
3. Plan is set to "Free" (1,000 leads/month)
4. Subscription status: `active`

#### Scraping/Importing Leads

Before creating a scrape or import job:

1. Client calls `/functions/billing/check-limits` with `leads_to_add`
2. Server checks if user's remaining quota >= leads_to_add
3. If **over quota** on Free tier:
   - Request blocked with 403 error
   - UI shows upgrade prompt
4. If **quota OK**:
   - Job is created
   - After completion, system calls `/functions/billing/log-usage`
   - Lead count is incremented in `user_subscriptions`

#### Monthly Reset

Every month at UTC 00:00, a scheduled job (`ninja.reset_monthly_usage()`) runs:

```sql
UPDATE ninja.user_subscriptions
SET leads_used_this_month = 0,
    billing_period_start = now(),
    billing_period_end = now() + interval '1 month'
WHERE billing_period_end <= now();
```

#### Stripe Webhook Processing

When Stripe sends an event:

1. **Subscription Updated** — Update `status`, `billing_period_start/end`
2. **Subscription Deleted** — Mark as `canceled`
3. **Invoice Paid** — Create invoice record, mark as `paid`
4. **Invoice Failed** — Mark subscription as `past_due`, invoice as `failed`

### API Endpoints

#### `GET /functions/billing/get-billing-info`

Returns user's current subscription & usage:

```json
{
  "subscription_id": "uuid",
  "plan_name": "Free",
  "tier": "free",
  "is_free_tier": true,
  "monthly_leads_limit": 1000,
  "leads_used_this_month": 750,
  "leads_remaining": 250,
  "percent_used": 75,
  "billing_period_end": "2026-03-10T00:00:00Z",
  "status": "active",
  "stripe_subscription_id": "sub_..."
}
```

#### `POST /functions/billing/check-limits`

Check if user can add N leads:

**Request**:
```json
{ "leads_to_add": 500 }
```

**Response (OK)**:
```json
{
  "allowed": true,
  "reason": "OK",
  "tier": "free",
  "leads_remaining": 500,
  "percent_used": 50
}
```

**Response (Over Limit)**:
```json
{
  "allowed": false,
  "reason": "Insufficient quota. free plan allows 100 more leads.",
  "tier": "free",
  "leads_remaining": 100,
  "percent_used": 90
}
```

#### `POST /functions/billing/log-usage` (Service Role Only)

Log lead usage after successful job:

**Request**:
```json
{
  "customer_id": "uuid",
  "campaign_id": "uuid",
  "leads_count": 500,
  "action": "scrape",
  "bulk_job_id": "uuid",
  "note": "Google Maps scrape, NYC"
}
```

### Mobile UI Components

#### Billing Dashboard (`/app/billing.tsx`)

Shows:
- Current plan name & status
- Monthly usage progress bar
- Leads remaining this month
- Plan comparison table
- Upgrade/manage subscription buttons

#### Billing Limit Warning Modal (`BillingLimitWarning`)

Appears when:
- User attempts to scrape/import and quota is exceeded
- Usage is > 80% for Free tier

Shows:
- Current usage %
- Leads remaining
- Upgrade link

### Database Schema

```sql
-- Check subscription info
SELECT * FROM ninja.get_user_subscription_info('user-id-uuid');

-- Check if user can add 500 leads
SELECT * FROM ninja.can_add_leads('user-id-uuid', 500);

-- View usage history (immutable audit log)
SELECT * FROM ninja.usage_logs WHERE customer_id = 'user-id-uuid';

-- View all invoices for a user
SELECT * FROM ninja.invoices WHERE customer_id = 'user-id-uuid';
```

### Common Issues

- **"Insufficient quota" on Free plan** — User has hit 1,000 leads/month limit. Upgrade to Pro or wait until next month.
- **Stripe webhook not updating** — Verify webhook URL is accessible and `STRIPE_WEBHOOK_SECRET` is correct.
- **Subscription showing as `past_due` but payment succeeded** — Check Stripe logs; may be webhook processing delay.



- **"ninja schema not found" errors** — Make sure `ninja` is in your PostgREST exposed schemas and you've applied all migrations.
- **Edge Functions returning 404** — The `main/index.ts` router must exist. It dispatches all function calls.
- **Worker not picking up jobs** — Check that `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are correct in the worker `.env`. Verify the worker can reach the database.
- **Auth not working** — Ensure Google OAuth is configured in both Google Cloud Console and Supabase Auth settings.
