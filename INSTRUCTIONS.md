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

## Troubleshooting

- **"ninja schema not found" errors** — Make sure `ninja` is in your PostgREST exposed schemas and you've applied all migrations.
- **Edge Functions returning 404** — The `main/index.ts` router must exist. It dispatches all function calls.
- **Worker not picking up jobs** — Check that `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are correct in the worker `.env`. Verify the worker can reach the database.
- **Auth not working** — Ensure Google OAuth is configured in both Google Cloud Console and Supabase Auth settings.
