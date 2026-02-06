# Cold Email Ninja - Mobile App

React Native mobile app for managing cold email campaigns, backed by a self-hosted Supabase instance with Python workers for heavy processing.

## Architecture

```
mobile/         React Native (Expo) + NativeWind + shadcn-style components
supabase/       Migrations (ninja schema) + Edge Functions
workers/        Contabo Python workers for long-running jobs
```

**Database:** All data lives in the `ninja` PostgreSQL schema on the self-hosted Supabase at `api.zenmanager.eu`, fully isolated from the existing `public` schema.

**Backend:** 13 Supabase Edge Functions handle API requests. Long-running tasks (scraping, enrichment) are dispatched as `bulk_jobs` and processed by Contabo Python workers.

**Frontend:** Expo Router with tab navigation, NativeWind (Tailwind CSS), and shadcn-style components. TanStack React Query for data fetching, Supabase Realtime for live job progress.

## Setup

### 1. Apply Database Migrations

```bash
# Via psql (recommended)
cd supabase
./apply_migrations.sh "postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:5432/postgres"
```

### 2. Configure PostgREST

Add `ninja` to the exposed schemas in your Supabase Docker config:

```
PGRST_DB_SCHEMAS=public,ninja
```

Restart PostgREST: `docker compose restart rest`

### 3. Deploy Edge Functions

```bash
supabase functions deploy --project-ref YOUR_REF
```

### 4. Start Contabo Worker

```bash
cd workers
pip install -r requirements.txt
cp .env.example .env  # Fill in credentials
python worker.py
```

### 5. Run Mobile App

```bash
cd mobile
npm install
npx expo start
```

## Enrichment Pipeline

1. **Find Emails** - OpenWeb Ninja API (emails, phones, socials)
2. **Find Decision Makers** - Waterfall: About pages -> LinkedIn
3. **Find DM Emails** - Anymail Finder API
4. **Clean & Validate** - HTTP 200 website validation
5. **Casualise Names** - Remove Inc/LLC/Agency suffixes
6. **Clean Spam** - Remove 400+ spam trigger keywords
