# ZeroGTM: The Local-First, Agentic GTM Engine

> Stop paying the "SaaS Tax." Build your proprietary revenue moat with an Open-Source AI SDR Agent.

**Docs & site:** [https://man0l.github.io/zero-gtm/](https://man0l.github.io/zero-gtm/)

Traditional B2B outreach is dying under the weight of "spray and pray" volume. **ZeroGTM** is a precision-engineered, signal-driven engine that transitions your GTM motion from manual labor to **Agentic AI Orchestration**.

Designed for the modern GTM Engineer, ZeroGTM turns Google Maps into a high-intent lead goldmine, enriched with deep research, and managed entirely from a mobile-first interface.

---

## The Problem: The "Pipeline Crisis" & SaaS Bloat

The 12-tool sales stack has become an operational liability. Between $100k/year human SDRs and "black-box" AI platforms charging $2k/month, the unit economics of scale are broken.

- **Saturation:** Cold email is flooded; only hyper-personalized, signal-led outreach wins.
- **Privacy:** Sending your lead data to 3rd party clouds introduces "sync states" and security risks.
- **Cost:** Task-based automation (Zapier) becomes cost-prohibitive at scale.

---

## The Solution: GTM Engineering as Code

ZeroGTM is a **local-first, self-hosted** alternative to legacy outreach platforms. It treats Infrastructure as Code, utilizing n8n for execution-based orchestration to give you 100% control over your data and deliverability.

### The Enrichment Pipeline (The "OpenWeb" Flow)

1. **Map Scrape** - Hyper-local lead extraction via RapidAPI (Google Maps).
2. **Contact Mining** - Deep-crawl socials, phones, and emails via OpenWeb Ninja.
3. **DM Identification** - Agentic scraping of "About" pages to find true Decision Makers.
4. **Identity Verification** - Precision email discovery via Anymail Finder.
5. **Data Sanitization** - Automated HTTP 200 validation & casualization (removing "Inc/LLC").

---

## AI SDR Unit Economics: The 71% Savings

| Cost Category   | Human SDR (Annual) | OpenSDR (Annual)        | Variance |
| --------------- | ------------------ | ----------------------- | -------- |
| Compensation    | $60,000            | **$0**                  | -100%    |
| Tech Stack      | $3,000             | $6,000 (APIs/Compute)   | +100%    |
| Management      | $12,000            | $2,000 (Ops/Eng)        | -83%     |
| **Total Cost**  | **$98,000**        | **$28,000**             | **71% Savings** |

---

## Mobile-First Sales Engagement

In 2026, "Speed to Lead" happens on a smartphone. ZeroGTM is designed with a Workflow-Simplification UX:

- **Thumb-Friendly UI:** Swipe to approve leads or trigger AI sequences.
- **Offline-First:** View your pipeline and research leads without an active connection.
- **Push-to-Action:** Get real-time intent signals (e.g., "Lead mentioned competitor on Reddit") delivered via mobile alerts.

---

## Technical Architecture

- **Orchestration:** n8n (Execution-based for unlimited scale).
- **Logic:** Python/JavaScript custom nodes for proprietary data manipulation.
- **Database:** PostgreSQL (Self-hosted) for full data provenance.
- **AI:** LangChain + Local LLM support (Ollama) for hyper-personalized opening lines.

---

## Getting Started

### 1. Clone the Infrastructure

```bash
git clone https://github.com/man0l/cold-email-ninja-app.git
cd cold-email-ninja-app
docker-compose up -d
```

### 2. Configure n8n Workflow

Import the `gtm_engine_v1.json` into your n8n instance. This contains the pre-built Enrichment Pipeline and SISR (Scalable Inbox and Sender Reputation) rotation logic.

### 3. Connect APIs

Add your credentials for:

- RapidAPI (Google Maps)
- OpenWeb Ninja
- Anymail Finder
- OpenAI / Anthropic (for Agentic Research)

---

## Strategic Seasonality & Trends

Hiring for GTM Engineers peaks in January and July. ZeroGTM is built to align with these Q1/Q3 budget resets, providing a plug-and-play system for organizations moving away from volume-based motions toward signal-driven precision.

---

## Contributing

We are looking for GTM Engineers to help build:

- **Reddit "Goldmine" Listeners:** Automated intent scraping from niche subreddits.
- **Local-First Sync:** Enhanced offline capabilities for field sales.
- **International Parity:** Better localized AI summaries for non-US markets.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
