# Rika

AI meeting notetaker. Paste a link (or connect a calendar) → Rika joins Zoom, Google Meet, or Microsoft Teams → records + transcripts → ask her what was said.

She answers after the call (web RAG chat) and live during it (`@Rika` in the meeting chat). Post-meeting she also generates a summary, action items, and highlights.

Full architecture, API surface, data model, and design decisions: **[project.md](./project.md)**. Phase tracker: **[plan.md](./plan.md)**.

---

## Features

- **Join now** — paste a Zoom / Meet / Teams URL and Rika joins immediately
- **Calendar sync** — Google Calendar + Outlook (via Recall Calendar V2); multiple accounts per provider
- **Auto-record** — schedule bots for synced invites with a per-provider toggle
- **Speaker-attributed transcripts** with media sync (click a line to seek)
- **Meeting intelligence** — summary, action items, highlights after `bot.done`
- **RAG chat** — per-meeting or category-scoped Q&A with citations
- **Live `@Rika` chat** — ask questions in the meeting chat during the call
- **Categories** — group related meetings and chat across that series
- **Export** — transcript as TXT, SRT, or PDF
- **Auth** — Clerk multi-user with resource ownership

---

## Tech stack

| Layer | Choice |
|-------|--------|
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Auth | Clerk |
| Database | Neon Postgres + Drizzle ORM |
| Vectors | Qdrant Cloud |
| Meetings | Recall.ai (bots, Calendar V2, realtime chat) |
| Embeddings | Google Gemini (`gemini-embedding-001`, 768-d) |
| Chat / notes | DeepSeek (`deepseek-chat`) via Vercel AI SDK |
| Rate limits | Upstash Redis |
| UI | shadcn/ui (base-nova), Framer Motion |

---

## Prerequisites

- Node.js 20+
- Accounts / projects for:
  - [Clerk](https://clerk.com)
  - [Neon](https://neon.tech) Postgres
  - [Qdrant Cloud](https://qdrant.tech)
  - [Recall.ai](https://recall.ai)
  - [Google AI](https://ai.google.dev) (Gemini embeddings)
  - [DeepSeek](https://platform.deepseek.com)
  - [Upstash](https://upstash.com) Redis
  - Google Cloud OAuth (Calendar) — and optionally Azure app for Outlook

---

## Setup

```bash
npm install
```

Create `.env.local` with the variables below, then:

```bash
npm run db:migrate      # apply Drizzle migrations
npm run db:seed         # optional: seed a user by SEED_USER_EMAIL
npm run vector:setup    # create Qdrant transcript_chunks collection + indexes
npm run dev             # http://localhost:3000
```

### Recall webhooks

Rika needs a **public** URL for Recall webhooks (`bot.done`, calendar sync, live chat). For local development, use a tunnel (e.g. ngrok, Cloudflare Tunnel) and set `APP_BASE_URL` to that origin. Register the webhook in the Recall dashboard pointing at:

```
{APP_BASE_URL}/api/webhooks/recall
```

Until this is wired, completed meetings may need manual reprocessing, and auto-record only schedules events present when you toggle it on.

---

## Two Recall accounts

Keep the original account's `RECALL_API_KEY`, `RECALL_API_REGION`, and
`RECALL_WEBHOOK_SECRET` unchanged. Configure the additional account with:

```dotenv
RECALL_SECONDARY_API_KEY=<second account API key>
RECALL_SECONDARY_API_REGION=<second account region>
RECALL_SECONDARY_WEBHOOK_SECRET=<second account webhook signing secret>
RECALL_DEFAULT_ACCOUNT=primary
```

Use `primary` or `secondary` for `RECALL_DEFAULT_ACCOUNT`. It controls new
manual joins and newly connected calendars. The Join now form also lets you
choose either configured account. Keys and webhook secrets remain server-side.
There is no automatic account switching when credits or quotas are exhausted.

Both Recall dashboards should deliver webhooks to
`{APP_BASE_URL}/api/webhooks/recall`. Configure each account's own signing secret
above. Bot requests also send live chat and transcript events to this endpoint.

Run `npm run db:migrate` before starting or deploying this version. Migration
`0008_recall_accounts` assigns existing meetings and calendar connections to
`primary`; later resources save the account used to create them. Retrieving
recordings, stopping bots, live replies, and calendar sync always use that saved
account, even after the default changes. Retain the original credentials to
keep access to older resources.

Existing calendar connections stay on their original account. To use the
secondary account for calendar bots, set the default to `secondary` and connect
the calendar again. The connections remain separate for each Recall account;
disable auto-record on the old connection to avoid scheduling duplicate bots.
Changing the default does not transfer resources between Recall accounts.

Set these variables in `.env.local` for local development and in your deployment
environment for production, then restart or redeploy. Run
`npm run test:recall` to verify routing and signatures without contacting Recall.

---

## Environment variables

Create `.env.local` with:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `QUADRANT_CLUSTER_ENDPOINT` | Qdrant cluster URL |
| `QUADRANT_API_KEY` | Qdrant API key |
| `RECALL_API_KEY` | Recall API key |
| `RECALL_API_REGION` | Recall region (e.g. `us-east-1`) |
| `RECALL_WEBHOOK_SECRET` | Svix webhook signing secret |
| `GEMINI_API_KEY` | Gemini embeddings |
| `DEEPSEEK_API_KEY` | Chat, classifier, meeting intelligence |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google Calendar OAuth |
| `MICROSOFT_OAUTH_CLIENT_ID` / `MICROSOFT_OAUTH_CLIENT_SECRET` | Outlook OAuth |
| `APP_BASE_URL` | Public origin, no trailing slash (webhooks / realtime) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Rate limiting |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Clerk |
| `SEED_USER_EMAIL` | Optional; used by `npm run db:seed` |

Env names `QUADRANT_*` are intentional (mapped to `env.QDRANT_*` in code).

---

## Scripts

```bash
npm run dev           # development server
npm run build         # production build
npm run start         # run production server
npm run lint          # ESLint
npm run db:generate   # generate migrations from schema
npm run db:migrate    # apply migrations
npm run db:studio     # Drizzle Studio
npm run db:seed       # seed user
npm run vector:setup  # create Qdrant collection
```

---

## Project structure

```
app/                  # App Router pages + API routes
components/           # UI (landing, dashboard, shadcn primitives)
lib/
  ai/                 # RAG, embeddings, meeting intelligence
  db/                 # Drizzle schema, client, migrations
  recall/             # Recall client, webhook processing, live chat
  vector/             # Qdrant helpers
  auth.ts             # Clerk → app user resolution
  env.ts              # Required env getters
proxy.ts              # Clerk middleware (Next.js 16)
```

---

## How it works (short)

1. **Join** — UI creates a Recall bot (`POST /api/bots` or calendar schedule).
2. **Capture** — Recall records + transcripts; media stays on Recall signed URLs.
3. **Process** — On `bot.done`, webhook verifies signature, then chunks → embeds (Gemini) → upserts Qdrant → writes Postgres → generates notes (DeepSeek).
4. **Ask** — Web chat and live `@Rika` retrieve relevant chunks from Qdrant and answer with DeepSeek, citing transcript excerpts.

See [project.md](./project.md) for pipelines, schema, API table, and design decisions.

---

## License

Private — all rights reserved.
