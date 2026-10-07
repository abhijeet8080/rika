# Rika — Project Documentation

Rika is an AI meeting notetaker. She joins Zoom, Google Meet, and Microsoft Teams calls, records audio/video, captures speaker-attributed transcripts, generates structured notes, and answers questions grounded in those transcripts — both after the meeting (web RAG chat) and live during the call (`@Rika` in the meeting chat).

This document is the single source of truth for what is implemented in the repository: product features, tech stack, architecture, data model, API surface, design decisions, and open work. Phase tracking lives in `plan.md`.

---

## Table of contents

1. [Product overview](#1-product-overview)
2. [Tech stack](#2-tech-stack)
3. [Repository layout](#3-repository-layout)
4. [Features](#4-features)
5. [Architecture & pipelines](#5-architecture--pipelines)
6. [Data model](#6-data-model)
7. [API routes](#7-api-routes)
8. [App pages & UI](#8-app-pages--ui)
9. [Integrations](#9-integrations)
10. [Auth model](#10-auth-model)
11. [AI / RAG design](#11-ai--rag-design)
12. [Design decisions](#12-design-decisions)
13. [Design system & UX](#13-design-system--ux)
14. [Environment & scripts](#14-environment--scripts)
15. [Phased delivery status](#15-phased-delivery-status)
16. [Outstanding / known gaps](#16-outstanding--known-gaps)
17. [Key source index](#17-key-source-index)

---

## 1. Product overview

**One-liner:** Paste a meeting link (or connect a calendar) → Rika joins → records + transcripts → ask her about what was said.

**Supported platforms:** Zoom, Google Meet, Microsoft Teams (Webex host detection exists in `lib/recall/platform.ts`).

**Bot display name:** `RIKA` — single constant (`BOT_DISPLAY_NAME` in `lib/recall/live-chat.ts`) shared by bot creation and the live-chat self-message guard. Must stay consistent or Rika replies to herself in a loop.

**Media policy:** Video/audio stays on Recall’s hosted signed URLs. The app stores metadata + transcript text in Postgres and embeddings in Qdrant.

### Core user journeys

| Journey | How |
|---------|-----|
| Join now | Paste a meeting URL on `/meetings` → bot joins immediately |
| Calendar record | Connect Google/Outlook → list upcoming events → click Record |
| Auto-record | Toggle per provider → bots schedule for synced invites |
| Post-meeting Q&A | Meeting detail chat, or category-scoped chat at `/chat` |
| Live in-meeting Q&A | Participants message `@Rika …` in the meeting chat |
| Meeting intelligence | Auto summary / action items / highlights after the call ends |
| Export | Download transcript as TXT, SRT, or PDF from the meeting workspace |

---

## 2. Tech stack

### Framework & language

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js 16.2** (App Router) | Breaking changes vs older Next — see `AGENTS.md` / `node_modules/next/dist/docs/` |
| UI | **React 19.2** | Server Components by default |
| Language | **TypeScript 5** | Strict project config; path alias `@/*` |
| Styling | **Tailwind CSS 4** | CSS-first config via `@theme` in `app/globals.css` |
| Components | **shadcn/ui** (`base-nova` style) + **Base UI** | Lucide icons; CSS variables themed to brand |
| Animation | **Framer Motion**, **GSAP** | Landing motion + reveal |
| Validation | **Zod** | Request/webhook payload schemas |

### Auth, data, AI, meetings

| Concern | Choice |
|---------|--------|
| Auth | **Clerk** (`@clerk/nextjs`) |
| Postgres | **Neon** (`@neondatabase/serverless`) |
| ORM | **Drizzle ORM** + `drizzle-kit` migrations |
| Vector DB | **Qdrant Cloud** (`@qdrant/js-client-rest`) — external, not Vercel Marketplace |
| Rate limiting | **Upstash Redis** (`@upstash/ratelimit` + `@upstash/redis`) |
| Meeting bots | **Recall.ai** (bots + Calendar V2 + realtime chat endpoints) |
| Embeddings | **Google Gemini** `gemini-embedding-001` @ **768 dims** |
| Chat / classify / notes | **DeepSeek** `deepseek-chat` via `@ai-sdk/deepseek` |
| AI orchestration | **Vercel AI SDK** (`ai` v7, `@ai-sdk/react`) |
| PDF export | **@react-pdf/renderer** |
| Calendar OAuth | Google Calendar + Microsoft Outlook (via Recall Calendar V2) |
| Observability | **Vercel Analytics** + **Vercel Speed Insights** (wired in root layout) |

### npm scripts

```bash
npm run dev           # Next dev server
npm run build         # Production build
npm run lint          # ESLint
npm run db:generate   # drizzle-kit generate
npm run db:migrate    # drizzle-kit migrate
npm run db:studio     # drizzle-kit studio
npm run db:seed       # Seed user from SEED_USER_EMAIL
npm run vector:setup  # Create Qdrant transcript_chunks collection + indexes
```

---

## 3. Repository layout

```
app/
  page.tsx                          # Landing (signed out) or redirect to /meetings
  layout.tsx                        # ClerkProvider, fonts, metadata, Analytics, Speed Insights
  sign-in/ / sign-up/               # Clerk catch-all auth pages
  privacy/ / terms/                 # Legal pages (draft)
  (dashboard)/
    layout.tsx                      # Studio app shell nav
    meetings/                       # List + join
    meetings/[id]/                 # Detail workspace
    chat/                           # Category-scoped RAG chat
    settings/calendar/              # Calendar connections
  api/
    bots/                           # Join-now
    meetings/[id]/                 # PATCH category / DELETE
    meetings/[id]/intelligence/    # Regenerate notes
    meetings/[id]/export/          # TXT / SRT / PDF
    chat/                           # Streaming RAG
    categories/                     # CRUD
    calendar/                       # Google + Outlook OAuth, events, auto-record
    webhooks/recall/                # Recall webhook receiver

components/
  landing/                          # Marketing site sections
  ui/                               # shadcn primitives
  legal/                            # Shared legal page chrome
  *.tsx                             # Dashboard feature components

lib/
  auth.ts / env.ts / utils.ts / clerk-appearance.ts / rate-limit.ts / format-date.ts
  db/                               # schema, client, seed, helpers, migrations
  ai/                               # embeddings, rag, model, meeting-intelligence
  recall/                           # client, process-meeting, live-chat, schedule, …
  vector/                           # Qdrant client, upsert/delete, setup script
  pdf/                              # Transcript PDF document
  hooks/use-categories.ts

proxy.ts                            # clerkMiddleware (Next 16 middleware replacement)
plan.md                             # Phase tracker
project.md                          # This document
```

---

## 4. Features

### 4.1 Join now

- Paste Zoom / Meet / Teams URL on `/meetings`.
- Optional record video / record audio toggles.
- `POST /api/bots` creates a Recall bot and a `meetings` row.
- Blocks duplicate active bots on the same URL (409).
- Rate-limited (10 bots / hour / user).
- Platform inferred from URL host (`lib/recall/platform.ts`).

### 4.2 Calendar integration

- **Google Calendar** OAuth connect/callback (forces `prompt=select_account` so multiple accounts can be linked).
- **Outlook / Microsoft** OAuth connect/callback implemented and ready on the backend; the connect button is currently hidden from the settings UI while Azure app approval is pending.
- Multiple accounts per provider, deduped on `(userId, provider, email)`.
- Upcoming events listed across all connections.
- Manual **Record** per event (`POST /api/calendar/events/[id]/schedule`) with optional category + A/V flags.
- Titles from calendar native fields (Google `summary` / Microsoft `subject`) via `lib/recall/event-title.ts`.

### 4.3 Auto-record

- Per-provider toggle on `/settings/calendar` (`autoRecord` on `calendar_connections`).
- Enabling backfills/schedules currently upcoming events immediately.
- Future invites rely on Recall `calendar.sync_events` webhook (requires registered public webhook URL).

### 4.4 Meetings browser

- Searchable list on `/meetings` with sections: upcoming, past, failed.
- Status badges mirroring Recall bot lifecycle (including `fatal:…` subcodes).
- Category badge, summary preview, and action-item count on rows.
- Delete meeting: cancel/leave bot if needed, then delete Qdrant points + Postgres chunks/participants/live chat + meeting row.

### 4.5 Meeting detail workspace

- Status, participants, platform, category selector.
- Video and/or audio player (Recall signed URLs refreshed on load).
- Speaker-attributed transcript with timestamps; click seeks media.
- Synced highlight between media playback and transcript.
- **Notes** tab (default when intelligence exists): summary, action items, seekable highlights.
- Per-meeting RAG chat tab.
- Transcript export: TXT, SRT, PDF.

### 4.6 Categories

- One category per meeting (not multi-tag); delete category → meetings become uncategorized (`ON DELETE SET NULL`).
- CRUD via `/api/categories` (+ DELETE by id).
- Assign via `PATCH /api/meetings/[id]` or when scheduling from calendar.
- Inline create/select in UI; no separate category admin page for v1.
- Category badge on meeting list rows.
- Chat at `/chat` scopes to a single category (no uncategorized / global “all meetings” surface).

### 4.7 Post-meeting RAG chat

- **Per-meeting** scope on the detail page.
- **Category** picker on `/chat` (categories only — no uncategorized option).
- Streaming answers via AI SDK UI message stream.
- Assistant replies render Markdown (lists, bold, tables, code); user messages stay plain text.
- Classifier skips RAG for greetings / non-meeting questions.
- Answers cite retrieved transcript excerpts.
- Rate-limited (30 requests / 5 minutes / user).

### 4.8 Live in-meeting `@Rika` chat

- Bot registers realtime webhook for `participant_events.chat_message`.
- Trigger: message matches `@?rika[,:\s]+…` (case-insensitive).
- Self-message guard using `BOT_DISPLAY_NAME` (`RIKA`) to avoid reply loops.
- Answers with category-scoped (or uncategorized) RAG via `answerQuestionText`.
- Persists last turns in `live_chat_messages` (history window: 10) because each webhook is a separate serverless invocation.
- Truncates replies to platform chat limits (Meet 500, Zoom/Teams 4096).

### 4.9 Meeting intelligence

- After `bot.done` processing, DeepSeek extracts a **summary**, **action items** (text + optional assignee/due hint), and **highlights** (text + optional speaker/timestamp).
- Stored on `meetings` (`summary`, `action_items`, `highlights`); generation is best-effort and never blocks marking the meeting `done`.
- Meeting workspace **Notes** tab; highlight rows seek media when a timestamp is present.
- List rows show a 2-line summary preview and action-item count.
- `POST /api/meetings/[id]/intelligence` regenerates notes (rate-limited 10/hour).

### 4.10 Marketing landing

- Signed-out `/` shows a full landing: nav, hero + animated transcript demo, integrations bar, how-it-works, features grid, ask-demo with citation mock, CTA, footer.
- Signed-in users are redirected to `/meetings`.

### 4.11 Auth & multi-user

- Clerk sign-in / sign-up.
- JIT user provisioning: link existing seeded `users` row by email, else create.
- Resource ownership checks on meetings, categories, calendar connections.

### 4.12 Rate limiting

Upstash sliding windows, fail-open if Redis is unavailable:

| Category | Limit | Applied to |
|----------|-------|------------|
| `bots` | 10 / hour | Join-now + calendar schedule |
| `chat` | 30 / 5 min | Streaming RAG |
| `intelligence` | 10 / hour | Notes regeneration |

---

## 5. Architecture & pipelines

### 5.1 Join paths

```
A) Join now
   UI → POST /api/bots → Recall createBot → meetings row (live status)

B) Calendar
   OAuth → Recall Calendar V2 → calendar_connections
   Record / auto-record → scheduleCalendarBot → meetings row (status "scheduled")
```

### 5.2 Post-meeting processing (`bot.done`)

Lifecycle and calendar webhooks ack quickly; heavy work runs in `after()`. Finalized transcript events persist before acknowledgment (`maxDuration = 300` on the webhook route).

```
bot.done
  → verify Svix signature
  → after(processCompletedBot):
      1. Idempotent no-op if meeting.status === "done"
      2. retrieveBot + download transcript JSON
      3. Chunk by speaker turn (~150 words / chunk)
      4. Assign UUIDs → embedChunks → upsert Qdrant FIRST
      5. Insert transcript_chunks + participants in Postgres
      6. Best-effort meeting intelligence (summary / actions / highlights)
      7. Update meeting: status=done, media URLs, title, intelligence fields
```

**Ordering guarantee:** Qdrant/embeddings succeed before any Postgres chunk writes, so a failed embed batch leaves no partial “stuck” chunk rows. Embedding batches are sized (90) with a 65s cooldown for Gemini free-tier RPM limits.

`bot.fatal` → `markBotFatal` sets `status` to `fatal` or `fatal:<subCode>`.

### 5.3 Live chat path

```
participant_events.chat_message
  → extract @Rika question
  → load last 10 live_chat_messages
  → answerQuestionText (category / uncategorized scope)
  → sendChatMessage via Recall
  → persist user + assistant turns
```

### 5.4 Web RAG path

```
ChatPanel (useChat) → POST /api/chat
  → needsMeetingContext classifier (DeepSeek)
  → if needed: embedQuery → Qdrant filter by meeting_id(s)
  → streamText with cited excerpts
```

Category membership is resolved from **Postgres at query time**, then filtered in Qdrant with `meeting_id` `match.any`. Category ids are **not** stored in vector payloads (avoids sync drift when reassigning/renaming).

### 5.5 Calendar sync webhooks

| Event | Behavior |
|-------|----------|
| `calendar.update` | Sync connection status from Recall |
| `calendar.sync_events` | If `autoRecord`, schedule bots for new/updated events |

### 5.6 High-level system diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Next.js UI │────▶│  API routes  │────▶│  Recall.ai  │
│  (Clerk)    │     │  (rate limit)│     │  bots / cal │
└─────────────┘     └──────┬───────┘     └──────┬──────┘
                           │                     │ webhooks
                           ▼                     ▼
                    ┌─────────────┐       ┌─────────────┐
                    │ Neon Postgres│◀──────│  process /  │
                    │ (Drizzle)   │       │  live-chat  │
                    └──────┬──────┘       └──────┬──────┘
                           │                     │
                           │              ┌──────▼──────┐
                           │              │ Gemini embed│
                           │              └──────┬──────┘
                           │                     │
                           │              ┌──────▼──────┐
                           └─────────────▶│   Qdrant    │
                                          │  (vectors)  │
                                          └──────┬──────┘
                                                 │
                                          ┌──────▼──────┐
                                          │ DeepSeek RAG│
                                          │ + notes     │
                                          └─────────────┘
```

---

## 6. Data model

Postgres via Drizzle (`lib/db/schema.ts`). Vectors live only in Qdrant, keyed by the same `transcript_chunks.id`.

### Entity relationships

```
users
  ├── calendar_connections (userId)   // google | microsoft_outlook; autoRecord
  ├── categories (userId)
  └── meetings (userId)
        ├── categoryId → categories (ON DELETE SET NULL)  // one category per meeting
        ├── participants (meetingId)
        ├── transcript_chunks (meetingId)  // text only; vector in Qdrant by same id
        └── live_chat_messages (meetingId) // role: user | assistant
```

### Tables

**`users`**
- `id` (uuid PK), `email` (unique), `clerk_user_id` (nullable unique), `created_at`
- Pre-auth seed rows get linked on first Clerk sign-in by email

**`calendar_connections`**
- `user_id` → users
- `provider`: `google` | `microsoft_outlook`
- `email` (account identity for multi-account)
- `recall_calendar_id`, `status`, `auto_record` (default false), `created_at`

**`categories`**
- `user_id` → users, `name`, `created_at`

**`meetings`**
- `user_id` → users
- `recall_bot_id` (unique), `title`, `category_id` → categories (`ON DELETE SET NULL`)
- `platform`, `meeting_url`, `calendar_event_id`
- `scheduled_start`, `started_at`, `ended_at`, `status`
- `recording_video_url`, `recording_audio_url`
- `summary` (text, nullable), `action_items` / `highlights` (jsonb, nullable)
- `created_at`

Null vs empty for intelligence: **null** = not generated / failed; **`[]`** = ran and found nothing.

**`participants`**
- `meeting_id` → meetings, `name`, `email`, `joined_at`, `left_at`

**`transcript_chunks`**
- Text/metadata only: `meeting_id`, `speaker`, `start_ms`, `end_ms`, `text`, `created_at`
- Embedding lives in Qdrant under the same `id`

**`live_chat_messages`**
- `meeting_id`, `role` (`user` | `assistant`), `participant_name`, `text`, `created_at`

### Qdrant collection `transcript_chunks`

- Vector: 768-d cosine
- Payload: `meeting_id`, `user_id`, `speaker`, `start_ms`, `end_ms`, `text`
- Payload indexes on `meeting_id` / `user_id` (setup via `npm run vector:setup`)
- Current RAG filters by `meeting_id` (ownership enforced via Postgres meeting membership), not bare `user_id`

Migrations live under `lib/db/migrations/` (0000–0006).

---

## 7. API routes

### Bots & meetings

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/bots` | Join-now: create bot + meeting row |
| `PATCH` | `/api/meetings/[id]` | Set `categoryId` (string \| null) |
| `DELETE` | `/api/meetings/[id]` | Cancel/leave bot; delete vectors + related rows |
| `POST` | `/api/meetings/[id]/intelligence` | Generate/regenerate summary, action items, highlights |
| `GET` | `/api/meetings/[id]/export` | Download transcript (`?format=txt\|srt\|pdf`) |

### Chat & categories

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/chat` | Streaming RAG; requires `meetingId` \| `categoryId`; `maxDuration = 30` |
| `GET` | `/api/categories` | List with `meetingCount` |
| `POST` | `/api/categories` | Create `{ name }` |
| `DELETE` | `/api/categories/[id]` | Delete category |

### Calendar

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/calendar/google/connect` | Start Google OAuth |
| `GET` | `/api/calendar/google/callback` | Finish Google → Recall calendar → upsert connection |
| `GET` | `/api/calendar/outlook/connect` | Start Microsoft OAuth |
| `GET` | `/api/calendar/outlook/callback` | Finish Outlook flow |
| `GET` | `/api/calendar/events` | Upcoming events across connections |
| `POST` | `/api/calendar/events/[id]/schedule` | Manual Record |
| `PATCH` | `/api/calendar/connections/[id]` | Toggle `autoRecord` (+ backfill on enable) |

### Webhooks

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/webhooks/recall` | Signature-verified Recall events; ack fast, process in `after()` |

**Handled events:** `bot.done`, `bot.fatal`, `calendar.update`, `calendar.sync_events`, `participant_events.chat_message`.

---

## 8. App pages & UI

### Pages

| Route | Role | Auth |
|-------|------|------|
| `/` | Landing or redirect to `/meetings` | Soft `auth()` check |
| `/sign-in`, `/sign-up` | Clerk auth | Public |
| `/privacy`, `/terms` | Legal (draft) | Public |
| `/meetings` | Join form + meetings browser | `getCurrentUserId()` |
| `/meetings/[id]` | Workspace: media, transcript, notes, chat, category | Same + ownership |
| `/chat` | Category-scoped chat picker | APIs enforce auth |
| `/settings/calendar` | Connect calendars, auto-record, events | `getCurrentUserId()` |

Dashboard pages that need live webhook state use `export const dynamic = "force-dynamic"`.

Root layout also wires Vercel Analytics and Speed Insights, and `app/icon.svg` provides the favicon.

### Dashboard components (selected)

| Component | Role |
|-----------|------|
| `join-meeting-form.tsx` | Paste URL + A/V → create bot |
| `meetings-browser.tsx` | Search + upcoming/past/failed sections |
| `meeting-list.tsx` | Rows, badges, summary preview, delete |
| `meeting-workspace.tsx` | Media + transcript sync + notes + chat + export |
| `meeting-notes.tsx` | Summary, action items, highlights |
| `transcript-viewer.tsx` | Speaker/timestamp list |
| `audio-player.tsx` | Audio-only fallback |
| `chat-panel.tsx` | `useChat` → `/api/chat` with fixed scope |
| `category-chat.tsx` | Scope pills + category CRUD |
| `category-select.tsx` | Bound (meeting) or unbound (schedule) |
| `calendar-events-list.tsx` | Upcoming invites + Record |
| `auto-record-toggle.tsx` | Per-provider auto-record |
| `status-badge.tsx` | Lifecycle chips |

### Landing components

`landing-page`, `nav`, `hero`, `transcript-demo`, `integrations-bar`, `how-it-works`, `features`, `ask-demo`, `cta-banner`, `footer`, `reveal`.

### Dashboard shell

Sticky nav: Meetings / Chat / Calendar + Clerk `UserButton`. Pulsing rec-dot brand mark + Bitcount wordmark. Meeting detail uses a wider full-height shell.

---

## 9. Integrations

| Service | Wiring |
|---------|--------|
| **Recall.ai** | `lib/recall/client.ts` → `{region}.recall.ai` with Token auth. Bots, leave/cancel, chat send, Calendar V2. Recording config + automatic leave + realtime endpoints. Media remains on Recall signed URLs. |
| **Clerk** | `ClerkProvider` + `proxy.ts` (`clerkMiddleware`) + sign-in/up pages + `UserButton`. Appearance themed to brand. Sign-in and sign-up pages cross-link to each other so users stay in the app shell instead of falling back to the hosted accounts portal. |
| **Neon** | HTTP driver + Drizzle; `DATABASE_URL` |
| **Qdrant** | REST client; env names `QUADRANT_CLUSTER_ENDPOINT` / `QUADRANT_API_KEY` (mapped in `lib/env.ts`) |
| **Upstash Redis** | Rate limiting via REST API |
| **Vercel** | Analytics + Speed Insights packages in root layout |
| **Google OAuth** | App OAuth → refresh token → Recall `createCalendar(google_calendar)` |
| **Microsoft OAuth** | Same pattern → `microsoft_outlook` |
| **Gemini** | Embeddings only (`GEMINI_API_KEY`) |
| **DeepSeek** | Classification + answer generation + meeting intelligence (`DEEPSEEK_API_KEY`) |

Recall webhook verification: Svix-style HMAC in `lib/recall/verify-webhook.ts` using `RECALL_WEBHOOK_SECRET`.

Absolute webhook URLs for realtime endpoints use `APP_BASE_URL` (needed when there is no incoming `Request` to derive origin from, e.g. calendar sync path).

---

## 10. Auth model

**Resource-based auth**, not middleware path matching.

- `proxy.ts` only runs `clerkMiddleware()` so Clerk sessions work. Clerk deprecated `createRouteMatcher`-style protection mid-build; auth lives in handlers instead.
- Every protected page/API calls `getCurrentUserId()` in `lib/auth.ts`, which:
  1. Runs `auth.protect()`
  2. Looks up `users` by `clerkUserId`
  3. Else JIT-links a pre-auth row by email
  4. Else inserts a new user
- Recall webhooks are **not** Clerk-authenticated; they are signature-verified instead.
- Meeting-scoped RAG checks ownership in Postgres before filtering Qdrant by `meeting_id`.

---

## 11. AI / RAG design

### Models

| Role | Model |
|------|-------|
| Embeddings | Gemini `gemini-embedding-001`, 768 dims, task types `RETRIEVAL_QUERY` / `RETRIEVAL_DOCUMENT` |
| Chat + classify + notes | DeepSeek `deepseek-chat` |

AI clients are constructed lazily so missing env vars don't fail the Next build.

### `ChatScope` (`lib/ai/rag.ts`)

Exactly one retrieval mode (no unscoped “all meetings”):

1. `meetingId` — single meeting (takes precedence)
2. `categoryId` — all meetings in that category for the user
3. `uncategorizedOnly` — meetings with `categoryId IS NULL`; internal only, used solely as the live in-meeting @Rika fallback when the active meeting has no category. Never accepted by the web `/api/chat` route.

### Pipeline details

1. **Classifier** (`needsMeetingContext`) — cheap structured object; skips embeddings for small talk. History-aware for follow-ups (“and pricing?”). On failure, defaults to running RAG.
2. **Retrieve** — `embedQuery` → Qdrant search (default limit 8) with payload filter.
3. **Answer** — `streamText` (web) or `generateText` (live chat) with transcript excerpts and citation instructions.
4. Assistant identity in prompts: Rika.

### Chunking

- Non-overlapping windows per speaker turn.
- Max **150 words** per chunk (`MAX_WORDS_PER_CHUNK` in `process-meeting.ts`).
- Chunks carry speaker + start/end ms for citation and UI seeking.

### Embedding rate limits

- Batch size 90, cooldown 65s between batches (Gemini free-tier RPM).
- Trade-off: longer post-call processing vs partial/silent failures.
- Webhook route `maxDuration = 300` to accommodate multi-batch meetings.

### Meeting intelligence

- Structured output via DeepSeek (`Output.object`).
- Transcript capped (~80k chars) before the call.
- Best-effort: failure must not leave the meeting off `done`.

---

## 12. Design decisions

These are the intentional trade-offs baked into the codebase:

| Decision | Rationale |
|----------|-----------|
| **Vectors in Qdrant, not Postgres/`pgvector`** | Keep Neon relational-only; specialize vector search in Qdrant Cloud. Same chunk `id` keys both stores. |
| **Text copied into Qdrant payload** | RAG reads don't need a Postgres join for chunk text. |
| **Category filter at query time** | Categories get renamed/reassigned; syncing `category_id` into vector payloads isn't worth the drift risk. Resolve membership in Postgres → `match.any` on `meeting_id`. |
| **No unscoped “all meetings” chat** | Related meeting series (e.g. a freelance client) stay coherent when scoped by category; a global dump mixes unrelated context. |
| **Embed → Qdrant before Postgres writes** | A failed embed batch must leave nothing committed — avoids stuck partial meetings with orphan chunk rows. |
| **Webhook ack fast / process in `after()`** | Recall expects a quick ack (~15s); embedding + intelligence can take minutes. |
| **Clerk resource-based auth** | `auth.protect()` inside `getCurrentUserId()` rather than middleware path matchers (`createRouteMatcher` was deprecated mid-build). |
| **JIT Clerk ↔ users link by email** | Phase 1 seeded a pre-auth user; first sign-in links instead of a migration. |
| **`live_chat_messages` table** | Each webhook delivery is a separate serverless invocation with no shared process memory. |
| **Intelligence best-effort** | Failed summary generation must not block `status=done`. Null = not run/failed; `[]` = ran and found nothing. |
| **One category per meeting** | Confirmed product choice for v1 — not multi-tag. |
| **Auto-record per provider, not per account** | Simpler UX toggle; applies across all linked accounts for that provider. |
| **Multiple calendar accounts** | Dedup on `(userId, provider, email)`; OAuth forces account picker so a second connect doesn't silently re-auth the first. |
| **Media stays on Recall** | No self-hosted recording storage in Phase 1; signed URLs refreshed on meeting detail load. |
| **Explicit A/V in recording config** | Omitting keys caused Teams to return null video in practice. |
| **Rate limit fail-open** | Upstash outage shouldn't take down bots/chat. |
| **Env typo preserved** | `QUADRANT_*` env names map to `env.QDRANT_*` — keep names stable with deployed secrets. |
| **Lazy AI client init** | Avoid build-time crashes when provider keys aren't present during `next build`. |
| **Bot name constant shared** | `BOT_DISPLAY_NAME` must match create/schedule and the live-chat self-guard. |

---

## 13. Design system & UX

### Visual identity — “recording studio”

Brand tokens in `app/globals.css`:

| Token | Value | Role |
|-------|-------|------|
| `--color-paper` | `#f1eee4` | Page background |
| `--color-paper-soft` | `#ebe7da` | Soft sections |
| `--color-card` | `#f8f6ef` | Surfaces |
| `--color-ink` | `#15171d` | Primary text / primary button |
| `--color-ink-muted` | `#5b5d66` | Secondary text |
| `--color-rec` | `#ff3b2f` | Accent / CTA / “rec” mark |
| `--color-moss` | `#1f6f54` | Success / positive |
| `--color-line` | `#ddd6c7` | Borders / hairlines |

shadcn CSS variables are mapped onto these tokens so primitives stay on-brand without per-component color hacks. Dark tokens exist in the theme file, but the marketing site and app shell stay light.

### Typography

| Role | Font |
|------|------|
| Brand wordmark | **Bitcount Prop Single** (`.font-brand`) |
| Display / headlines | **Space Grotesk** |
| UI body | **Geist** |
| Labels / meta | **Geist Mono** (often uppercase + tracking) |

Loaded via `next/font/google` in `app/layout.tsx`.

### Brand mark

Rec-dot (recording indicator, with `.rec-pulse` animation that respects `prefers-reduced-motion`) paired with the name “Rika” — brand-first on the landing hero.

### Shared utilities

- `.bg-studio` — grain + soft rec/moss washes
- `.surface-panel` — panel chrome
- `.section-label` — mono uppercase section labels

### Clerk theming

`lib/clerk-appearance.ts` aligns Clerk UI with paper/ink/rec — avoids default indigo Clerk chrome.

### Landing UX

- One composition hero: brand, headline, short support, CTAs, dominant transcript demo.
- Motion: word stagger, scroll reveal (`Reveal` / Framer Motion).
- Product demos as visual anchors (fake transcript + citation chat mock), not abstract blobs.

### Product UX

- Join-now is a full-width **Dispatch** panel on Meetings (fastest loop without OAuth).
- Meetings list: substring search + platform / category filter chips; any active filter collapses the status sections into a flat “Matching meetings” result list.
- `/chat` is a sidebar console: category rail (counts, inline create/delete) + scoped chat column with header context, suggested prompts on empty threads, and a docked composer. Categories only — no uncategorized/all-meetings scope.
- Meeting workspace is media-first with transcript sync; Notes tab leads when intelligence exists.
- Transcript viewer has sticky in-transcript search: matches highlighted in place (non-matches dimmed), `n / m` counter, Enter/Shift+Enter or chevron buttons step between hits.
- Audio player has a scrubbable seek bar (`.seek-slider`) plus speed cycle, ±10s skip, and download.
- Async actions (delete meeting, category create/delete, notes generate, calendar record) confirm via brand-styled toasts (`components/ui/toaster.tsx`, provided by the dashboard layout).
- Route-level `loading.tsx` skeletons for Meetings, Meeting detail, and Calendar settings (`components/ui/skeleton.tsx`).
- Dashboard: studio paper atmosphere, icon nav with ink active chip, pulsing rec-dot, surface panels.

### UI kit

- shadcn style: **base-nova**, RSC, Lucide, CSS variables (`components.json`).
- Shared: `Button`, `Card`, `Input`, `Switch`, `PageHeader`, `EmptyState`, `Skeleton`, `ToastProvider`/`useToast`.

---

## 14. Environment & scripts

### Required env (`lib/env.ts`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres |
| `QUADRANT_CLUSTER_ENDPOINT` | Qdrant URL (mapped to `env.QDRANT_URL`) |
| `QUADRANT_API_KEY` | Qdrant API key |
| `RECALL_API_KEY` | Recall auth |
| `RECALL_API_REGION` | e.g. `us-east-1` (must match signup region) |
| `RECALL_WEBHOOK_SECRET` | Webhook signature verify |
| `GEMINI_API_KEY` | Embeddings |
| `DEEPSEEK_API_KEY` | Chat / classify / intelligence |
| `GOOGLE_OAUTH_CLIENT_ID` / `SECRET` | Google Calendar OAuth |
| `MICROSOFT_OAUTH_CLIENT_ID` / `SECRET` | Outlook OAuth |
| `APP_BASE_URL` | Absolute origin for webhook URLs (no trailing slash) |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Rate limiting |

### Outside `lib/env.ts` but expected

| Variable | Purpose |
|----------|---------|
| Clerk keys | Standard `NEXT_PUBLIC_CLERK_*` / `CLERK_SECRET_KEY` via Clerk SDK |
| `SEED_USER_EMAIL` | Used by `npm run db:seed` |
| `NODE_ENV` | OAuth cookie `secure` flag |

### Config files

| File | Role |
|------|------|
| `next.config.ts` | Default Next config |
| `drizzle.config.ts` | Schema + migrations path; reads `.env.local` |
| `proxy.ts` | Clerk middleware matcher |
| `components.json` | shadcn config |
| `tsconfig.json` | Path alias `@/*` |

---

## 15. Phased delivery status

Tracked in `plan.md`. Summary against the codebase:

### Phase 1 — Join, capture, post-meeting Q&A — **shipped**

- Next.js scaffold, Neon, Qdrant, Drizzle schema
- Recall client + webhook post-meeting pipeline
- Join-now end-to-end
- Google Calendar connect + schedule
- Meetings list + transcript viewer + media
- RAG chat (evolved: category scoping replaced original “all meetings” toggle)

### Phase 2 — Live Q&A + multi-user — **mostly shipped**

| Item | Status |
|------|--------|
| Multi-user Clerk auth | ✅ Done |
| Outlook calendar code | ✅ Done (⏳ needs Azure app / env to be live) |
| In-meeting `@Rika` chat Q&A | ✅ Implemented (`live-chat.ts` + webhook + realtime endpoints) |
| Real-time transcript ingestion (`transcript.data`) | ✅ Finalized utterances stored and indexed; partial streaming UI not included |
| Live meeting dashboard (SSE/WS UI) | ❌ Not started |
| Spoken / voice agent responses | Stretch — not started |

**Also shipped outside the original Phase 2 list:**

- Multiple calendar accounts per provider
- Auto-record toggle + backfill
- Calendar-derived (and metadata-fallback) meeting titles
- Meeting delete with bot cancel/leave + vector cleanup
- Upstash rate limiting
- Transcript export (TXT / SRT / PDF)

### Phase 2.5 — Categories + category-scoped chat — **shipped**

Schema, APIs, meeting assignment, RAG filter, `/chat` picker, list badges.

### Phase 3 — Meeting intelligence — **shipped**

Summary / action items / highlights on `bot.done`, Notes tab, list preview, regenerate API.

### Phase 3.5 — Product UI polish — **shipped**

Recording-studio product shell: icon nav, pulsing rec-dot, studio paper atmosphere, Dispatch join panel, tabbed meeting workspace.

---

## 16. Outstanding / known gaps

1. **Public Recall webhook registration** — needs a public `APP_BASE_URL` (deploy or tunnel). Until registered: completed meetings may need manual reprocessing; auto-record won’t catch invites that arrive after toggle-on.
2. **Outlook live config** — backend routes and OAuth flow are implemented; needs Azure Portal app registration + env secrets before the UI toggle can be re-enabled.
3. **Partial transcript streaming** — finalized `transcript.data` ingestion is implemented; `transcript.partial_data` and a streaming transcript UI remain outside this release.
4. **Live meeting dashboard** — no in-progress streaming workspace.
5. **Voice responses** — explicitly out of scope until chat Q&A proves insufficient.
6. **Retrieval evaluation** — an example case file is provided; replace placeholder IDs to benchmark real transcripts.
7. **Legal pages** — `/privacy` and `/terms` exist as drafts.

---

## 17. Key source index

| Concern | Paths |
|---------|--------|
| Schema | `lib/db/schema.ts` |
| Auth | `lib/auth.ts`, `proxy.ts` |
| Env | `lib/env.ts` |
| Rate limit | `lib/rate-limit.ts` |
| Post-meeting pipeline | `lib/recall/process-meeting.ts`, `app/api/webhooks/recall/route.ts` |
| Live chat | `lib/recall/live-chat.ts` |
| Recall API | `lib/recall/client.ts`, `lib/recall/types.ts` |
| Calendar schedule | `lib/recall/schedule-event.ts`, `app/api/calendar/**` |
| RAG | `lib/ai/rag.ts`, `lib/ai/embeddings.ts`, `app/api/chat/route.ts` |
| Meeting intelligence | `lib/ai/meeting-intelligence.ts`, `app/api/meetings/[id]/intelligence/route.ts` |
| Export | `app/api/meetings/[id]/export/route.ts`, `lib/pdf/transcript-document.tsx` |
| Vectors | `lib/vector/*` |
| Brand / Clerk | `app/globals.css`, `lib/clerk-appearance.ts` |
| Landing | `components/landing/*` |
| Phase tracker | `plan.md` |

---

*Generated from the implemented codebase. Prefer `project.md` + `plan.md` over the stock `README.md` for product truth.*
