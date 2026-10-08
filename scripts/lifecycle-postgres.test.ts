import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import postgres from "postgres";
import { neonConfig } from "@neondatabase/serverless";

// Uses only a disposable schema and injected provider services, never .env.local.
test("account lifecycle against PostgreSQL", { skip: !process.env.TEST_LIFECYCLE_DATABASE_URL }, async (t) => {
  const schema = "lifecycle_test_" + randomUUID().replaceAll("-", "");
  const pg = postgres(process.env.TEST_LIFECYCLE_DATABASE_URL!, {
    max: 10, connection: { search_path: schema }, onnotice: () => {},
    types: { rawJson: { to: 3802, from: [3802, 114],
      serialize: (value: unknown) => typeof value === "string" ? value : JSON.stringify(value), parse: JSON.parse } },
  });
  (globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage;
  const oldFetch = neonConfig.fetchFunction; const oldGlobalFetch = globalThis.fetch;
  const previousEnv = { ...process.env };
  globalThis.fetch = async () => Response.json({ version: "1.18.0" });
  Object.assign(process.env, { DATABASE_URL: "postgresql://test:test@lifecycle.invalid/test",
    QUADRANT_CLUSTER_ENDPOINT: "https://qdrant.invalid", QUADRANT_API_KEY: "test", RECALL_WEBHOOK_SECRET: "test", RECALL_API_KEY: "test", RECALL_API_REGION: "us-east-1" });
  type HttpQuery = { query: string; params: never[] };
  async function execute(connection: postgres.Sql | postgres.TransactionSql, query: HttpQuery) {
    const options = { prepare: false, simple: false };
    const result = await connection.unsafe(query.query, query.params, options);
    return { fields: result.columns.map((column) => ({ name: column.name, dataTypeID: column.type })),
      rows: result.map((row) => result.columns.map((column) => {
        const value = row[column.name];
        return value === null ? null : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
      })), rowCount: result.count, command: result.command };
  }
  neonConfig.fetchFunction = async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as HttpQuery & { queries?: HttpQuery[] };
    const result = body.queries ? await pg.begin(async (tx) => {
      const results = []; for (const query of body.queries!) results.push(await execute(tx, query));
      return { results };
    }) : await execute(pg, body);
    return Response.json(result);
  };
  try {
    await pg.unsafe('CREATE SCHEMA "' + schema + '"');
    const files = (await readdir(new URL("../lib/db/migrations/", import.meta.url))).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const migration = await readFile(new URL("../lib/db/migrations/" + file, import.meta.url), "utf8");
      await pg.unsafe(migration.replaceAll('"public".', '"' + schema + '".'));
    }
    const repository = await import("../lib/lifecycle/repository");
    const { runCleanupStep } = await import("../lib/lifecycle/cleanup");
    const { meetingAcceptsWrites } = await import("../lib/lifecycle/meeting-access");
    const { registerCreatedMeeting } = await import("../lib/lifecycle/register-meeting");
    const calls: string[] = [];
    let failProvider = false; let failVectors = false;
    const providers: NonNullable<Parameters<typeof runCleanupStep>[2]> = {
      recordings: {
        retrieve: async () => ({ status_changes: [{ code: "done" }], recordings: [{ id: "recording" }] }) as never,
        cancel: async () => {}, leave: async () => {},
        deleteRecording: async (id, account) => { calls.push(account + ":" + id); if (failProvider) throw new Error("provider unavailable"); },
        isHttpError: () => false,
      },
      deleteCalendar: async (id, account) => { calls.push(account + ":calendar:" + id); if (failProvider) throw new Error("provider unavailable"); },
      deleteVectors: async (id) => { calls.push("vectors:" + id); if (failVectors) throw new Error("vector unavailable"); },
      deleteUserVectors: async (id) => { calls.push("user-vectors:" + id); },
      deleteClerkUser: async (id) => { calls.push("clerk:" + id); },
    };
    async function owner() {
      const id = randomUUID();
      await pg`INSERT INTO users (id, email, clerk_user_id) VALUES (${id}, ${id + "@test.invalid"}, ${"user_" + id})`;
      return id;
    }
    async function meeting(userId: string, status = "done") {
      const id = randomUUID();
      await pg`INSERT INTO meetings (id, user_id, recall_bot_id, recall_account, meeting_url, status) VALUES (${id}, ${userId}, ${"bot_" + id}, 'secondary', 'https://meet.google.com/test', ${status})`;
      return id;
    }
    await t.test("ownership, concurrent claims, expired leases, and stale tokens", async () => {
      const user = await owner(); const stranger = await owner(); const id = await meeting(user);
      assert.equal(await repository.requestMeetingDeletion(id, stranger), false);
      assert.equal(await repository.requestMeetingDeletion(id, user), true);
      assert.equal(await meetingAcceptsWrites(id), false);
      const claims = await Promise.all(Array.from({ length: 5 }, () => repository.claimCleanup("meeting", id)));
      assert.equal(claims.filter(Boolean).length, 1); const old = claims.find(Boolean)!;
      await pg`UPDATE meetings SET cleanup_lease_expires_at = now() - interval '1 second' WHERE id = ${id}`;
      const replacement = (await repository.claimCleanup("meeting", id))!;
      assert.notEqual(old.cleanup_lease_token, replacement.cleanup_lease_token);
      await assert.rejects(repository.assertCleanupLease("meeting", old), /revoked/);
      await repository.releaseCleanup("meeting", old, "stale");
      assert.equal((await pg`SELECT cleanup_lease_token FROM meetings WHERE id = ${id}`)[0].cleanup_lease_token, replacement.cleanup_lease_token);
      await repository.releaseCleanup("meeting", replacement, null, 0);
      await pg`UPDATE meetings SET deletion_requested_at = now() - interval '311 seconds' WHERE id = ${id}`;
      await runCleanupStep("meeting", id, providers);
    });
    await t.test("provider/vector failures preserve IDs; retry removes all meeting children", async () => {
      const user = await owner(); const id = await meeting(user);
      await pg`INSERT INTO participants (meeting_id, name) VALUES (${id}, 'Speaker')`;
      await pg`INSERT INTO transcript_chunks (meeting_id, text, start_ms, end_ms) VALUES (${id}, 'Hello', 0, 1000)`;
      await pg`INSERT INTO live_chat_messages (meeting_id, role, text) VALUES (${id}, 'user', 'Question')`;
      await repository.requestMeetingDeletion(id, user);
      await pg`UPDATE meetings SET deletion_requested_at = now() - interval '311 seconds' WHERE id = ${id}`;
      failProvider = true;
      const oldError = console.error; console.error = () => {};
      try {
        assert.equal((await runCleanupStep("meeting", id, providers)).completed, false);
        assert.equal((await pg`SELECT * FROM meetings WHERE id = ${id}`)[0].recall_account, "secondary");
        failProvider = false; failVectors = true;
        await pg`UPDATE meetings SET cleanup_after = now() WHERE id = ${id}`;
        assert.equal((await runCleanupStep("meeting", id, providers)).completed, false);
        assert.ok((await pg`SELECT cleanup_error FROM meetings WHERE id = ${id}`)[0].cleanup_error);
        failVectors = false; await repository.requestMeetingDeletion(id, user);
        assert.equal((await runCleanupStep("meeting", id, providers)).completed, true);
        for (const table of ["meetings", "participants", "transcript_chunks", "live_chat_messages"]) {
          const column = table === "meetings" ? "id" : "meeting_id";
          assert.equal((await pg.unsafe('SELECT count(*) FROM ' + table + ' WHERE ' + column + ' = $1', [id]))[0].count, "0");
        }
      } finally { console.error = oldError; failProvider = false; failVectors = false; }
    });
    await t.test("disconnect preserves completed data and blocks late scheduling", async () => {
      const user = await owner(); const connection = randomUUID(); const done = await meeting(user); const future = await meeting(user, "scheduled");
      await pg`INSERT INTO calendar_connections (id, user_id, provider, email, recall_calendar_id, recall_account, status, auto_record) VALUES (${connection}, ${user}, 'google', 'calendar@test.invalid', 'calendar', 'secondary', 'connected', true)`;
      await pg`UPDATE meetings SET calendar_connection_id = ${connection} WHERE id IN (${done}, ${future})`;
      assert.equal(await repository.requestCalendarDisconnect(connection, await owner()), false);
      assert.equal(await repository.requestCalendarDisconnect(connection, user), true);
      const late = await registerCreatedMeeting(user, { botId: "late_" + randomUUID(), account: "secondary", platform: null, meetingUrl: "https://meet.google.com/test", calendarConnectionId: connection, status: "scheduled" });
      assert.ok(late.deletionRequestedAt);
      await runCleanupStep("calendar", connection, providers);
      const [row] = await pg`SELECT * FROM calendar_connections WHERE id = ${connection}`;
      assert.equal(row.status, "disconnected"); assert.equal(row.auto_record, false);
      assert.equal((await pg`SELECT status FROM meetings WHERE id = ${done}`)[0].status, "done");
      assert.equal((await pg`SELECT status FROM meetings WHERE id = ${future}`)[0].status, "fatal:calendar_disconnected");
    });
    await t.test("retention selects completed expired meetings, excluding active and keep-forever accounts", async () => {
      const user = await owner(); const forever = await owner();
      const old = await meeting(user); const recent = await meeting(user); const active = await meeting(user, "in_call_recording"); const kept = await meeting(forever);
      await pg`UPDATE users SET retention_days = 30 WHERE id = ${user}`;
      await pg`UPDATE meetings SET ended_at = now() - interval '31 days' WHERE id IN (${old}, ${active}, ${kept})`;
      await repository.markExpiredMeetings();
      assert.ok((await pg`SELECT deletion_requested_at FROM meetings WHERE id = ${old}`)[0].deletion_requested_at);
      for (const id of [recent, active, kept]) assert.equal((await pg`SELECT deletion_requested_at FROM meetings WHERE id = ${id}`)[0].deletion_requested_at, null);
    });
    await t.test("account deletion removes Clerk first and retains root until all data is cleaned", async () => {
      const user = await owner(); const id = await meeting(user);
      const connection = randomUUID();
      await pg`INSERT INTO calendar_connections (id, user_id, provider, recall_calendar_id, recall_account, status)
        VALUES (${connection}, ${user}, 'google', 'account-calendar', 'secondary', 'connected')`;
      await pg`INSERT INTO categories (user_id, name) VALUES (${user}, 'Work')`;
      await repository.requestAccountDeletion(user);
      await runCleanupStep("user", user, providers);
      assert.ok(calls.includes("clerk:user_" + user));
      assert.equal(await repository.claimCleanup("user", user), null);
      const late = await registerCreatedMeeting(user, { botId: "late_" + randomUUID(), account: "primary", platform: null, meetingUrl: "https://meet.google.com/test", status: "scheduled" });
      assert.ok(late.deletionRequestedAt);
      await pg`UPDATE meetings SET deletion_requested_at = now() - interval '311 seconds' WHERE id IN (${id}, ${late.id})`;
      await runCleanupStep("calendar", connection, providers);
      await runCleanupStep("meeting", id, providers); await runCleanupStep("meeting", late.id, providers);
      await pg`UPDATE users SET deletion_requested_at = now() - interval '311 seconds' WHERE id = ${user}`;
      assert.equal((await runCleanupStep("user", user, providers)).completed, true);
      assert.equal((await pg`SELECT count(*) FROM users WHERE id = ${user}`)[0].count, "0");
      assert.equal((await pg`SELECT count(*) FROM categories WHERE user_id = ${user}`)[0].count, "0");
      assert.equal((await pg`SELECT count(*) FROM calendar_connections WHERE user_id = ${user}`)[0].count, "0");
      assert.ok(calls.includes("secondary:calendar:account-calendar"));
      assert.ok(calls.includes("user-vectors:" + user));
    });
    await t.test("reconnect replaces the provider calendar, resets auto-record, and enforces ownership", async () => {
      const user = await owner(); const connection = randomUUID();
      await pg`INSERT INTO calendar_connections (id, user_id, provider, email, recall_calendar_id, recall_account, status, auto_record, deletion_requested_at)
        VALUES (${connection}, ${user}, 'google', 'reconnect@test.invalid', 'old-calendar', 'primary', 'disconnected', true, now())`;
      const { upsertCalendarConnection } = await import("../lib/db/calendar-connections");
      await assert.rejects(upsertCalendarConnection(await owner(), "google", "new", "connected", "reconnect@test.invalid", "primary", connection), /not found/);
      await assert.rejects(upsertCalendarConnection(user, "google", "new", "connected", "other@test.invalid", "primary", connection), /same calendar/);
      const previous = globalThis.fetch; globalThis.fetch = async () => new Response(null, { status: 204 });
      try { await upsertCalendarConnection(user, "google", "new-calendar", "connected", "reconnect@test.invalid", "primary", connection); }
      finally { globalThis.fetch = previous; }
      const [row] = await pg`SELECT * FROM calendar_connections WHERE id = ${connection}`;
      assert.equal(row.recall_calendar_id, "new-calendar"); assert.equal(row.auto_record, false); assert.equal(row.deletion_requested_at, null);
    });
    await t.test("recording deletion waits before sweeping vectors created by in-flight requests", async () => {
      const user = await owner(); const id = await meeting(user);
      await repository.requestMeetingDeletion(id, user);
      const result = await runCleanupStep("meeting", id, providers);
      assert.equal(result.completed, false);
      assert.equal(calls.includes("vectors:" + id), false);
      assert.ok((await pg`SELECT cleanup_error FROM meetings WHERE id = ${id}`)[0].cleanup_error.includes("in-flight"));
    });
    await t.test("signed Clerk webhook persists deletion and rejects tampering; cron requires its secret", async () => {
      const { NextRequest } = await import("next/server");
      const { POST } = await import("../app/api/webhooks/clerk/route");
      const { GET } = await import("../app/api/internal/cleanup/route");
      const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
      const secret = "lifecycle-secret";
      process.env.CLERK_WEBHOOK_SIGNING_SECRET = "whsec_" + Buffer.from(secret).toString("base64");
      const user = await owner();
      const body = JSON.stringify({ type: "user.deleted", data: { id: "user_" + user }, object: "event" });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac("sha256", secret).update("event." + timestamp + "." + body).digest("base64");
      const request = (tampered = false) => new NextRequest("https://rika.test/api/webhooks/clerk", { method: "POST",
        body: body + (tampered ? " " : ""), headers: { "svix-id": "event", "svix-timestamp": timestamp, "svix-signature": "v1," + signature } });
      assert.equal((await POST(request(true))).status, 400);
      assert.equal((await pg`SELECT deletion_requested_at FROM users WHERE id = ${user}`)[0].deletion_requested_at, null);
      const tasks: unknown[] = [];
      const store = { afterContext: { after: (task: unknown) => tasks.push(task) } } as unknown as NonNullable<ReturnType<typeof workAsyncStorage.getStore>>;
      assert.equal((await workAsyncStorage.run(store, () => POST(request()))).status, 200);
      assert.ok((await pg`SELECT clerk_deleted_at FROM users WHERE id = ${user}`)[0].clerk_deleted_at);
      assert.equal(tasks.length, 1);
      delete process.env.CRON_SECRET;
      assert.equal((await GET(new Request("https://rika.test/api/internal/cleanup"))).status, 503);
      process.env.CRON_SECRET = "cron-test";
      assert.equal((await GET(new Request("https://rika.test/api/internal/cleanup", { headers: { authorization: "Bearer wrong" } }))).status, 401);
    });
    await t.test("Clerk-initiated deletion is idempotent and processing gets a grace period", async () => {
      const user = await owner(); const id = await meeting(user, "processing");
      await repository.requestAccountDeletion(user, true); await repository.requestAccountDeletion(user, true);
      assert.ok((await pg`SELECT clerk_deleted_at FROM users WHERE id = ${user}`)[0].clerk_deleted_at);
      assert.equal(await repository.claimCleanup("meeting", id), null);
      assert.equal(await meetingAcceptsWrites(id), false);
      assert.equal(await repository.claimCleanup("user", user), null);
    });
  } finally {
    neonConfig.fetchFunction = oldFetch; globalThis.fetch = oldGlobalFetch; process.env = previousEnv;
    await pg.unsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE'); await pg.end();
  }
});
