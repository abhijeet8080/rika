import { getRecallAccount, getDefaultRecallAccountId } from "./accounts";
import { env } from "@/lib/env";
import type {
  CreateBotParams,
  CreateCalendarParams,
  ListCalendarEventsQuery,
  ListCalendarEventsResult,
  RecallBot,
  RecallCalendar,
  RecallCalendarEvent,
  ScheduleCalendarBotParams,
} from "./types";

// A function (not a module-level constant) so reading env.APP_BASE_URL
// doesn't happen at import time — same reasoning as the lazy chat model
// in lib/ai/rag.ts.
//
// Transcript and the live-chat webhook are always on — they're what the
// app is for. Video/audio are the user's choice, and both are requested
// explicitly rather than relying on Recall's documented "video_mixed_mp4
// is on by default when omitted" — confirmed live on a Microsoft Teams
// bot that video came back null with the key omitted (audio + transcript
// both came through fine on the same bot), so the default isn't
// consistent across platforms. Explicit on every bot avoids depending on
// per-platform default behavior we can't fully verify.
function getRecordingConfig({
  recordVideo = true,
  recordAudio = true,
  retentionDays,
}: { recordVideo?: boolean; recordAudio?: boolean; retentionDays?: number | null } = {}) {
  return {
    ...(retentionDays !== undefined ? { retention: retentionDays === null ? { type: "forever" } : { type: "timed", hours: retentionDays * 24 } } : {}),
    ...(recordVideo ? { video_mixed_mp4: {} } : { video_mixed_mp4: null }),
    ...(recordAudio ? { audio_mixed_mp3: {} } : {}),
    transcript: {
      provider: {
        recallai_streaming: {
          // Finalized utterances are delivered through transcript.data as
          // the call happens, so low latency is required for @Rika to use
          // the current discussion rather than only completed meetings.
          mode: "prioritize_low_latency",
          language_code: "auto",
        },
      },
    },
    // Routes live in-meeting chat and finalized transcript utterances to the
    // same webhook endpoint. Partial utterances are deliberately omitted:
    // they are revised repeatedly and are not reliable RAG evidence.
    // already registered with Recall (dispatch is by `event` name, see
    // app/api/webhooks/recall/route.ts) — lets someone type "@Rika ..."
    // in the meeting chat and get a category-scoped answer back.
    realtime_endpoints: [
      {
        type: "webhook",
        url: `${env.APP_BASE_URL}/api/webhooks/recall`,
        events: ["participant_events.chat_message", "transcript.data"],
      },
    ],
  };
}

// Top-level bot-creation field (sibling to recording_config, not nested
// in it). Explicit and complete rather than a partial override — after
// getting burned by video_mixed_mp4's inconsistent "on when omitted"
// behavior, not assuming a partial automatic_leave object leaves the
// rest at Recall's defaults rather than resetting them. Every value
// below except bot_detection's timeouts is Recall's own confirmed
// default (read back live from a real bot that had no automatic_leave
// sent at all).
//
// bot_detection is shortened from Recall's default (~12 min: 120s
// activate_after + 600s timeout) to ~90s — that default only became a
// real problem for us because our own bot_name ("RIKA"
// Assistant)") matches the built-in using_participant_names pattern, so
// two Rika bots in the same call (see findActiveMeetingForUrl, which
// should prevent that going forward) would otherwise keep each other
// "company" for up to 12 minutes after every human left instead of
// leaving quickly.
function getAutomaticLeaveConfig() {
  return {
    waiting_room_timeout: 1200,
    noone_joined_timeout: 1200,
    everyone_left_timeout: { timeout: 2, activate_after: null },
    in_call_not_recording_timeout: 3600,
    recording_permission_denied_timeout: 30,
    silence_detection: { timeout: 3600, activate_after: 1200 },
    bot_detection: {
      using_participant_events: { timeout: 60, activate_after: 30 },
      using_participant_names: {
        timeout: 60,
        activate_after: 30,
        matches: ["notetaker", "recorder", "assistant"],
      },
    },
  };
}

function apiUrl(version: "v1" | "v2", path: string, accountId: string) {
  return `https://${getRecallAccount(accountId).region}.recall.ai/api/${version}${path}`;
}

async function recallFetch<T>(
  version: "v1" | "v2",
  path: string,
  init?: RequestInit,
  accountId = "primary",
): Promise<T> {
  const res = await fetch(apiUrl(version, path, accountId), {
    signal: AbortSignal.timeout(20_000),
    ...init,
    headers: {
      Authorization: `Token ${getRecallAccount(accountId).apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new RecallApiError(res.status, path, await res.text());
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class RecallApiError extends Error {
  constructor(public readonly status: number, path: string, detail: string) {
    super(`Recall API ${status} ${path}: ${detail}`);
  }
}

async function recallDelete(version: "v1" | "v2", path: string, accountId: string) {
  try { await recallFetch<void>(version, path, { method: "DELETE" }, accountId); }
  catch (error) { if (!(error instanceof RecallApiError && error.status === 404)) throw error; }
}

export async function deleteCalendar(calendarId: string, accountId = "primary") {
  await recallDelete("v2", `/calendars/${calendarId}/`, accountId);
}

export async function deleteRecording(recordingId: string, accountId = "primary") {
  await recallDelete("v1", `/recording/${recordingId}/`, accountId);
}

export async function createBot(params: CreateBotParams, accountId = getDefaultRecallAccountId()): Promise<RecallBot> {
  return recallFetch<RecallBot>("v1", "/bot/", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: params.meetingUrl,
      bot_name: params.botName,
      join_at: params.joinAt,
      metadata: params.metadata,
      recording_config:
        params.recordingConfig ??
        getRecordingConfig({
          recordVideo: params.recordVideo,
          recordAudio: params.recordAudio,
          retentionDays: params.retentionDays,
        }),
      automatic_leave: getAutomaticLeaveConfig(),
    }),
  }, accountId);
}

export async function retrieveBot(botId: string, accountId = "primary"): Promise<RecallBot> {
  return recallFetch<RecallBot>("v1", `/bot/${botId}/`, undefined, accountId);
}

// Only works on a bot that hasn't joined a call yet (405 otherwise) — a
// The shared delete helper handles empty 204 responses and missing bots.
export async function cancelScheduledBot(botId: string, accountId = "primary"): Promise<void> {
  await recallDelete("v1", `/bot/${botId}/`, accountId);
}

// Pulls the bot out of an already-active call — irreversible, per Recall.
export async function removeBotFromCall(botId: string, accountId = "primary"): Promise<void> {
  await recallFetch("v1", `/bot/${botId}/leave_call/`, { method: "POST" }, accountId);
}

// Causes the bot to post a message into the meeting's chat. Platform
// limits vary (Google Meet: 500 chars, Zoom/Teams: 4096) — callers are
// expected to truncate before calling this.
export async function sendChatMessage(
  botId: string,
  message: string,
  accountId = "primary",
): Promise<void> {
  await recallFetch("v1", `/bot/${botId}/send_chat_message/`, {
    method: "POST",
    body: JSON.stringify({ message, to: "everyone" }),
  }, accountId);
}

export async function createCalendar(
  params: CreateCalendarParams,
  accountId = getDefaultRecallAccountId(),
): Promise<RecallCalendar> {
  return recallFetch<RecallCalendar>("v2", "/calendars/", {
    method: "POST",
    body: JSON.stringify({
      platform: params.platform,
      oauth_client_id: params.oauthClientId,
      oauth_client_secret: params.oauthClientSecret,
      oauth_refresh_token: params.oauthRefreshToken,
      oauth_email: params.oauthEmail,
    }),
  }, accountId);
}

export async function retrieveCalendar(
  calendarId: string,
  accountId = "primary",
): Promise<RecallCalendar> {
  return recallFetch<RecallCalendar>("v2", `/calendars/${calendarId}/`, undefined, accountId);
}

export async function listCalendarEvents(
  calendarId: string,
  query?: ListCalendarEventsQuery,
  accountId = "primary",
): Promise<ListCalendarEventsResult> {
  const params = new URLSearchParams({ calendar_id: calendarId });
  if (query?.startTimeGte) params.set("start_time__gte", query.startTimeGte);
  if (query?.updatedAtGte) params.set("updated_at__gte", query.updatedAtGte);
  if (query?.cursor) params.set("cursor", query.cursor);

  return recallFetch<ListCalendarEventsResult>(
    "v2",
    `/calendar-events/?${params.toString()}`,
    undefined,
    accountId,
  );
}

export async function scheduleCalendarBot(
  eventId: string,
  params: ScheduleCalendarBotParams,
  accountId = "primary",
): Promise<RecallCalendarEvent> {
  const {
    meetingUrl,
    botName,
    joinAt,
    metadata,
    recordingConfig,
    recordVideo,
    recordAudio,
    retentionDays,
    ...rest
  } = params.botConfig;

  return recallFetch<RecallCalendarEvent>(
    "v2",
    `/calendar-events/${eventId}/bot/`,
    {
      method: "POST",
      body: JSON.stringify({
        deduplication_key: params.deduplicationKey,
        bot_config: {
          meeting_url: meetingUrl,
          bot_name: botName,
          join_at: joinAt,
          metadata,
          recording_config:
            recordingConfig ?? getRecordingConfig({ recordVideo, recordAudio, retentionDays }),
          automatic_leave: getAutomaticLeaveConfig(),
          ...rest,
        },
      }),
    },
    accountId,
  );
}
