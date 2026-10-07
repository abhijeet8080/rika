# Rika — Features & Checks Reference

Every feature in the app, how it actually works step by step, and **every validation/security/business-logic check** that runs along the way. This is the "what actually guards this code path" companion to [`CONCEPTS.md`](CONCEPTS.md) (why it's built this way) and [`project.md`](project.md) (tables/schema/env reference).

Each feature below follows the same shape: **How it works** (the mechanism) → **Checks** (every guard, in the order it actually runs, with file:line).

---

## Table of contents

1. [Join now (instant bot)](#1-join-now-instant-bot)
2. [Google Calendar connect](#2-google-calendar-connect)
3. [Outlook Calendar connect](#3-outlook-calendar-connect)
4. [Calendar events list](#4-calendar-events-list)
5. [Record a calendar event (manual)](#5-record-a-calendar-event-manual)
6. [Auto-record toggle](#6-auto-record-toggle)
7. [Calendar sync webhook (auto-schedule)](#7-calendar-sync-webhook-auto-schedule)
8. [Post-meeting processing pipeline (`bot.done`)](#8-post-meeting-processing-pipeline-botdone)
9. [Bot failure handling (`bot.fatal`)](#9-bot-failure-handling-botfatal)
10. [Meetings browser (list)](#10-meetings-browser-list)
11. [Meeting category assignment](#11-meeting-category-assignment)
12. [Meeting delete](#12-meeting-delete)
13. [Meeting detail workspace (media + transcript)](#13-meeting-detail-workspace-media--transcript)
14. [Transcript export (TXT / SRT / PDF)](#14-transcript-export-txt--srt--pdf)
15. [Meeting intelligence (summary/action items/highlights)](#15-meeting-intelligence-summaryaction-itemshighlights)
16. [Categories CRUD](#16-categories-crud)
17. [Post-meeting RAG chat (web)](#17-post-meeting-rag-chat-web)
18. [Live in-meeting `@Rika` chat](#18-live-in-meeting-rika-chat)
19. [Webhook signature verification (cross-cutting)](#19-webhook-signature-verification-cross-cutting)
20. [Auth / user resolution (cross-cutting)](#20-auth--user-resolution-cross-cutting)
21. [Rate limiting (cross-cutting)](#21-rate-limiting-cross-cutting)
22. [Marketing landing / redirect gate](#22-marketing-landing--redirect-gate)
23. [Summary table — every check at a glance](#23-summary-table--every-check-at-a-glance)

---

## 1. Join now (instant bot)

**Route:** `POST /api/bots` → [`app/api/bots/route.ts`](app/api/bots/route.ts)
**UI:** [`components/join-meeting-form.tsx`](components/join-meeting-form.tsx)

**How it works:**
1. User pastes a Zoom/Meet/Teams URL and optionally toggles record-video / record-audio.
2. Route detects the platform from the URL host (`detectPlatform`, [`lib/recall/platform.ts`](lib/recall/platform.ts)).
3. Calls Recall's `createBot` with `botName: BOT_DISPLAY_NAME` ("RIKA") so the bot joins the call immediately.
4. Inserts a `meetings` row with the bot's current status (from `bot.status_changes`) and returns it — the UI then polls/reflects status as it updates via later webhooks.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | `meetingUrl` present and is a string | `route.ts:13` | 400 |
| 2 | `recordVideo`, if present, is a boolean | `route.ts:16` | 400 |
| 3 | `recordAudio`, if present, is a boolean | `route.ts:19` | 400 |
| 4 | User is authenticated (Clerk) | `getCurrentUserId()` | redirect/401 |
| 5 | Rate limit: 10 bot creations / hour / user | `rateLimit("bots", userId)` | 429 + `Retry-After` |
| 6 | **Duplicate-bot guard**: no other *active* meeting already exists for this exact URL for this user (catches double-click, or calendar auto-record already having dispatched a bot for the same call) | `findActiveMeetingForUrl()`, [`lib/db/meetings.ts`](lib/db/meetings.ts) | 409 with the existing `meetingId` |

No ownership check needed here (it's a create, not an access to an existing resource) — but every meeting row is stamped with `userId` from the authenticated session so all future access checks apply.

---

## 2. Google Calendar connect

**Routes:** `GET /api/calendar/google/connect` → `GET /api/calendar/google/callback`
[`app/api/calendar/google/connect/route.ts`](app/api/calendar/google/connect/route.ts), [`.../callback/route.ts`](app/api/calendar/google/callback/route.ts)

**How it works:**
1. `/connect` redirects to Google's OAuth consent screen with `access_type=offline` (so Google issues a refresh token) and `prompt=select_account consent` (forces the account picker + re-consent every time, so a second Google account can be linked without silently reusing the browser's already-signed-in one).
2. Google redirects back to `/callback` with a `code` + `state`.
3. Callback exchanges the code for tokens, fetches the user's email (best-effort), registers the calendar with Recall (`createCalendar`), then upserts a `calendar_connections` row.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | **CSRF protection via OAuth `state`**: a random 16-byte hex value is generated, stored in an `httpOnly`, `sameSite=lax`, 10-minute-lived cookie (`google_oauth_state`) before redirecting to Google | `connect/route.ts:19,35` | — |
| 2 | On callback: Google didn't report an OAuth error (e.g. user denied access) | `callback/route.ts:34` | redirect to `/settings/calendar?error=...` |
| 3 | `code`, `state`, cookie-stored `expectedState` all present **and** `state === expectedState` (rejects forged/replayed callbacks) | `callback/route.ts:37` | redirect with error |
| 4 | State cookie is deleted immediately after being read (single use) | `callback/route.ts:32` | — |
| 5 | Token exchange with Google succeeded | `callback/route.ts:61` | redirect with error including Google's response text |
| 6 | Google actually returned a `refresh_token` (it's only issued on first-ever consent unless `prompt=consent` forces it) — without one, Recall can't keep syncing the calendar after the access token expires | `callback/route.ts:70` | redirect with explicit remediation message (revoke access, retry) |
| 7 | User is authenticated (Clerk), resolved *after* the OAuth exchange so the connection is tied to the right internal user | `callback/route.ts:99` | redirect/401 |
| 8 | Multi-account dedup on `(userId, provider, email)` happens inside `upsertCalendarConnection` ([`lib/db/calendar-connections.ts`](lib/db/calendar-connections.ts)) — connecting the same account twice updates the existing row instead of creating a duplicate | `upsertCalendarConnection()` | — |

---

## 3. Outlook Calendar connect

**Routes:** `GET /api/calendar/outlook/connect` → `GET /api/calendar/outlook/callback`

Symmetric to Google (§2) — same OAuth `state` CSRF cookie pattern, same callback validation sequence, registers with Recall as `microsoft_outlook` instead of `google_calendar`. Needs an Azure App Registration + `MICROSOFT_OAUTH_CLIENT_ID`/`SECRET` to actually go live (documented as an outstanding gap in `project.md`).

---

## 4. Calendar events list

**Route:** `GET /api/calendar/events` → [`app/api/calendar/events/route.ts`](app/api/calendar/events/route.ts)

**How it works:** Fetches all of the user's `calendar_connections`, queries Recall for upcoming events (`startTimeGte: now`) on each in parallel, flattens and sorts by start time.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | User is authenticated | `getCurrentUserId()` | redirect/401 |
| 2 | User has at least one calendar connection | `route.ts:16` | 404 `"No calendar connected"` |
| 3 | **Data minimization**: the response is explicitly re-shaped field-by-field rather than spreading the raw Recall event — the raw payload carries full attendee email lists and other provider metadata the client has no need to see | `route.ts:26-39` (comment explains this is deliberate) | — |
| 4 | Queries are scoped to `connections` already filtered to `eq(calendarConnections.userId, userId)` — a user can only ever see events from calendars they connected | `route.ts:14` | — (structural, not a runtime branch) |

---

## 5. Record a calendar event (manual)

**Route:** `POST /api/calendar/events/[id]/schedule` → [`app/api/calendar/events/[id]/schedule/route.ts`](app/api/calendar/events/[id]/schedule/route.ts)

**How it works:** Calls `scheduleBotForCalendarEvent()` ([`lib/recall/schedule-event.ts`](lib/recall/schedule-event.ts)), which asks Recall to schedule a bot for the given event (deduplicated by `icalUid`), then upserts a `meetings` row (`status: "scheduled"`).

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | `icalUid` present and a string | `route.ts:12` | 400 |
| 2 | `categoryId`, if present, is `null` or a string | `route.ts:15` | 400 |
| 3 | `recordVideo` / `recordAudio`, if present, are booleans | `route.ts:21,24` | 400 |
| 4 | User authenticated | `getCurrentUserId()` | redirect/401 |
| 5 | Rate limit: 10 bots / hour / user (**same bucket as Join now** — both create real Recall bots) | `rateLimit("bots", userId)` | 429 |
| 6 | **Idempotent scheduling**: `scheduleBotForCalendarEvent` passes `icalUid` as Recall's `deduplicationKey` and the DB insert uses `onConflictDoUpdate` on `recallBotId` — re-scheduling the same event (e.g. re-clicking Record) updates the existing row instead of creating a duplicate meeting | `schedule-event.ts:24-63` | — |
| 7 | Recall actually returned a bot id for the event | `schedule-event.ts:32` | throws → 502 with message |
| 8 | Category-clobber guard: a resync (auto-record backfill) that doesn't pass `categoryId` at all won't wipe out a category picked at manual schedule time — only overwrites `categoryId` when the caller explicitly passed it (`categoryId !== undefined`) | `schedule-event.ts:59-62` | — |

---

## 6. Auto-record toggle

**Route:** `PATCH /api/calendar/connections/[id]` → [`app/api/calendar/connections/[id]/route.ts`](app/api/calendar/connections/[id]/route.ts)

**How it works:** Flips `autoRecord` on a `calendar_connections` row. If turning **on**, immediately backfills by scheduling bots for every current upcoming event on that connection (future events are covered separately by the `calendar.sync_events` webhook, §7).

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | `autoRecord` is a boolean | `route.ts:15` | 400 |
| 2 | User authenticated | `getCurrentUserId()` | redirect/401 |
| 3 | **Ownership check**: connection must belong to `(id, userId)` — prevents toggling someone else's calendar connection by guessing a UUID | `route.ts:24-32` | 404 |
| 4 | Backfill skips events that are deleted, have no meeting URL, or already have a bot attached (`event.bots?.length`) — avoids double-booking a bot on an event that's already covered | `route.ts:55` | silently skipped |
| 5 | Per-event scheduling failures during backfill are caught individually and counted (`scheduled` / `failed`) rather than aborting the whole batch on one bad event | `route.ts:58-64` | logged, included in response counts |

---

## 7. Calendar sync webhook (auto-schedule)

**Event:** `calendar.sync_events`, handled in [`app/api/webhooks/recall/route.ts`](app/api/webhooks/recall/route.ts) → `autoScheduleChangedEvents()`

**How it works:** Recall notifies Rika whenever a connected calendar's events change. If the connection has `autoRecord` on, the handler lists changed events since `last_updated_ts` and schedules a bot for each new/updated one.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | Webhook signature verified (see §19) before any payload is trusted | `route.ts:63` | 401, nothing processed |
| 2 | Connection for the calendar id must exist **and** have `autoRecord === true`, or the handler no-ops | `route.ts:40` | silent no-op |
| 3 | Same "skip deleted / no URL / already-has-bot" filter as the manual backfill (§6) | `route.ts:45` | skipped |
| 4 | Per-event scheduling errors are caught and logged individually, not fatal to the batch | `route.ts:48-56` | logged only |
| 5 | Runs inside `after()` so the webhook still acks fast even if there are many changed events (see §19 for why) | `route.ts:101-106` | — |

---

## 8. Post-meeting processing pipeline (`bot.done`)

**Event:** `bot.done`, handled in `route.ts` → `processCompletedBot()` in [`lib/recall/process-meeting.ts`](lib/recall/process-meeting.ts)

**How it works:** Downloads the transcript, chunks it (~150 words/chunk per speaker turn), embeds every chunk, writes vectors to Qdrant, writes chunk text + participants to Postgres, best-effort generates meeting intelligence, then marks the meeting `done`.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | Webhook signature verified (§19) | `route.ts:63` | 401 |
| 2 | A `meetings` row must exist for this `recallBotId` | `process-meeting.ts:72` | throws (logged, webhook still 200s to Recall since the error is caught in the `after()` wrapper) |
| 3 | **Idempotency / redelivery guard**: if `meeting.status === "done"` already, the whole function returns immediately — Recall can redeliver the same webhook for up to 24h on failure, and without this guard a redelivery would insert duplicate transcript chunks/participants | `process-meeting.ts:78-80` | no-op |
| 4 | Bot must actually have a recording (`bot.recordings?.[0]`) | `process-meeting.ts:84` | throws |
| 5 | Recording must have a transcript download URL | `process-meeting.ts:90` | throws |
| 6 | Downloaded transcript JSON is validated against `TranscriptSchema` (Zod) — malformed data from Recall fails loudly instead of silently corrupting chunk data | `process-meeting.ts:94`, [`lib/recall/types.ts`](lib/recall/types.ts) | throws |
| 7 | **Write-ordering guarantee**: chunk UUIDs are pre-assigned, and the embedding + Qdrant upsert happen *before* any Postgres insert — a failure partway through leaves nothing committed, instead of orphaned unembedded chunk rows (this exact failure happened once in production; see the inline comment) | `process-meeting.ts:100-135` | throws (nothing written) |
| 8 | Title is never clobbered: `meeting.title ?? metadataTitle ?? null` — a calendar-derived title set at schedule time always wins over the post-call metadata fallback | `process-meeting.ts:157` | — |
| 9 | **Meeting intelligence is best-effort**: wrapped in `try/catch`; a failure here is logged but must not prevent `status` from becoming `"done"` — the meeting shouldn't get stuck just because summary generation failed | `process-meeting.ts:165-186` | logged, `summary`/`actionItems`/`highlights` stay `null` |
| 10 | `maxDuration = 300` on the route gives the whole pipeline (including throttled embedding batches, see §21-adjacent rate limits in `lib/ai/embeddings.ts`) enough time to finish within one serverless invocation | `route.ts:21` | — |

---

## 9. Bot failure handling (`bot.fatal`)

**Event:** `bot.fatal`, handled in `route.ts` → `markBotFatal()` in `process-meeting.ts`

**How it works:** Sets `meetings.status` to `fatal` or `fatal:<subCode>` (e.g. permission denied, meeting never started) and stamps `endedAt`.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | Webhook signature verified (§19) | `route.ts:63` | 401 |
| 2 | Update is scoped `where(eq(meetings.recallBotId, botId))` — if no row matches, it's a silent no-op update rather than an error | `process-meeting.ts:60-64` | no-op |
| 3 | Errors caught individually inside `after()` and logged, don't crash the webhook handler | `route.ts:80-87` | logged |

---

## 10. Meetings browser (list)

**UI:** [`components/meetings-browser.tsx`](components/meetings-browser.tsx), [`components/meeting-list.tsx`](components/meeting-list.tsx)
**Page:** `/meetings`

**How it works:** Server-rendered list of the signed-in user's meetings, split into upcoming / past / failed sections (or a flat filtered list when search/filters are active), with status badges mirroring Recall's bot lifecycle.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | User authenticated via `getCurrentUserId()` at the page level | dashboard page component | redirect/401 |
| 2 | Query is always scoped to the resolved `userId` — no cross-user listing is possible since the query itself filters by ownership, not a post-hoc check | `lib/db/meetings.ts` query helpers | — |

---

## 11. Meeting category assignment

**Route:** `PATCH /api/meetings/[id]` → [`app/api/meetings/[id]/route.ts`](app/api/meetings/[id]/route.ts)

**How it works:** Sets (or clears) `meetings.categoryId`.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | `categoryId` must be `null` or a string | `route.ts:24` | 400 |
| 2 | User authenticated | `getCurrentUserId()` | redirect/401 |
| 3 | **Meeting ownership**: `(meetings.id, meetings.userId)` must match — the id alone isn't enough | `route.ts:33-40` | 404 |
| 4 | **Category ownership** (only checked when assigning, not clearing): the target category must also belong to the same user — otherwise a user could tag their meeting with another user's category id | `route.ts:42-53` | 404 |

---

## 12. Meeting delete

**Route:** `DELETE /api/meetings/[id]` → `app/api/meetings/[id]/route.ts`

**How it works:** Stops the Recall bot if the meeting isn't finished yet, then deletes Qdrant vectors, then Postgres rows (transcript chunks, participants, live chat messages, meeting) in that order.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | User authenticated | `getCurrentUserId()` | redirect/401 |
| 2 | **Meeting ownership**: `(id, userId)` match required before anything is touched | `route.ts:71-78` | 404 |
| 3 | **Bot-state-aware cleanup**: only attempts to stop the bot if the meeting isn't already finished (`status === "done"` or starts with `"fatal"`) — no point cancelling a bot that already left | `route.ts:80-83` | skipped |
| 4 | **Two-tier bot shutdown**: tries `cancelScheduledBot` first (works pre-join); if that 405s (bot already in the call), falls back to `removeBotFromCall` — without this fallback a bot actively in a call would be orphaned, still recording, after the meeting disappears from the UI | `route.ts:88-98` | inner failure logged, deletion still proceeds |
| 5 | **Ordering to satisfy FK constraints**: no `ON DELETE CASCADE` is defined on `transcript_chunks`/`participants`/`live_chat_messages` → `meetings`, so those child rows are deleted explicitly *before* the meeting row, or the final delete would fail on a foreign-key violation | `route.ts:102-108` (comment explains why) | — |
| 6 | Qdrant points are deleted (`deleteTranscriptChunksForMeeting`) before the Postgres chunk rows — avoids orphaned vectors in Qdrant that no longer correspond to anything | `route.ts:102` | — |

---

## 13. Meeting detail workspace (media + transcript)

**UI:** [`components/meeting-workspace.tsx`](components/meeting-workspace.tsx), [`components/transcript-viewer.tsx`](components/transcript-viewer.tsx), [`components/audio-player.tsx`](components/audio-player.tsx)
**Page:** `/meetings/[id]`

**How it works:** Loads the meeting row, transcript chunks (ordered by `startMs`), and intelligence fields from Postgres directly — no vector search needed just to display, only to search (§17). Media plays from Recall's signed URLs.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | User authenticated + meeting ownership check at the page/data-loading level (same `(id, userId)` pattern as every other meeting-scoped route) | dashboard page component | 404 / redirect |
| 2 | Recall signed media URLs are refreshed on load rather than cached indefinitely — they expire | noted in `project.md` §9 | — |

---

## 14. Transcript export (TXT / SRT / PDF)

**Route:** `GET /api/meetings/[id]/export?format=...` → [`app/api/meetings/[id]/export/route.ts`](app/api/meetings/[id]/export/route.ts)

**How it works:** Fetches ordered transcript chunks and renders them into one of three formats: plain text, SubRip subtitles, or a PDF via `@react-pdf/renderer`.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | `format` query param must be exactly one of `txt`/`srt`/`pdf` (`isExportFormat` type guard) | `route.ts:92` | 400 listing valid formats |
| 2 | User authenticated | `getCurrentUserId()` | redirect/401 |
| 3 | **Meeting ownership**: `(id, userId)` match | `route.ts:101-108` | 404 |
| 4 | Meeting must actually have transcript chunks — an empty transcript can't be exported | `route.ts:121-126` | 400 `"No transcript available"` |
| 5 | SRT cue duration is floored at 500ms (`Math.max(c.endMs, c.startMs + 500)`) — guards against zero/negative-duration cues from bad upstream `end_ms` data that most SRT players refuse to render | `route.ts:74` (comment) | corrected transparently |
| 6 | Filename is slugified from the title (`slugify`) — lowercased, non-alphanumeric collapsed to hyphens, capped at 60 chars — prevents special characters or the raw title breaking the `Content-Disposition` header | `route.ts:42-50` | — |

---

## 15. Meeting intelligence (summary/action items/highlights)

**Route:** `POST /api/meetings/[id]/intelligence` → [`app/api/meetings/[id]/intelligence/route.ts`](app/api/meetings/[id]/intelligence/route.ts)
**Also generated automatically** at the end of the post-meeting pipeline (§8).

**How it works:** Sends the full ordered transcript (capped ~80k chars) to DeepSeek with a structured-output schema (`generateObject`) asking for a summary, action items, and highlights.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | User authenticated | `getCurrentUserId()` | redirect/401 |
| 2 | Rate limit: 10 regenerations / hour / user (a full-transcript LLM call is not cheap) | `rateLimit("intelligence", userId)` | 429 |
| 3 | **Meeting ownership**: `(id, userId)` match | `route.ts:20-27` | 404 |
| 4 | **State check**: meeting must have `status === "done"` — can't summarize a transcript that doesn't exist yet | `route.ts:29-34` | 400 |
| 5 | Meeting must have at least one transcript chunk | `route.ts:46-51` | 400 |
| 6 | If the model call succeeds but returns nothing usable, that's surfaced as a distinct error rather than silently saving nulls | `route.ts:58-63` | 502 |
| 7 | Any thrown error (network, model failure) is caught and logged with the meeting id, returned as a generic 502 rather than leaking internals | `route.ts:80-86` | 502 |
| 8 | (In the automatic path, §8 check #9) — this manual regenerate endpoint intentionally does **not** swallow the error the way the automatic post-`bot.done` path does, since here a human is actively waiting for the result | — | — |

---

## 16. Categories CRUD

**Routes:** `GET/POST /api/categories`, `DELETE /api/categories/[id]`
[`app/api/categories/route.ts`](app/api/categories/route.ts), [`app/api/categories/[id]/route.ts`](app/api/categories/[id]/route.ts)

**How it works:** Simple CRUD scoped to the user, with a `meetingCount` computed via a `LEFT JOIN` + `count()` on list.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | `GET`: results always filtered `eq(categories.userId, userId)` | `route.ts:17` | — |
| 2 | `POST`: `name` must be a non-empty string after trimming | `route.ts:27` | 400 |
| 3 | `POST`: name is trimmed before storage (`name.trim()`) | `route.ts:35` | — |
| 4 | `DELETE`: delete query itself is scoped to `(id, userId)` in a single statement — if it matches nothing (wrong id *or* wrong owner), `deleted` is undefined | `[id]/route.ts:13-16` | 404 |
| 5 | Deleting a category doesn't touch its meetings directly in application code — the FK is `ON DELETE SET NULL` at the schema level (`lib/db/schema.ts:77-79`), so meetings automatically become uncategorized rather than being blocked or cascade-deleted | schema-level | — |

---

## 17. Post-meeting RAG chat (web)

**Route:** `POST /api/chat` → [`app/api/chat/route.ts`](app/api/chat/route.ts)
**UI:** [`components/chat-panel.tsx`](components/chat-panel.tsx), [`components/category-chat.tsx`](components/category-chat.tsx)

**How it works:** See [`CONCEPTS.md §4-7`](CONCEPTS.md) for the full RAG mechanism. In short: classify whether the question needs transcript context → if yes, embed the question → search Qdrant filtered by meeting/category → stream an answer grounded in the retrieved excerpts.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | **Exactly one scope required**: `meetingId` or `categoryId` must be present — there is deliberately no "all meetings" unscoped mode reachable from the web | `route.ts:26-31` | 400 |
| 2 | User authenticated | `getCurrentUserId()` | redirect/401 |
| 3 | Rate limit: 30 messages / 5 minutes / user | `rateLimit("chat", userId)` | 429 |
| 4 | **Meeting ownership re-verified inside the retrieval layer**, not just trusted from the request — `meetingId` is client-supplied, so `retrieveChunks()` in `lib/ai/rag.ts` independently checks `(meetings.id, meetings.userId)` before ever touching Qdrant. Without this, any signed-in user could read another user's transcript by guessing a meeting UUID in the request body | `lib/ai/rag.ts:100-107` | returns empty chunks (question answered as if nothing was found) |
| 5 | **Category membership resolved fresh from Postgres at query time**, not trusted from any cached/client value, and not synced into Qdrant payloads (avoids drift if a meeting's category changes) | `lib/ai/rag.ts:114-124` | — |
| 6 | Classifier failure defaults to running RAG rather than skipping it — a wrong "no relevant excerpts" answer is considered a safer failure than silently dropping needed context | `lib/ai/rag.ts:55-60` | falls back to RAG |
| 7 | `maxDuration = 30` bounds the route's total time (this path doesn't do the slow embedding-batch work of the post-meeting pipeline, so a much shorter budget is fine) | `route.ts:11` | — |

---

## 18. Live in-meeting `@Rika` chat

**Event:** `participant_events.chat_message`, handled in `route.ts` → `handleLiveChatMessage()` in [`lib/recall/live-chat.ts`](lib/recall/live-chat.ts)

**How it works:** Every chat message sent inside a call the bot is in triggers this webhook. If the message is directed at Rika, she answers using the same RAG pipeline (non-streaming variant) and posts the reply back into the meeting's chat.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | Webhook signature verified (§19) | `route.ts:63` | 401 |
| 2 | **Self-message loop guard**: if the sender's name equals `BOT_DISPLAY_NAME` ("RIKA"), the message is ignored immediately — without this, Rika's own reply (which contains "Rika"-adjacent text posted back into the same chat feed) would re-trigger this handler and reply to itself forever | `live-chat.ts:73` | early return |
| 3 | **Trigger pattern match**: message must match `/^@?rika[,:\s]+(.+)/i` — a bare mention without a following question is ignored (`extractQuestion` returns `null` if the captured group is empty after trimming) | `live-chat.ts:16,30-34` | early return, no reply sent |
| 4 | A `meetings` row must exist for the bot id delivering the event | `live-chat.ts:88` | early return |
| 5 | **Scope fallback logic**: if the meeting has a category, answer scoped to that category; otherwise fall back to `uncategorizedOnly` — this is the *only* code path allowed to use `uncategorizedOnly` (the web `/api/chat` route never accepts it) | `live-chat.ts:96-98` | — |
| 6 | **Reply length capped per platform** before sending — Google Meet chat truncates around 500 chars, Zoom/Teams allow up to 4096; sending an over-limit message would likely fail or get silently truncated by the platform itself, so Rika truncates deliberately with an ellipsis first | `live-chat.ts:18-23,36-39,103-105` | truncated with `…` |
| 7 | Both the question and the (truncated) answer are persisted to `live_chat_messages` **before** attempting to send, so history stays consistent even if the send to Recall subsequently fails | `live-chat.ts:107-112` | — |
| 8 | Conversation history is capped at the last 10 turns (`HISTORY_LIMIT`) — bounds both the DB read and the prompt size | `live-chat.ts:28,51` | — |

---

## 19. Webhook signature verification (cross-cutting)

**File:** [`lib/recall/verify-webhook.ts`](lib/recall/verify-webhook.ts), applied first thing in `POST` of [`app/api/webhooks/recall/route.ts`](app/api/webhooks/recall/route.ts) — gates *every* webhook-driven feature above (§7, §8, §9, §18).

**How it works:** Recall signs each webhook using a Svix-compatible HMAC-SHA256 scheme: `sign(secret, "{id}.{timestamp}.{rawBody}")`, sent as the `webhook-signature` header (possibly multiple space-separated candidates, for key rotation).

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | All three headers (`webhook-id`, `webhook-timestamp`, `webhook-signature`) must be present | `verify-webhook.ts:12` | `false` → route returns 401 |
| 2 | Secret is decoded from base64 after stripping the `whsec_` prefix, exactly matching Recall's documented scheme | `verify-webhook.ts:14-17` | — |
| 3 | Expected signature is recomputed **server-side** from the raw (unparsed) body — this is why the route reads `request.text()` first and only `JSON.parse`s afterward; parsing first would risk normalizing whitespace/key order and invalidating the signature check | `route.ts:61`, `verify-webhook.ts:18-21` | — |
| 4 | Comparison uses `timingSafeEqual`, not `===` or `includes` — a naive string comparison would leak timing information an attacker could use to guess the correct signature byte-by-byte | `verify-webhook.ts:27-31` | — |
| 5 | Signature-length mismatch is checked before the timing-safe compare (`sigBuf.length === expectedBuf.length`), since `timingSafeEqual` throws on mismatched buffer lengths rather than returning `false` | `verify-webhook.ts:29` | — |
| 6 | Every candidate in the space-separated signature header is checked (`.some(...)`) — supports Recall rotating signing keys without a hard cutover | `verify-webhook.ts:24` | — |

If verification fails, the route returns `401` immediately and **nothing downstream runs** — no event parsing, no `after()` scheduling.

---

## 20. Auth / user resolution (cross-cutting)

**File:** [`lib/auth.ts`](lib/auth.ts) — `getCurrentUserId()`, called at the top of essentially every page and API route above except webhooks.

**How it works:** See [`CONCEPTS.md §9`](CONCEPTS.md#9-concept-auth-without-middleware-gatekeeping) for the full rationale (resource-based auth instead of middleware).

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | `auth.protect()` — Clerk's own check that a valid session exists; this is the actual enforcement point, not `proxy.ts` | `auth.ts:10` | redirect to sign-in (page) / 401 (API) |
| 2 | Lookup internal `users` row by `clerkUserId` first (the common case for every request after first sign-in) | `auth.ts:12-16` | — |
| 3 | **JIT linking**: if no row is linked yet, look up by the Clerk account's primary email — if a pre-auth seeded row exists with that email, link it (updates `clerkUserId`) instead of creating a duplicate, preserving that user's existing meetings | `auth.ts:21-36` | — |
| 4 | Otherwise, insert a brand-new `users` row, falling back to a synthetic `${clerkUserId}@unknown.local` email if Clerk didn't provide one (e.g. an account with no verified email) | `auth.ts:39-43` | — |
| 5 | `proxy.ts` (the Next 16 middleware replacement) deliberately does **not** gate routes itself — it only wires up `clerkMiddleware()` so session cookies/JWTs are available; every actual access-control decision happens inside the handler that calls `getCurrentUserId()` | `proxy.ts` | — |

---

## 21. Rate limiting (cross-cutting)

**File:** [`lib/rate-limit.ts`](lib/rate-limit.ts) — applied to §1, §5, §15, §17 (the four cost-sensitive/abusable routes).

**How it works:** Three independent Upstash Redis sliding-window limiters, one per abuse profile:

| Bucket | Limit | Applied to |
|---|---|---|
| `bots` | 10 / hour / user | Join now (§1), calendar manual record (§5) |
| `chat` | 30 / 5 min / user | Web RAG chat (§17) |
| `intelligence` | 10 / hour / user | Notes regeneration (§15) |

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | Limiter keyed by the **internal** `userId` (post-auth), not IP or Clerk id — consistent even if a user's session token changes | call sites, e.g. `route.ts` in each feature | — |
| 2 | On limit exceeded: returns `429` with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` headers computed from the actual reset time | `rate-limit.ts:79-94` | 429 |
| 3 | **Fails open on Redis error**: if the Upstash call itself throws (outage, misconfiguration), the error is logged and the request is allowed through — a rate-limit dependency going down should not take down bot creation or chat for every real user; this is a deliberate risk trade-off, not an oversight | `rate-limit.ts:69-77` | request proceeds normally |
| 4 | Limiters and the Redis client are constructed lazily (`getRedis()`, `getLimiters()`) — avoids crashing at module load / build time if Upstash env vars aren't set in an environment that doesn't need rate limiting yet | `rate-limit.ts:7-15,26-51` | — |

---

## 22. Marketing landing / redirect gate

**Route:** `/` → [`app/page.tsx`](app/page.tsx)

**How it works:** Signed-out visitors see the full marketing landing page; signed-in users are redirected straight to `/meetings`.

**Checks:**
| # | Check | Where | Failure behavior |
|---|---|---|---|
| 1 | Uses a **soft** `auth()` check (not `auth.protect()`) — this route must render for anonymous visitors, so it can't throw/redirect on missing auth the way protected routes do; it only branches behavior based on whether a session exists | `app/page.tsx` | — |

---

## 23. Summary table — every check at a glance

| Check type | Where it shows up | Purpose |
|---|---|---|
| **Input shape validation** (typeof / non-empty / enum) | Every `POST`/`PATCH` body, every `format`/query param | Reject malformed requests before touching the DB or an external API |
| **Auth (`auth.protect()`)** | Every page/route via `getCurrentUserId()` | No anonymous access to any user data |
| **Ownership check (`WHERE id = ? AND userId = ?`)** | Meetings (§11,12,13,14,15), categories (§16), calendar connections (§6), RAG retrieval (§17) | Prevents any user from reading/mutating another user's resource by guessing a UUID |
| **Rate limiting** | Bot creation (§1,5), chat (§17), intelligence (§15) | Cost/abuse control on the four routes that call paid external APIs per request |
| **Webhook signature (HMAC, timing-safe)** | All Recall webhook events (§7,8,9,18) | Only Recall can trigger transcript processing, bot-fatal transitions, or live-chat replies |
| **OAuth `state` CSRF cookie** | Google/Outlook connect flow (§2,3) | Callback can't be forged/replayed against a different session |
| **Idempotency / redelivery guards** | `bot.done` processing (§8), calendar event scheduling dedup key (§5) | Retried webhooks or repeat actions don't duplicate data |
| **Write-ordering guarantees** | Post-meeting pipeline: Qdrant before Postgres (§8); FK-safe delete ordering (§12) | A failure partway through never leaves inconsistent/orphaned state |
| **Best-effort / non-blocking failure isolation** | Meeting intelligence generation (§8, automatic path), per-event scheduling errors (§6,7) | One failing sub-step doesn't take down the whole pipeline or request |
| **Fail-open on infra outage** | Rate limiting (§21) | A secondary system (Redis) being down doesn't block core product functionality |
| **Self-loop guard** | Live chat (§18) | Rika never replies to her own message |
| **Data minimization** | Calendar events response (§4) | Don't leak more provider data (attendee emails, etc.) to the client than needed |

For the underlying *why* behind many of these decisions, see the "Design decisions" table in [`project.md` §12](project.md#12-design-decisions) and the concept explanations in [`CONCEPTS.md`](CONCEPTS.md).
