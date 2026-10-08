import assert from "node:assert/strict";
import { test } from "node:test";
import { CleanupDeferred, deleteMeetingRecordings, RetentionSchema, type RecordingCleaner } from "../lib/lifecycle/policy";
import { RecallApiError, createBot, deleteCalendar, deleteRecording } from "../lib/recall/client";
import { isSameOrigin } from "../lib/lifecycle/request-origin";

test("retention accepts only documented choices", () => {
  for (const value of [null, 30, 90, 180, 365]) assert.ok(RetentionSchema.safeParse(value).success);
  for (const value of [undefined, 0, -1, 7, 30.5, "30", {}, true]) assert.equal(RetentionSchema.safeParse(value).success, false);
});
test("destructive browser requests require the exact origin", () => {
  for (const origin of ["https://evil.test", "null", "https://rika.test.evil.test"]) {
    assert.equal(isSameOrigin(new Request("https://rika.test/api/account", { headers: { origin } })), false);
  }
  assert.equal(isSameOrigin(new Request("https://rika.test/api/account")), false);
  assert.equal(isSameOrigin(new Request("https://rika.test/api/account", { headers: { origin: "https://rika.test" } })), true);
});
test("recording cleanup checks provider state and deletes every recording in its account", async () => {
  const calls: string[] = [];
  const cleaner: RecordingCleaner = {
    retrieve: async () => ({ status_changes: [{ code: "done" }], recordings: [{ id: "a" }, { id: "b" }] }) as never,
    cancel: async () => { calls.push("cancel"); }, leave: async () => { calls.push("leave"); },
    deleteRecording: async (id, account) => { calls.push(account + ":" + id); },
    isHttpError: (error, status) => error instanceof RecallApiError && error.status === status,
  };
  await deleteMeetingRecordings("bot", "secondary", cleaner);
  assert.deepEqual(calls, ["secondary:a", "secondary:b"]);
  calls.length = 0;
  cleaner.retrieve = async () => ({ status_changes: [{ code: "joining_call" }] }) as never;
  await deleteMeetingRecordings("bot", "secondary", cleaner);
  assert.deepEqual(calls, ["cancel"]);
  calls.length = 0;
  cleaner.cancel = async () => { throw new RecallApiError(405, "/bot", "dispatched"); };
  await assert.rejects(deleteMeetingRecordings("bot", "primary", cleaner), CleanupDeferred);
  assert.deepEqual(calls, ["leave"]);
  cleaner.cancel = async () => { throw new RecallApiError(401, "/bot", "invalid key"); };
  calls.length = 0;
  await assert.rejects(deleteMeetingRecordings("bot", "primary", cleaner), /invalid key/);
  assert.deepEqual(calls, []);
  cleaner.retrieve = async () => { throw new RecallApiError(404, "/bot", "gone"); };
  await deleteMeetingRecordings("bot", "primary", cleaner);
});
test("provider deletes are idempotent only for 404, and retention is sent to Recall", async () => {
  const oldFetch = globalThis.fetch; const oldEnv = { ...process.env };
  Object.assign(process.env, { RECALL_WEBHOOK_SECRET: "test", RECALL_API_KEY: "test", RECALL_API_REGION: "us-east-1", APP_BASE_URL: "https://rika.test" });
  delete process.env.RECALL_DEFAULT_ACCOUNT;
  try {
    let status = 404;
    globalThis.fetch = async () => new Response("missing", { status });
    await deleteCalendar("calendar"); await deleteRecording("recording");
    status = 401;
    await assert.rejects(deleteRecording("recording"), /401/);
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = async (_input, init) => { bodies.push(JSON.parse(String(init?.body))); return Response.json({ id: "bot" }); };
    await createBot({ meetingUrl: "https://meet.google.com/test", retentionDays: 30 });
    assert.deepEqual((bodies[0].recording_config as Record<string, unknown>).retention, { type: "timed", hours: 720 });
    await createBot({ meetingUrl: "https://meet.google.com/test", retentionDays: null });
    assert.deepEqual((bodies[1].recording_config as Record<string, unknown>).retention, { type: "forever" });
  } finally { globalThis.fetch = oldFetch; process.env = oldEnv; }
});
