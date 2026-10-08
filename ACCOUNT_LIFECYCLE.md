# Account lifecycle setup

This feature runs on Vercel Hobby using a daily cron. It is independent of the
reliable-processing work parked on the other branch.

## Deploy

1. Apply the committed migration to the database used by the deployment:

   ```bash
   npm install
   npm run db:migrate
   ```

   Drizzle reads `.env.local`. Confirm its `DATABASE_URL` points to the intended
   database before running this command. Migration `0009_account_lifecycle.sql`
   adds retention, deletion markers, cleanup leases, and calendar ownership
   links. No Qdrant schema change is required.

   The migration also enforces one calendar connection per user, provider,
   email, and Recall account. If migration reports duplicate connections,
   inspect those rows and disconnect redundant provider calendars before
   resolving the duplicate rows; do not drop identifiers for live connections.

2. Add these environment variables locally and in Vercel:

   - `CRON_SECRET`: a random secret, for example generated with
     `openssl rand -hex 32`.
   - `CLERK_WEBHOOK_SIGNING_SECRET`: the signing secret for the Clerk webhook
     endpoint below.

   Keep the existing Clerk, Recall, Neon, and Qdrant credentials. Each Recall
   account must permit calendar and recording deletion. Enable Fluid Compute
   so the configured 300-second cleanup duration is available.

3. In the Clerk dashboard, create a webhook endpoint at
   `https://YOUR_DOMAIN/api/webhooks/clerk` and subscribe to `user.deleted`.
   Copy that endpoint's signing secret to `CLERK_WEBHOOK_SIGNING_SECRET`.
   This covers deletion through Clerk's account panel or dashboard as well as
   deletion through Rika.

4. Deploy. `vercel.json` schedules `/api/internal/cleanup` daily at 03:00 UTC
   (08:30 IST); Hobby execution can occur within that hour. Vercel supplies
   `Authorization: Bearer <CRON_SECRET>`. Cron runs on production deployments.

## Behavior

- **Calendar → Manage calendars:** disconnect, inspect failures, retry, and
  reconnect the same calendar account. Disconnect removes the Recall calendar
  connection and unschedules future bots linked to it. Completed meetings stay.
  Active calls can finish; deleting the meeting/account stops those bots too.
  Auto-record starts disabled after reconnect.
- **Account → Meeting retention:** keep forever (default), or 30, 90, 180, or
  365 days. Saving a shorter period queues eligible existing completed/fatal
  meetings for deletion. Age uses the completion timestamp, falling back to
  creation time if unavailable. Active/processing meetings are not expired.
- New bots receive provider retention in hours. Existing recordings keep the
  provider expiry chosen when created; a longer setting cannot extend that
  expiry or recover deleted media.
- **Meeting deletion:** hide immediately; remove each Recall recording and its
  associated media, Qdrant vectors, transcripts, participants, notes, and chat.
  Scheduled bots are cancelled; dispatched bots leave first, then recording
  cleanup waits for completion.
- **Account deletion:** persist the deletion request, close the workspace,
  delete the Clerk sign-in identity, disconnect calendars, delete meetings,
  then remove categories, connections, remaining user vectors, and the user.
- Provider identifiers remain in deletion markers until cleanup succeeds.
  Leases prevent concurrent cleanup. Failed attempts and expired leases resume
  on the daily run. Account settings show pending meeting cleanup and allow
  manual retries; calendar settings show disconnect status and retry.
- The final data/vector sweep waits at least 310 seconds after deletion starts,
  allowing in-flight webhook writes to end. With Hobby's daily cron, cleanup
  may complete on a later daily run; provider outages or large backlogs may
  require additional runs. Requests return 202 when queued, not a guarantee
  that every external deletion has already finished.
- Recall recording deletion removes media, but Recall's separate bot
  metadata/log retention and infrastructure backups are governed by their own
  policies. Calendar disconnect does not revoke the Google/Microsoft app grant;
  users can also revoke it in the provider's account permissions.

## Run cleanup manually

```bash
npm run lifecycle:cleanup
```

This uses the real credentials in `.env.local` and processes pending deletions
and expired meetings. It performs actual deletion. Run again after the grace
period if you want local cleanup to finish before the next cron run.

To invoke deployed cleanup manually:

```bash
curl --fail -H "Authorization: Bearer $CRON_SECRET" \
  https://YOUR_DOMAIN/api/internal/cleanup
```

Check Vercel function logs for failures, Clerk's webhook delivery log for 2xx
responses, and pending-deletion/disconnect status in the UI. Missing cron
configuration returns 503; invalid authorization returns 401.

## Verification

```bash
npm run test:lifecycle
TEST_LIFECYCLE_DATABASE_URL=postgresql://USER@127.0.0.1:5432/postgres npm run test:lifecycle
npm run test:recall
npm run test:rag
npm run lint
npm run build
```

The PostgreSQL suite uses a disposable schema and mocks external cleanup
services. Without the test database URL, it skips that suite and runs the
offline policy/provider-client tests. It never reads `.env.local`.

For a deployed smoke test, use a disposable account and calendar: reconnect,
schedule a recording, disconnect, verify scheduled bots are removed while
completed meetings remain, delete a completed meeting, and run cleanup after
the grace period. Confirm Recall media and application rows/vectors disappear.
Finally delete that account and check Clerk webhook delivery and the final
application cleanup. Repeat with provider deletion temporarily unavailable to
verify pending status and recovery.
