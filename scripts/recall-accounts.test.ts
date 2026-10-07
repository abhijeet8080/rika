import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { getDefaultRecallAccountId, getRecallAccountChoices } from "../lib/recall/accounts";
import {
  cancelScheduledBot, createBot, createCalendar, listCalendarEvents,
  removeBotFromCall, retrieveBot, retrieveCalendar, scheduleCalendarBot, sendChatMessage,
} from "../lib/recall/client";
import { getRecallWebhookAccount } from "../lib/recall/verify-webhook";

test("Recall account routing and webhook authentication", async (t) => {
  const previousEnv = { ...process.env };
  const previousFetch = globalThis.fetch;
  const primarySecret = Buffer.from("test-primary-secret").toString("base64");
  const secondarySecret = Buffer.from("test-secondary-secret").toString("base64");
  Object.assign(process.env, {
    RECALL_API_KEY: "test-primary-key", RECALL_API_REGION: "us-east-1",
    RECALL_WEBHOOK_SECRET: `whsec_${primarySecret}`,
    RECALL_SECONDARY_API_KEY: "test-secondary-key", RECALL_SECONDARY_API_REGION: "ap-northeast-1",
    RECALL_SECONDARY_WEBHOOK_SECRET: `whsec_${secondarySecret}`,
    RECALL_DEFAULT_ACCOUNT: "secondary", APP_BASE_URL: "https://example.test",
  });
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return init?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ id: "test-id" });
  };
  try {
    await t.test("creation defaults to selected account; old resources still default to primary", async () => {
      await createBot({ meetingUrl: "https://meet.google.com/test" });
      assert.equal(calls.at(-1)?.url, "https://ap-northeast-1.recall.ai/api/v1/bot/");
      assert.equal(new Headers(calls.at(-1)?.init?.headers).get("Authorization"), "Token test-secondary-key");
      const payload = JSON.parse(String(calls.at(-1)?.init?.body));
      assert.equal(payload.recording_config.realtime_endpoints[0].url, "https://example.test/api/webhooks/recall");
      assert.equal(payload.accountId, undefined);
      await retrieveBot("old-bot");
      assert.equal(calls.at(-1)?.url, "https://us-east-1.recall.ai/api/v1/bot/old-bot/");
      await createBot({ meetingUrl: "https://meet.google.com/test" }, "primary");
      assert.equal(new Headers(calls.at(-1)?.init?.headers).get("Authorization"), "Token test-primary-key");
    });
    await t.test("every resource operation uses the chosen key and region", async () => {
      const operations = [
        () => retrieveBot("bot", "secondary"),
        () => cancelScheduledBot("bot", "secondary"),
        () => removeBotFromCall("bot", "secondary"),
        () => sendChatMessage("bot", "hello", "secondary"),
        () => createCalendar({ platform: "google_calendar", oauthClientId: "client", oauthRefreshToken: "refresh" }),
        () => retrieveCalendar("calendar", "secondary"),
        () => listCalendarEvents("calendar", { cursor: "next" }, "secondary"),
        () => scheduleCalendarBot("event", { deduplicationKey: "ical", botConfig: { botName: "RIKA" } }, "secondary"),
      ];
      for (const operation of operations) {
        await operation();
        const call = calls.at(-1)!;
        assert.ok(call.url.startsWith("https://ap-northeast-1.recall.ai/"));
        assert.equal(new Headers(call.init?.headers).get("Authorization"), "Token test-secondary-key");
      }
    });
    await t.test("API errors do not retry using the other account", async () => {
      let attempts = 0;
      const mockFetch = globalThis.fetch;
      globalThis.fetch = async () => { attempts++; return new Response("quota exhausted", { status: 403 }); };
      try {
        await assert.rejects(createBot({ meetingUrl: "https://meet.google.com/test" }), /403/);
        assert.equal(attempts, 1);
      } finally { globalThis.fetch = mockFetch; }
    });
    await t.test("signatures identify the sending account and reject tampered messages", () => {
      const body = JSON.stringify({ event: "bot.done", data: { bot: { id: "bot" } } });
      function signed(secret: string) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const sig = createHmac("sha256", Buffer.from(secret, "base64")).update(`id.${timestamp}.${body}`).digest("base64");
        return new Headers({ "webhook-id": "id", "webhook-timestamp": timestamp, "webhook-signature": `v1,${sig}` });
      }
      assert.equal(getRecallWebhookAccount(signed(primarySecret), body), "primary");
      assert.equal(getRecallWebhookAccount(signed(secondarySecret), body), "secondary");
      assert.equal(getRecallWebhookAccount(signed(secondarySecret), body + " "), null);
      assert.equal(getRecallWebhookAccount(new Headers(), body), null);
      const rotated = signed(secondarySecret);
      rotated.set("webhook-signature", `v1,invalid ${rotated.get("webhook-signature")}`);
      assert.equal(getRecallWebhookAccount(rotated, body), "secondary");
    });
    await t.test("single-account configuration remains supported; invalid defaults fail closed", () => {
      assert.deepEqual(getRecallAccountChoices(), ["primary", "secondary"]);
      delete process.env.RECALL_SECONDARY_API_KEY;
      process.env.RECALL_DEFAULT_ACCOUNT = "primary";
      assert.deepEqual(getRecallAccountChoices(), ["primary"]);
      assert.equal(getDefaultRecallAccountId(), "primary");
      process.env.RECALL_DEFAULT_ACCOUNT = "secondary";
      assert.throws(getDefaultRecallAccountId, /requires/);
      process.env.RECALL_DEFAULT_ACCOUNT = "unknown";
      assert.throws(getDefaultRecallAccountId, /Unknown/);
    });
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
  }
});
