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
const DEFAULT_RECORDING_CONFIG = {
  audio_mixed_mp3: {},
  transcript: {
    provider: {
      recallai_streaming: {
        mode: "prioritize_accuracy",
        language_code: "auto",
      },
    },
  },
};

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
      recording_config: params.recordingConfig ?? DEFAULT_RECORDING_CONFIG,
    }),
  });
}

export async function retrieveBot(botId: string): Promise<RecallBot> {
  return recallFetch<RecallBot>("v1", `/bot/${botId}/`);
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
  const { meetingUrl, botName, joinAt, metadata, recordingConfig, ...rest } =
    params.botConfig;

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
          recording_config: recordingConfig ?? DEFAULT_RECORDING_CONFIG,
          ...rest,
        },
      }),
    },
  );
}
