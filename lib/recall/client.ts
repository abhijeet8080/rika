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

// Recall's own defaults capture mixed video but NOT transcript or mixed
// audio — both must be explicitly requested or they come back `null`.
// A function (not a module-level constant) so reading env.APP_BASE_URL
// doesn't happen at import time — same reasoning as the lazy chat model
// in lib/ai/rag.ts.
//
// Transcript and the live-chat webhook are always on — they're what the
// app is for. Video/audio are the user's choice: video_mixed_mp4 has to
// be explicitly nulled out to opt out (it's on by default), while
// audio_mixed_mp3 has to be explicitly added to opt in (it's off by
// default) — asymmetric on Recall's side, not ours.
function getRecordingConfig({
  recordVideo = true,
  recordAudio = true,
}: { recordVideo?: boolean; recordAudio?: boolean } = {}) {
  return {
    ...(recordVideo ? {} : { video_mixed_mp4: null }),
    ...(recordAudio ? { audio_mixed_mp3: {} } : {}),
    transcript: {
      provider: {
        recallai_streaming: {
          mode: "prioritize_accuracy",
          language_code: "auto",
        },
      },
    },
    // Routes live in-meeting chat messages to the same webhook endpoint
    // already registered with Recall (dispatch is by `event` name, see
    // app/api/webhooks/recall/route.ts) — lets someone type "@Rika ..."
    // in the meeting chat and get a category-scoped answer back.
    realtime_endpoints: [
      {
        type: "webhook",
        url: `${env.APP_BASE_URL}/api/webhooks/recall`,
        events: ["participant_events.chat_message"],
      },
    ],
  };
}

function apiUrl(version: "v1" | "v2", path: string) {
  return `https://${env.RECALL_API_REGION}.recall.ai/api/${version}${path}`;
}

async function recallFetch<T>(
  version: "v1" | "v2",
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(version, path), {
    ...init,
    headers: {
      Authorization: `Token ${env.RECALL_API_KEY}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Recall API ${res.status} ${path}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

export async function createBot(params: CreateBotParams): Promise<RecallBot> {
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
        }),
    }),
  });
}

export async function retrieveBot(botId: string): Promise<RecallBot> {
  return recallFetch<RecallBot>("v1", `/bot/${botId}/`);
}

// Only works on a bot that hasn't joined a call yet (405 otherwise) — a
// separate raw fetch from recallFetch since a successful delete returns
// 204 with no body to parse.
export async function cancelScheduledBot(botId: string): Promise<void> {
  const res = await fetch(apiUrl("v1", `/bot/${botId}/`), {
    method: "DELETE",
    headers: { Authorization: `Token ${env.RECALL_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(
      `Recall API ${res.status} DELETE /bot/${botId}/: ${await res.text()}`,
    );
  }
}

// Pulls the bot out of an already-active call — irreversible, per Recall.
export async function removeBotFromCall(botId: string): Promise<void> {
  await recallFetch("v1", `/bot/${botId}/leave_call/`, { method: "POST" });
}

// Causes the bot to post a message into the meeting's chat. Platform
// limits vary (Google Meet: 500 chars, Zoom/Teams: 4096) — callers are
// expected to truncate before calling this.
export async function sendChatMessage(
  botId: string,
  message: string,
): Promise<void> {
  await recallFetch("v1", `/bot/${botId}/send_chat_message/`, {
    method: "POST",
    body: JSON.stringify({ message, to: "everyone" }),
  });
}

export async function createCalendar(
  params: CreateCalendarParams,
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
  });
}

export async function retrieveCalendar(
  calendarId: string,
): Promise<RecallCalendar> {
  return recallFetch<RecallCalendar>("v2", `/calendars/${calendarId}/`);
}

export async function listCalendarEvents(
  calendarId: string,
  query?: ListCalendarEventsQuery,
): Promise<ListCalendarEventsResult> {
  const params = new URLSearchParams({ calendar_id: calendarId });
  if (query?.startTimeGte) params.set("start_time__gte", query.startTimeGte);
  if (query?.updatedAtGte) params.set("updated_at__gte", query.updatedAtGte);
  if (query?.cursor) params.set("cursor", query.cursor);

  return recallFetch<ListCalendarEventsResult>(
    "v2",
    `/calendar-events/?${params.toString()}`,
  );
}

export async function scheduleCalendarBot(
  eventId: string,
  params: ScheduleCalendarBotParams,
): Promise<RecallCalendarEvent> {
  const {
    meetingUrl,
    botName,
    joinAt,
    metadata,
    recordingConfig,
    recordVideo,
    recordAudio,
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
            recordingConfig ?? getRecordingConfig({ recordVideo, recordAudio }),
          ...rest,
        },
      }),
    },
  );
}
