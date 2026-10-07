# Meeting Bot — Plan

Recall.ai-powered meeting bot: joins meetings via pasted link or Google Calendar invite,
records audio/video, captures transcript + participant/meeting metadata, and answers
questions over transcripts (RAG). Single-user first, multi-user later.

Full architecture/reasoning lives in the approved plan at
`/Users/abhijeet/.claude/plans/starry-tickling-flask.md` — this file is the taskwise
tracker split by phase.

---

## Phase 1 — Join, Capture, Post-Meeting Q&A

Scope: single user, Google Calendar only for auto-detection, bot can join
Zoom/Meet/**Teams**, rely on Recall's hosted media (no self-storage of recordings).

1. **Scaffold Next.js app** — App Router + TypeScript, minimal Tailwind, git init.
2. **Provision Neon Postgres via Vercel Marketplace** — link Vercel project, install Neon
   integration, pull `DATABASE_URL`. Relational data only — no `pgvector`.
3. **Provision Qdrant (vector DB)** — Qdrant is not a native Vercel Marketplace integration,
   so this is a manual external service: create a Qdrant Cloud cluster, add `QDRANT_URL` /
   `QDRANT_API_KEY` to Vercel env. Create the `transcript_chunks` collection.
4. **Drizzle ORM + schema** — `users`, `calendar_connections`, `meetings`, `participants`,
   `transcript_chunks` (text/speaker/timestamps, **no vector column** — vectors live in
   Qdrant only, keyed by the same row id); run initial migration; seed one user row.
5. **Recall.ai client wrapper** (`lib/recall/client.ts`) — `createBot`, `retrieveBot`,
   `scheduleCalendarBot`, `listCalendarEvents`, against `RECALL_API_KEY` / `RECALL_API_REGION`.
6. **Webhook route + post-meeting pipeline** — `app/api/webhooks/recall/route.ts` +
   `lib/recall/process-meeting.ts`: on `bot.done`, retrieve bot data, normalize transcript,
   chunk, embed (AI SDK), insert chunk rows in Postgres, upsert matching points into Qdrant
   (payload includes `meeting_id`, `user_id`, `speaker`, timestamps, and the chunk `text`
   itself so RAG reads don't need a Postgres join). Must ack within 15s, process async.
7. **"Join now" flow end-to-end** — paste a meeting link → `createBot`. Fastest path to a
   real, testable loop since it skips calendar OAuth entirely. First real verification point.
8. **Google Calendar connection + event listing** — Recall Calendar V2 OAuth connect,
   list events, schedule-bot-for-event, handle calendar sync webhooks (create/update/delete).
9. **Meetings list + transcript viewer pages** — upcoming (from calendar) + past meetings;
   meeting detail page with transcript (from Postgres), participants, recording link.
10. **RAG chat (per-meeting + cross-meeting)** — `lib/ai/rag.ts` (`embedQuery`,
    `retrieveChunks` — Qdrant search with a `meeting_id` or `user_id` payload filter,
    `answerQuestion`); wire into meeting detail chat and a cross-meeting chat page with a
    scope toggle (this meeting / all meetings).

**Verification gates:**
- After (7): real link → bot joins → `bot.done` fires → Postgres + Qdrant both populated.
- After (8): test Google Calendar event with a Teams link → syncs → bot auto-joins at `join_at`.
- After (10): question against a completed meeting returns a grounded answer with citation;
  scope toggle works both ways.

---

## Phase 2 — Live In-Meeting Q&A + Multi-User

Deferred until Phase 1 is solid. Each item builds on Phase 1 infra (same `bot_id`,
same webhook route) rather than replacing it.

1. **Real-time transcript ingestion** — subscribe to `transcript.data` /
   `transcript.partial_data` webhooks during an active call; stream partial transcript to a
   live dashboard view.
2. **In-meeting chat Q&A agent** — detect a directed question in the live transcript/chat,
   run RAG against transcript-so-far + past meetings, respond via Recall's
   `output_media.chat` (bot posts back into Zoom/Meet/Teams chat). Needs a "is this message
   for the bot" heuristic to avoid answering unrelated chatter.
3. **Multi-user auth** — introduce Clerk (or similar); every table already has `user_id`,
   so this is scoping existing queries + adding login, not a schema rewrite.
4. **Outlook/Microsoft Calendar support** — extend Calendar V2 connections beyond Google
   for teams that live in Microsoft 365.
5. **Live meeting dashboard** — streaming UI (websocket/SSE) showing an in-progress
   meeting's transcript and any live Q&A exchanges as they happen.
6. **(Stretch, not scoped yet)** Spoken/voice agent responses — Recall's real-time
   transcript webhooks are explicitly not meant for conversational agents; a talking bot
   would need `output_media` with a voice model. Only pursue if chat-based Q&A (item 2)
   proves insufficient.

---

## Credentials Needed Before Live Wiring (Phase 1)

- `RECALL_API_KEY` + `RECALL_API_REGION` (e.g. `us-east-1`) — must match signup region.
- Google Cloud OAuth client (Client ID/Secret, Calendar API scope) for Calendar V2.
- Vercel Marketplace Neon Postgres (provisioned during step 2).
- Qdrant Cloud cluster URL + API key (provisioned during step 3 — manual, not Vercel-managed).
- AI Gateway model access (automatic on Vercel via OIDC; no separate key needed unless a
  specific provider key is preferred).

None of these block scaffolding — steps 1–4 can proceed with stubbed Recall calls.
