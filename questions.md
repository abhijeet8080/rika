# Rika — Question Bank

Every question you could reasonably be asked about this project — for interview prep, onboarding a new contributor, or testing your own understanding. Organized by topic, roughly beginner → advanced within each section. Answers live in [`CONCEPTS.md`](CONCEPTS.md), [`FEATURES.md`](FEATURES.md), and [`project.md`](project.md) — this file is deliberately just the questions, so you can use it to self-test before checking those.

---

## Table of contents

1. [Product & high-level architecture](#1-product--high-level-architecture)
2. [Meeting bots (Recall.ai)](#2-meeting-bots-recallai)
3. [Webhooks](#3-webhooks)
4. [RAG (Retrieval-Augmented Generation)](#4-rag-retrieval-augmented-generation)
5. [Vector embeddings & Qdrant](#5-vector-embeddings--qdrant)
6. [Database design (Postgres/Drizzle)](#6-database-design-postgresdrizzle)
7. [Streaming & the AI SDK](#7-streaming--the-ai-sdk)
8. [Auth (Clerk) & authorization](#8-auth-clerk--authorization)
9. [Calendar integration & OAuth](#9-calendar-integration--oauth)
10. [Rate limiting](#10-rate-limiting)
11. [Live in-meeting `@Rika` chat](#11-live-in-meeting-rika-chat)
12. [Meeting intelligence (summaries/action items)](#12-meeting-intelligence-summariesaction-items)
13. [Categories](#13-categories)
14. [Transcript export](#14-transcript-export)
15. [Meeting delete & lifecycle](#15-meeting-delete--lifecycle)
16. [Security (cross-cutting)](#16-security-cross-cutting)
17. [Next.js / framework-specific](#17-nextjs--framework-specific)
18. [Design decisions & trade-offs ("why not X instead?")](#18-design-decisions--trade-offs-why-not-x-instead)
19. [Failure modes & edge cases](#19-failure-modes--edge-cases)
20. [System design / scaling / "what would you change?"](#20-system-design--scaling-what-would-you-change)
21. [Rapid-fire / definitions](#21-rapid-fire--definitions)

---

## 1. Product & high-level architecture

1. What does Rika actually do, in one sentence?
2. What are the two ways a bot can join a meeting?
3. Walk me through what happens between pasting a Zoom link and being able to chat about that meeting.
4. What are the four architectural layers of this app, and what lives in each?
5. Which parts of the system does Rika's own code *not* implement, and why?
6. Where does video/audio actually get stored — does Rika host it?
7. What third-party services does this app depend on, and what is each one responsible for?
8. If Recall.ai went down entirely, what would and wouldn't work in Rika?
9. What's the difference between `project.md`, `CONCEPTS.md`, and `FEATURES.md` in this repo, and why are there three docs instead of one?

## 2. Meeting bots (Recall.ai)

10. Why can't Rika just "listen in" on a Zoom call via an API instead of joining as a bot?
11. What is a Recall "bot" from a technical standpoint?
12. What's the difference between an instant ("join now") bot and a calendar-scheduled bot in how they're created?
13. What does `detectPlatform()` do and where does it get its input from?
14. Where is the bot's display name defined, and why does it matter that it's a single shared constant?
15. What are the two terminal states a bot's lifecycle can end in, and what webhook event signals each?
16. What happens to `meetings.status` when a bot fails, and what's the difference between `fatal` and `fatal:<subCode>`?
17. Why does creating a bot explicitly pass `recordVideo`/`recordAudio` instead of relying on Recall's defaults?

## 3. Webhooks

18. What is a webhook, conceptually, and how is it the "inverse" of a normal API call?
19. Why can't Rika just poll Recall for bot status instead of using webhooks?
20. What HTTP status/timing does Recall expect from the webhook endpoint, and what happens if that's missed?
21. Why would processing a `bot.done` webhook synchronously (before responding) be a problem here specifically?
22. What is `after()` in Next.js, and how does it solve the "ack fast, process slow" problem?
23. If `after()` schedules code to run *after* the response is sent, why does the route still need `maxDuration = 300`?
24. What does it mean for a webhook to be "redelivered," and what triggers Recall to redeliver one?
25. How does the code guarantee that redelivery of `bot.done` doesn't insert duplicate transcript chunks?
26. Walk through exactly how the Recall webhook signature is verified, step by step.
27. Why is the raw request body read via `request.text()` before being parsed as JSON — what would break if you parsed first?
28. Why does the signature check use `timingSafeEqual` instead of `===` or `.includes()`?
29. What would happen if you compared signature buffers of different lengths with `timingSafeEqual` directly, and how does the code avoid that?
30. Why does the signature header sometimes contain multiple space-separated candidates, and how does the code handle that?
31. What happens if the webhook signature verification fails — does anything downstream still run?
32. Which five Recall webhook event types does this app actually handle?
33. Are Recall webhooks authenticated with Clerk? Why or why not?

## 4. RAG (Retrieval-Augmented Generation)

34. What problem does RAG solve that "just paste the whole transcript into the prompt" doesn't?
35. What are the concrete steps of the RAG pipeline in this app, in order?
36. Why is the transcript chunked instead of embedded as one giant block?
37. What's the size limit per chunk, and what determines a chunk boundary (word count? time? speaker turn?)?
38. What is `needsMeetingContext()` and what problem does it solve?
39. What happens if the classifier's LLM call itself fails — does the app skip RAG or run it anyway? Why that choice?
40. Why is the classifier "history-aware," and what kind of question would it get wrong without that?
41. Give an example of a question that should skip RAG entirely, and one that should trigger it.
42. What does `retrieveChunks()` return, and what fields does each result carry?
43. What's the default number of chunks retrieved per question, and where is that configured?
44. How are the retrieved chunks turned into a prompt the model can use (what does `buildContext()` do)?
45. How does the model cite which excerpt it used in its answer?
46. What does the system prompt instruct the model to do if the excerpts don't contain the answer?
47. What's the difference between `answerQuestion()` and `answerQuestionText()`, and why do both exist?
48. Which AI model answers chat questions, and which one produces the embeddings — why are they different providers?

## 5. Vector embeddings & Qdrant

49. What is a vector embedding, explained to someone with no ML background?
50. Why does "we pushed the deadline to Friday" end up near "the due date moved to end of week" in embedding space despite sharing almost no words?
51. What embedding model does this app use, and how many dimensions does it produce?
52. What is the difference between `RETRIEVAL_DOCUMENT` and `RETRIEVAL_QUERY` embedding task types, and where does each get used?
53. What similarity metric does the Qdrant collection use, and what does it actually measure?
54. Why does embedding a long meeting take several minutes instead of happening instantly?
55. What's the batch size and cooldown used for embedding calls, and why do they exist?
56. What direct consequence does the embedding rate limit have on the webhook route's configuration?
57. What payload fields does each point in the Qdrant collection carry, and why is the transcript *text* duplicated into Qdrant instead of only living in Postgres?
58. What are the payload indexes on the Qdrant collection for, and what command sets them up?
59. If you wanted RAG to search across every meeting a user has ever had, what would need to change?

## 6. Database design (Postgres/Drizzle)

60. Why does this app use two databases (Postgres and Qdrant) instead of one?
61. What's stored in Postgres vs. what's stored in Qdrant for a single transcript chunk?
62. How are a chunk's Postgres row and its Qdrant vector point linked together?
63. Walk through the entity relationship diagram — how do `users`, `meetings`, `categories`, `transcript_chunks`, `participants`, and `live_chat_messages` relate?
64. Why is `meetings.categoryId` a nullable foreign key with `ON DELETE SET NULL` instead of blocking deletion or cascading?
65. Is a meeting allowed to have more than one category? Why was that decision made?
66. What's the difference between `summary: null` and `summary: ""`/`actionItems: []` on a meeting row — what does each state actually mean?
67. Why does `process-meeting.ts` write to Qdrant *before* writing chunk rows to Postgres, rather than the other way around, or both in parallel?
68. Describe the real production incident that motivated that ordering decision.
69. Why is there no `ON DELETE CASCADE` from `meetings` to `transcript_chunks`/`participants`/`live_chat_messages`, and what does the delete route have to do as a result?
70. Why does `live_chat_messages` exist as a table at all instead of holding conversation state in memory?
71. Why is `clerkUserId` on the `users` table nullable, and what does that enable?
72. What is `onConflictDoUpdate` used for in `scheduleBotForCalendarEvent`, and what real-world action does it make idempotent?
73. What ORM does this project use, and how are schema changes applied to the database?

## 7. Streaming & the AI SDK

74. What problem does streaming an LLM response solve for the user, given the total generation time is the same either way?
75. Which AI SDK function streams a response, and which one waits for the full result — where is each used in this app, and why?
76. Why doesn't the live in-meeting chat stream its answer the way the web chat does?
77. On the client side, what hook consumes a streamed chat response, and roughly how does it work?
78. What does `createUIMessageStreamResponse` / `toUIMessageStream` do in `/api/chat/route.ts`?

## 8. Auth (Clerk) & authorization

79. Why doesn't `proxy.ts` block unauthenticated requests to protected routes the way a typical Next.js middleware would?
80. What actually enforces "you must be signed in" if not the middleware?
81. Walk through everything `getCurrentUserId()` does, step by step.
82. What is "JIT (just-in-time) user linking," and what specific scenario does it exist to handle?
83. What email does a new user get if Clerk doesn't provide one at all?
84. What is "resource-based auth," and how does it differ from path-based middleware protection?
85. Give a concrete example in this codebase where trusting a client-supplied id without a server-side ownership check would be a security hole.
86. Where exactly does the RAG chat route re-verify meeting ownership, and why is that necessary given the meetingId comes from the request body?
87. Are webhook requests from Recall subject to Clerk auth at all? What replaces it?

## 9. Calendar integration & OAuth

88. What does Recall's "Calendar V2" product do, and why does Rika delegate calendar-watching to it instead of polling Google/Microsoft itself?
89. Walk through the full Google Calendar connect flow, from clicking "Connect" to a `calendar_connections` row existing.
90. What is the OAuth `state` parameter for, and how is it implemented here (cookie attributes, lifetime, etc.)?
91. What attack does the `state` check protect against, and how would you exploit its absence?
92. Why does the connect route force `prompt=select_account consent` instead of the default OAuth prompt behavior?
93. Why must Google actually return a `refresh_token`, and what happens in the code if it doesn't?
94. Why is `access_type=offline` required for a background service like this?
95. How are multiple Google accounts for the same user (e.g. personal + work Gmail) represented in the data model?
96. What's the dedup key used to prevent connecting the same calendar account twice?
97. What is "auto-record," and what are the two separate mechanisms that together make it cover both existing and future calendar events?
98. Why does turning on auto-record need an explicit backfill step in addition to the webhook-driven path?
99. What happens if you toggle auto-record on for a connection you don't own — is that possible?
100. Why does the calendar-events API endpoint reshape each event object instead of returning Recall's raw response?
101. Is the Outlook flow fully live in production? What's still needed for it to work?

## 10. Rate limiting

102. What library and backing store implement rate limiting in this app?
103. Why are there three separate rate limiters instead of one global one?
104. What are the actual limits for each of the three buckets, and which routes use each?
105. What identifier is used as the rate-limit key — IP address, Clerk id, or something else? Why that choice?
106. What does "fail open" mean in the context of this rate limiter, and what's the alternative ("fail closed")?
107. Why did this app choose fail-open specifically for rate limiting?
108. What HTTP status and headers does a rate-limited request receive back?
109. Why are the Redis client and limiters constructed lazily instead of at module load time?

## 11. Live in-meeting `@Rika` chat

110. How does a message typed into a Zoom/Meet/Teams chat panel end up triggering a response from Rika?
111. What regex pattern determines whether a chat message is "directed at" Rika, and what messages would and wouldn't match it?
112. What is the self-reply loop risk in this feature, and exactly how is it prevented?
113. Why can't this feature hold conversation history in server memory the way you might expect a chatbot to?
114. What table stores live chat history, and how many recent turns are read back for context?
115. Why are per-platform character limits applied to Rika's replies, and what are the limits for Meet vs. Zoom/Teams?
116. If a meeting has no category, what scope does the live chat fall back to — and why is that scope only used here and never in the web chat?
117. In what order are the DB write (persisting the Q&A turn) and the actual chat message send to Recall performed, and why does that order matter?

## 12. Meeting intelligence (summaries/action items)

118. What three things does "meeting intelligence" produce for a completed meeting?
119. What AI SDK feature is used to get a typed, structured object back from the model instead of free text?
120. Roughly how large a transcript is sent to the model, and why is there a cap?
121. Why is intelligence generation wrapped in a `try/catch` in the automatic post-meeting pipeline specifically?
122. What must never happen to `meetings.status` even if intelligence generation fails?
123. What's the difference in error-handling philosophy between the automatic intelligence generation (inside `bot.done` processing) and the manual `POST /api/meetings/[id]/intelligence` regenerate endpoint?
124. What precondition must a meeting satisfy before you're allowed to (re)generate intelligence for it?

## 13. Categories

125. Can a meeting belong to more than one category?
126. What happens to a meeting's `categoryId` when its category is deleted?
127. Where is category ownership checked when assigning a category to a meeting, and why is it checked in *two* places (the meeting and the category) rather than one?
128. Why is category membership resolved from Postgres at chat time instead of being stored directly on each vector in Qdrant?
129. What would go wrong if category IDs *were* synced into Qdrant payloads and a user renamed or reassigned a category?

## 14. Transcript export

130. What three export formats are supported, and what's the Content-Type/extension for each?
131. What precondition must be true before a meeting can be exported, and what happens otherwise?
132. Why does the SRT builder clamp cue duration to at least 500ms instead of using the raw `end_ms` value?
133. Why is the exported filename slugified instead of using the raw meeting title directly?

## 15. Meeting delete & lifecycle

134. What are the possible values `meetings.status` can take across a meeting's lifecycle?
135. When deleting a meeting, how does the app decide whether it even needs to contact Recall at all?
136. What are the two Recall API calls attempted when stopping a bot during delete, and why try the second one only if the first fails?
137. What would happen to an in-progress bot if the delete route only ever called `cancelScheduledBot` and never fell back?
138. In what order are rows deleted across Qdrant and the four Postgres tables involved, and why does that order matter?
139. What database error would you get if you deleted the `meetings` row before its `transcript_chunks` rows, given the schema as written?

## 16. Security (cross-cutting)

140. List every distinct kind of security check present in this codebase (you should be able to name at least 6).
141. Where in the codebase is user input trusted "as-is" vs. where is it independently re-verified against the database — give one example of each.
142. What would happen, concretely, if the meeting-ownership check inside `retrieveChunks()` were removed?
143. Why is the calendar-events API careful about which fields it returns to the client?
144. What CSRF protection exists in this app, and what specific flow does it protect?
145. What prevents someone from POSTing directly to `/api/webhooks/recall` with a fake `bot.done` payload and injecting fabricated transcript data?
146. Are there any endpoints in this app that intentionally have **no** ownership check, and if so why is that safe?

## 17. Next.js / framework-specific

147. What Next.js version does this project use, and why does `AGENTS.md` warn that "this is not the Next.js you know"?
148. What replaced traditional middleware-based route protection in this codebase, and why?
149. What does `maxDuration` control, and why does it differ between `/api/webhooks/recall` (300s), `/api/chat` (30s), and `/api/meetings/[id]/intelligence` (60s)?
150. Why are the AI provider clients (Gemini, DeepSeek) constructed lazily instead of at import time?
151. What rendering strategy do dashboard pages that reflect live webhook state need to opt into, and why?

## 18. Design decisions & trade-offs ("why not X instead?")

152. Why not use `pgvector` inside the existing Postgres database instead of a separate Qdrant instance?
153. Why not give web chat an "all meetings" unscoped mode in addition to per-meeting/per-category?
154. Why not just always run the RAG pipeline, skipping the cheap classifier step?
155. Why not have the meetings intelligence step run *before* the transcript chunks are written to Postgres?
156. Why not let auto-record apply per calendar account instead of per provider?
157. Why not store the video/audio recordings on Rika's own storage instead of relying on Recall's signed URLs?
158. Why not block requests entirely when the rate limiter's backing Redis is unreachable?
159. Why not use a single "all-purpose" rate limiter instead of three separate ones?
160. Why does the web chat scope require an explicit `meetingId` or `categoryId` in the request body instead of inferring the "current" one server-side?

## 19. Failure modes & edge cases

161. What happens if Recall redelivers a `bot.done` webhook for a meeting that's already fully processed?
162. What happens if the embedding API call fails partway through a long meeting's chunk batches?
163. What happens if a user pastes the same meeting URL twice in a row?
164. What happens if a user tries to join a meeting that a calendar auto-record bot has *already* joined?
165. What happens if meeting intelligence generation throws an exception during the automatic post-meeting pipeline?
166. What happens if a webhook arrives with a valid signature but a `botId` that doesn't correspond to any `meetings` row?
167. What happens if you try to export a transcript for a meeting that has zero transcript chunks?
168. What happens if Google's OAuth callback is hit with a `state` value that doesn't match the cookie?
169. What happens if a user's OAuth consent doesn't include a `refresh_token`?
170. What happens if a chat message is sent that's longer than the target platform's chat character limit?
171. What happens if two different users happen to reference the same `meetingId` — can one see the other's transcript through the chat endpoint?
172. What happens to the meeting's chunk rows if the Qdrant upsert succeeds but the subsequent Postgres insert throws?

## 20. System design / scaling / "what would you change?"

173. If this app needed to support 10x more concurrent meetings ending at once, what part of the pipeline would you look at first, and why?
174. The 65-second cooldown between embedding batches is tied to a free-tier rate limit — how would you redesign this if you upgraded to a paid tier with higher throughput?
175. How would you add real-time (in-progress) transcript streaming to the meeting workspace, given the current architecture ends with a `bot.done` webhook only after the call is over?
176. If you needed to support a fourth meeting platform beyond Zoom/Meet/Teams, what would need to change?
177. How would you add a global "search across all my meetings regardless of category" feature, given the current design deliberately avoids unscoped retrieval?
178. If Qdrant were unavailable, what parts of the app would degrade, and how might you make that degradation graceful instead of a hard failure?
179. How would you test the webhook signature verification logic without a real Recall account?
180. What would you need to change to make the rate limiter fail *closed* instead of open, and what user-facing trade-off would that introduce?

## 21. Rapid-fire / definitions

Quick recall questions — answer in a sentence or less.

181. What is a "chunk" in this codebase?
182. What is `BOT_DISPLAY_NAME` and where must it stay consistent?
183. What does `ChatScope` represent, and what are its three possible shapes?
184. What does "fail open" mean?
185. What is JIT user linking?
186. What does `after()` do?
187. What does `maxDuration` configure?
188. What is the embedding model, and how many dimensions does it output?
189. What is the chat/classification model?
190. What does `needsMeetingContext()` decide?
191. What HTTP status does a rate-limited request return?
192. What HTTP status does an invalid webhook signature return?
193. What does `onConflictDoUpdate` achieve in the calendar scheduling code?
194. What's the difference between `cancelScheduledBot` and `removeBotFromCall`?
195. What does `uncategorizedOnly` mean in `ChatScope`, and which single code path is allowed to set it?
196. What three formats can a transcript be exported as?
197. What Postgres FK behavior applies when a category is deleted, and what column does it affect?
198. What's stored in a Qdrant payload for a transcript chunk?
199. What does "resource-based auth" mean, in contrast to middleware-based auth?
200. Name the five Recall webhook events this app handles.

---

*Answers are not included in this file by design — check [`CONCEPTS.md`](CONCEPTS.md) for the "why," [`FEATURES.md`](FEATURES.md) for the exact checks and file:line references, and [`project.md`](project.md) for the reference tables (schema, API routes, env vars).*
