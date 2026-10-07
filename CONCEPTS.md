# Rika — How It Works (Concepts Guide)

This document explains Rika **from first principles** — not just *what* each file does, but *why* it exists and *what problem it solves*. If you already know the codebase and just need a reference, use [`project.md`](project.md) (feature/API/schema tables) and [`plan.md`](plan.md) (phase tracker). This file is for building a mental model of the whole system.

Rika is an AI meeting notetaker: it joins a video call as a bot, records it, transcribes it, and lets you ask questions about what was said — both after the meeting and live during it.

---

## Table of contents

1. [The big picture](#1-the-big-picture)
2. [Concept: the meeting bot (Recall.ai)](#2-concept-the-meeting-bot-recallai)
3. [Concept: webhooks and why processing happens "after" the response](#3-concept-webhooks-and-why-processing-happens-after-the-response)
4. [Concept: turning a transcript into searchable knowledge (RAG)](#4-concept-turning-a-transcript-into-searchable-knowledge-rag)
5. [Concept: vector embeddings, explained simply](#5-concept-vector-embeddings-explained-simply)
6. [Concept: why two databases (Postgres + Qdrant)](#6-concept-why-two-databases-postgres--qdrant)
7. [Concept: streaming AI responses](#7-concept-streaming-ai-responses)
8. [Concept: the two chat surfaces (web vs. live-in-meeting)](#8-concept-the-two-chat-surfaces-web-vs-live-in-meeting)
9. [Concept: auth without middleware gatekeeping](#9-concept-auth-without-middleware-gatekeeping)
10. [Concept: calendars, OAuth, and auto-record](#10-concept-calendars-oauth-and-auto-record)
11. [Concept: meeting "intelligence" (summaries/action items)](#11-concept-meeting-intelligence-summariesaction-items)
12. [Concept: rate limiting and why it fails open](#12-concept-rate-limiting-and-why-it-fails-open)
13. [Walking through one full request, end to end](#13-walking-through-one-full-request-end-to-end)
14. [Glossary](#14-glossary)
15. [Where to look for what](#15-where-to-look-for-what)

---

## 1. The big picture

Rika does **not** run its own video-calling infrastructure. It outsources the hard part — joining a Zoom/Meet/Teams call, recording, and transcribing — to a third-party service called **Recall.ai**. Rika's own code is responsible for everything *around* that: telling Recall when to join, receiving the transcript once it's ready, turning that transcript into something you can ask questions about, and presenting it in a UI.

Think of the system in four layers:

```
┌────────────────────────────────────────────────────────────┐
│ 1. UI layer          Next.js pages/components (what you see)│
├────────────────────────────────────────────────────────────┤
│ 2. API layer         Next.js route handlers (app/api/**)    │
├────────────────────────────────────────────────────────────┤
│ 3. Domain logic      lib/recall, lib/ai, lib/vector, lib/db │
├────────────────────────────────────────────────────────────┤
│ 4. External services Recall.ai, Neon Postgres, Qdrant,      │
│                       Gemini, DeepSeek, Clerk, Upstash       │
└────────────────────────────────────────────────────────────┘
```

Every feature in the app is really a thin UI wrapper around a call into layer 3, which in turn calls out to layer 4. Once you understand the four layers, the file structure stops feeling arbitrary — `app/api/bots/route.ts` is a UI-facing wrapper around `lib/recall/client.ts`'s `createBot`, `app/api/chat/route.ts` is a wrapper around `lib/ai/rag.ts`'s `answerQuestion`, and so on.

---

## 2. Concept: the meeting bot (Recall.ai)

**The problem:** Zoom/Meet/Teams don't give you an API to "listen in" on a call you're not hosting. The only way to capture audio/video/transcript from an arbitrary meeting link is to have something actually *join* the call as a participant.

**The solution:** Recall.ai runs "bots" — headless participants that join a meeting URL like a person would, record the session, and transcribe it with speaker attribution. Rika's job is just to tell Recall *when* to create a bot and *what URL* to join.

Two ways a bot gets created (see `lib/recall/client.ts`):

- **Join now** — you paste a URL, the app calls `POST /api/bots` immediately, and the bot joins right away. Good for ad-hoc calls.
- **Calendar-scheduled** — a calendar invite already has a start time, so Recall's *Calendar V2* product watches your Google/Outlook calendar and joins automatically at the scheduled time. See §10.

The bot itself is dumb from Rika's point of view — it's a black box that eventually either:
- finishes successfully and uploads a recording + transcript (`bot.done`), or
- fails for some reason — permission denied, meeting never started, etc. (`bot.fatal`).

Rika finds out about these outcomes via **webhooks** (§3), not by polling.

---

## 3. Concept: webhooks and why processing happens "after" the response

**The problem:** A meeting can run for an hour. Rika's server can't sit there waiting for Recall to finish — it has to find out asynchronously, whenever Recall is done.

**The solution:** Recall calls Rika's own server with an HTTP POST the moment something happens (`app/api/webhooks/recall/route.ts`). This is the *inverse* of a normal API call — instead of Rika asking "are you done yet?", Recall tells Rika "I'm done" once, when it actually happens.

Two things follow from this pattern that are easy to miss if you haven't worked with webhooks before:

**(a) You must prove the request really came from Recall.** Since this endpoint is public (anyone can POST to it), Rika verifies an HMAC signature (Svix-style) on every request before trusting the body — see `lib/recall/verify-webhook.ts`. Without this, anyone could forge a `bot.done` event and inject fake transcript data.

**(b) The webhook sender expects a fast reply, but the real work is slow.** Recall expects an ack within roughly 15 seconds, or it treats the delivery as failed and retries. But turning a raw transcript into embedded, searchable chunks can take *minutes* (see §5 on rate limits). Blocking the HTTP response on that work would cause Recall to time out and redeliver the same webhook repeatedly.

The fix is Next.js's `after()`: the route handler returns `{ received: true }` immediately, and `after()` schedules the heavy lifting (`processCompletedBot`) to keep running in the background *after* the response has already been sent — but still within the same serverless invocation, so `maxDuration = 300` is set on the route to give it enough time (`app/api/webhooks/recall/route.ts:21`).

Because Recall *can* redeliver a webhook (network hiccup, timeout, etc.), `processCompletedBot` starts by checking `if (meeting.status === "done") return;` — making reprocessing a safe no-op instead of double-inserting transcript chunks.

---

## 4. Concept: turning a transcript into searchable knowledge (RAG)

**The problem:** An LLM like DeepSeek has no idea what was said in *your* meeting — it was never trained on your data. If you paste an hour-long transcript into every chat message, you'd blow past context limits and pay for tokens you don't need on every question.

**The solution is RAG — Retrieval-Augmented Generation.** Instead of giving the model the whole transcript, you:

1. **Break the transcript into small chunks** (here, one chunk per ~150-word slice of a single speaker's turn — `lib/recall/process-meeting.ts`'s `chunkTranscriptEntry`).
2. **Convert each chunk into a vector embedding** — a list of numbers that captures its *meaning* (§5).
3. **Store those vectors** in a database built for similarity search (Qdrant, §6).
4. **At question time**, embed the *question* the same way, and search for the chunks whose vectors are closest to it — "closest" meaning "most semantically similar."
5. **Hand only those top-N chunks** to the LLM as context, along with the question, and ask it to answer *using only that context*.

This is why Rika can answer "what did we decide about pricing?" without ever sending the full transcript to the model — it only sends the ~8 most relevant excerpts (`retrieveChunks` in `lib/ai/rag.ts`, default `limit = 8`).

One more wrinkle worth knowing: before doing any of this, a **cheap classification pass** (`needsMeetingContext` in `lib/ai/rag.ts`) asks the model "does this question even need meeting context?" A "hi" or "what's 2+2" shouldn't trigger a vector search and then get answered with "no relevant excerpts found" — it should just get a normal reply. This classifier is history-aware, so a bare follow-up like "and pricing?" is correctly recognized as needing context, based on the preceding turns.

---

## 5. Concept: vector embeddings, explained simply

An embedding is a way of turning text into a point in space (literally: an array of numbers, e.g. 768 numbers for Rika's model) such that texts with *similar meaning* end up as *nearby points*, regardless of the exact words used.

Example: "we pushed the deadline to Friday" and "the due date moved to end of week" use almost no words in common, but a good embedding model places them close together, because they mean roughly the same thing. A pure keyword search would miss this; a vector search finds it.

Rika uses Google's `gemini-embedding-001` model (768 dimensions) for this, via `lib/ai/embeddings.ts`. Two details matter:

- **Asymmetric embedding types.** Gemini's embedding API distinguishes between embedding something to be *stored* (`RETRIEVAL_DOCUMENT`) versus something to be *searched with* (`RETRIEVAL_QUERY`). Transcript chunks use the document type; the user's question uses the query type — this asymmetry is a known trick that improves retrieval quality for this model family.
- **Rate limits force batching.** Gemini's free tier caps requests per minute, so embedding hundreds of transcript chunks from a long meeting can't happen in one burst. `embedChunks` batches them (90 per batch) with a **65-second cooldown** between batches. This is directly why post-meeting processing can take several minutes for a long call, and directly why the webhook route needs `maxDuration = 300` (§3).

"Similarity" between two embeddings is measured with **cosine similarity** — essentially, the angle between the two vectors. Qdrant's collection is configured for cosine distance (§6).

---

## 6. Concept: why two databases (Postgres + Qdrant)

Rika stores data in two different databases, which can look redundant at first glance — both `transcript_chunks` (Postgres) and Qdrant's `transcript_chunks` collection store the chunk text. This is deliberate, not duplication-by-accident:

| | Postgres (Neon) | Qdrant |
|---|---|---|
| Good at | relational data, joins, ownership checks, exact filters | "find the N most semantically similar vectors" |
| Bad at | fast nearest-neighbor search over embeddings | joins, transactional relational integrity |
| Stores | everything structured: users, meetings, categories, chunk *text* + metadata | chunk *vectors* + a copy of the payload needed to filter/display a hit |

Rather than bolt a vector extension onto Postgres, Rika keeps each database doing what it's naturally good at, and links the two by using **the same UUID** for a chunk row in both places (`transcript_chunks.id` in Postgres == the point ID in Qdrant). A RAG query filters Qdrant by `meeting_id` (fast vector search + payload filter), and if you need the full chunk text you already have it in the Qdrant payload — no join required.

**Write ordering is a deliberate safety decision.** In `process-meeting.ts`, chunk IDs are generated up front, and the Qdrant write happens *before* the Postgres write. Why: both external calls (embedding + Qdrant upsert) can fail, and if Postgres were written first and the embedding step then failed, you'd be left with transcript chunks in Postgres that have *no* corresponding vectors — permanently unsearchable, and the meeting stuck mid-processing with no way to tell. Doing the riskier, slower step first means a failure there leaves nothing committed at all, which is a much easier state to detect and retry.

**Category membership is intentionally *not* synced into Qdrant.** A meeting's category can be renamed or reassigned at any time; keeping a `category_id` field in every vector's payload in sync with that would be extra state that can drift. Instead, when a chat is scoped to a category, Rika first asks Postgres "which meeting IDs are in this category right now?" and then filters Qdrant by that list of meeting IDs (`match.any`). Slightly more work per query, zero risk of stale category data in search results.

---

## 7. Concept: streaming AI responses

**The problem:** Generating a full LLM answer can take several seconds. Making the user stare at a blank screen until the whole answer is ready feels slow, even if the total time is the same.

**The solution:** Stream the answer token-by-token as the model generates it, the same way ChatGPT's UI shows text appearing incrementally. The **Vercel AI SDK** (`ai` package) provides `streamText()` on the server and the `useChat()` hook on the client for exactly this.

- **Web chat** (`app/api/chat/route.ts` → `components/chat-panel.tsx`) uses the full streaming path: `answerQuestion()` in `lib/ai/rag.ts` returns a `streamText` result, which the route converts into a UI message stream response that `useChat()` consumes and renders incrementally.
- **Live in-meeting chat** (§8) does *not* stream — `answerQuestionText()` uses `generateText()` instead, because the answer isn't rendered in a live UI; it's posted as a single finished chat message into the meeting via Recall's API, so there's nothing to stream *to*.

This distinction — same underlying RAG logic, different AI SDK function depending on whether there's a live UI to stream into — is a good example of the domain logic (`lib/ai/rag.ts`) being reused across very different delivery mechanisms.

---

## 8. Concept: the two chat surfaces (web vs. live-in-meeting)

Rika actually has two separate places you can ask questions, and they share the retrieval logic but differ in almost everything else:

**Web chat** (`/chat` and the meeting detail page) — a normal request/response web app. You're signed in via Clerk, you pick a scope (a specific meeting, or a category), and you get a streamed answer in a chat UI. State (message history) lives in the browser via `useChat()`.

**Live in-meeting `@Rika` chat** — while the bot is *still in the call*, any participant can type `@Rika what did we decide about X?` into the meeting's own chat panel (Zoom/Meet/Teams chat), and Rika replies *inside that same chat*, in near real time. This is powered by Recall's realtime `participant_events.chat_message` webhook.

The live path has two problems the web path doesn't:

1. **No conversation memory.** Every webhook delivery is an independent, stateless serverless function invocation — there's no in-memory object holding "what we talked about 30 seconds ago." So Rika persists every live Q&A turn to a `live_chat_messages` table and reads the last 10 turns back out each time, to give the illusion of a continuous conversation (`lib/db/schema.ts`'s comment on `liveChatMessages` spells this out directly).
2. **Avoiding an infinite reply loop.** Rika's own messages land in the same chat feed she's listening to. If she ever answered her *own* message, she'd trigger another webhook, generate another reply, and loop forever. The guard is a single shared constant, `BOT_DISPLAY_NAME` (`lib/recall/live-chat.ts`), used both when creating the bot and when checking "did this message come from me?" — if that constant ever diverges between the two places, the loop-guard silently breaks.

---

## 9. Concept: auth without middleware gatekeeping

Most Next.js apps protect routes with a middleware "matcher" — a list of URL patterns that require a signed-in user, checked before the request even reaches the page. Rika deliberately does **not** do this (see `proxy.ts`, which only wires up `clerkMiddleware()` so Clerk's session cookies work — it doesn't block anything).

Instead, every protected page or API route calls `getCurrentUserId()` (`lib/auth.ts`) directly, which:

1. Calls Clerk's `auth.protect()` — throws/redirects if not signed in.
2. Looks up the internal `users` row by `clerkUserId`.
3. If none exists yet but a row with the same *email* was pre-seeded (a legacy path from before multi-user auth existed), links that row to the Clerk account instead of creating a duplicate.
4. Otherwise creates a brand-new `users` row.

This is called **resource-based auth**: authorization is a property of *what you're asking for* (a specific meeting, category, calendar connection), checked at the point you fetch it, rather than a blanket rule about *which URL* you hit. It matters concretely in `lib/ai/rag.ts`'s `retrieveChunks`: when a chat is scoped to a specific `meetingId`, the code explicitly re-checks that `meetings.userId === scope.userId` in Postgres *before* querying Qdrant — because `meetingId` is client-supplied input, and without that check, any signed-in user could read another user's transcript just by guessing a UUID.

One more asymmetry worth knowing: **webhooks aren't Clerk-authenticated at all**, because Recall isn't a logged-in user — it's a server calling a server. Its "authentication" is the HMAC signature check from §3, a completely different mechanism for a completely different kind of caller.

---

## 10. Concept: calendars, OAuth, and auto-record

Calendar integration exists to answer "how does Rika know to join a meeting I haven't manually pasted a link for?"

The flow has three layers:

1. **OAuth**: Rika's own app registers as an OAuth client with Google/Microsoft. You grant it permission to read your calendar; Rika receives a refresh token.
2. **Handing that token to Recall**: rather than Rika reading your calendar itself, it registers the connection with Recall's *Calendar V2* API (`createCalendar`), which then syncs your events and can join meetings on your behalf. This keeps "watch the calendar and know when to join" as Recall's problem, not Rika's.
3. **A local `calendar_connections` row** tracks the link between your Rika account, the provider, the specific email (so you can connect *multiple* Google accounts — personal and work — as separate rows), and an `autoRecord` boolean.

**Auto-record** is the difference between "I have to click Record on every invite" and "just handle it." When you flip the toggle on, two things happen: (a) currently-upcoming events get scheduled immediately as a backfill, and (b) going forward, Recall's `calendar.sync_events` webhook fires whenever your calendar changes, and the webhook handler (`autoScheduleChangedEvents` in the webhook route) schedules a bot for any new/updated event automatically — no polling, same webhook pattern as §3.

---

## 11. Concept: meeting "intelligence" (summaries/action items)

Once a transcript is chunked and embedded (§4), Rika makes one more LLM call — not for search, but for **extraction**: read the (capped ~80k character) transcript and produce a structured summary, a list of action items (with optional assignee/due-date hints), and highlight moments with timestamps for seeking directly to them in the recording (`lib/ai/meeting-intelligence.ts`). This uses the AI SDK's structured-output mode (`generateObject`) so the result is a typed object, not free text you'd have to parse.

The important design choice here: this step is **best-effort and non-blocking**. It runs inside a `try/catch` in `processCompletedBot`, and if it throws, the meeting still gets marked `status: "done"` — the failure is logged but never leaves a meeting stuck. This is why the schema distinguishes `null` (never generated, or failed) from `[]` (ran successfully and genuinely found nothing) for `actionItems`/`highlights` — the two states mean different things, and the UI/regenerate button (`POST /api/meetings/[id]/intelligence`) relies on being able to tell them apart.

---

## 12. Concept: rate limiting and why it fails open

Rate limiting (`lib/rate-limit.ts`, via Upstash Redis) caps how often a user can trigger expensive or abusable actions — creating bots, chat messages, regenerating intelligence — using a sliding-window counter stored in Redis.

The notable design decision: if Upstash itself is unreachable, the rate limiter **fails open** (lets the request through) rather than failing closed (blocking everything). The reasoning is a straightforward risk trade-off: a Redis outage is rare and Rika's core purpose — joining meetings, answering questions — shouldn't go down because a secondary, cost-control system is unavailable. The cost of occasionally under-limiting during an outage is much lower than the cost of the whole app appearing broken because of it.

---

## 13. Walking through one full request, end to end

To tie the concepts together, here's what actually happens between "you paste a Zoom link" and "you can chat about that meeting," concept by concept:

1. **You submit the join form.** `components/join-meeting-form.tsx` → `POST /api/bots`.
2. **The route checks rate limits and auth** (§9, §12), infers the platform from the URL (`lib/recall/platform.ts`), and calls `createBot()` (§2) — a `meetings` row is inserted with `status` mirroring Recall's initial state.
3. **Recall's bot joins the call**, records, and transcribes it. Rika's server does nothing during this time — no polling.
4. **The call ends. Recall sends a `bot.done` webhook.** The route verifies the signature (§3), acks immediately, and schedules `processCompletedBot` via `after()`.
5. **`processCompletedBot` chunks the transcript** (§4), embeds each chunk in rate-limited batches (§5), writes vectors to Qdrant *then* text to Postgres (§6), best-effort generates a summary (§11), and finally flips `status: "done"`.
6. **You open the meeting page.** The UI reads the meeting row, transcript chunks, and intelligence fields straight from Postgres — no vector search needed just to *display* the transcript, only to *search* it.
7. **You ask a question in the chat tab.** `chat-panel.tsx` streams a request to `/api/chat`, which resolves your scope (this meeting), runs the classifier (§4), retrieves the top 8 chunks from Qdrant filtered by `meeting_id` (§6, with the ownership check from §9), and streams back an answer grounded in those excerpts (§7).

Every step above is doing exactly one job, and the concepts above are the reasons each job is shaped the way it is.

---

## 14. Glossary

| Term | Meaning in this codebase |
|---|---|
| **Bot** | Recall.ai's headless meeting participant that joins, records, and transcribes a call. |
| **Webhook** | An HTTP callback a third-party service (Recall) makes *to* Rika's server when something happens, instead of Rika polling for status. |
| **RAG (Retrieval-Augmented Generation)** | Answering a question by first retrieving relevant source text (via vector search) and feeding only that to the LLM, instead of relying on the model's training data or dumping the whole document in. |
| **Embedding** | A numeric vector representation of text such that semantically similar text produces nearby vectors. |
| **Chunk** | A ~150-word slice of one speaker's transcript turn — the unit that gets embedded and retrieved. |
| **Vector search / similarity search** | Finding the stored vectors closest (by cosine distance here) to a query vector. |
| **Streaming (LLM)** | Sending model output to the client token-by-token as it's generated, rather than waiting for the full response. |
| **`after()`** | A Next.js API for running code after an HTTP response has already been sent, within the same function invocation — used to keep webhook acks fast while slow processing continues. |
| **Resource-based auth** | Checking permission at the point a specific resource (a meeting, a category) is accessed, instead of via a blanket URL-pattern middleware rule. |
| **JIT (just-in-time) user linking** | Connecting a pre-existing seeded `users` row to a Clerk account by matching email, the first time that person signs in, instead of a bulk migration. |
| **Fail open** | On a dependency outage (here, Upstash Redis), letting the request through rather than blocking it — a deliberate choice about which failure mode is worse. |

---

## 15. Where to look for what

| I want to understand... | Read this concept section | Then read this code |
|---|---|---|
| How a bot gets created | §2 | `lib/recall/client.ts`, `app/api/bots/route.ts` |
| Why webhooks ack fast then do slow work | §3 | `app/api/webhooks/recall/route.ts`, `lib/recall/verify-webhook.ts` |
| How chat answers are grounded in transcripts | §4, §5 | `lib/ai/rag.ts`, `lib/ai/embeddings.ts` |
| Why there are two databases | §6 | `lib/recall/process-meeting.ts`, `lib/vector/*`, `lib/db/schema.ts` |
| How streaming chat works in the UI | §7 | `components/chat-panel.tsx`, `app/api/chat/route.ts` |
| How `@Rika` works live in a call | §8 | `lib/recall/live-chat.ts` |
| How auth actually gates access | §9 | `lib/auth.ts`, `proxy.ts` |
| How calendar auto-record works | §10 | `lib/recall/schedule-event.ts`, `app/api/calendar/**` |
| How summaries/action items are generated | §11 | `lib/ai/meeting-intelligence.ts` |
| How rate limiting is applied | §12 | `lib/rate-limit.ts` |

For the full feature list, API table, data model, and environment variables, see [`project.md`](project.md). For phase-by-phase delivery status, see [`plan.md`](plan.md).
