import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { calendarConnections, meetings } from "@/lib/db/schema";
import { listCalendarEvents, retrieveCalendar } from "@/lib/recall/client";
import { handleLiveChatMessage } from "@/lib/recall/live-chat";
import { processLiveTranscript } from "@/lib/recall/live-transcript";
import { markBotFatal, processCompletedBot } from "@/lib/recall/process-meeting";
import { scheduleBotForCalendarEvent } from "@/lib/recall/schedule-event";
import {
  RecallBotWebhookPayloadSchema,
  RecallCalendarWebhookPayloadSchema,
  RecallChatMessageWebhookPayloadSchema,
  RecallRealtimeTranscriptWebhookPayloadSchema,
} from "@/lib/recall/types";
import { getRecallWebhookAccount } from "@/lib/recall/verify-webhook";

// Lifecycle and calendar work runs in after(); finalized transcript events
// persist before acknowledgment so failures can be redelivered. after()
// still runs within this function's own duration budget — processCompletedBot's throttled embedding batches
// (see lib/ai/embeddings.ts) can take a few minutes on a long meeting,
// so this needs real headroom rather than an implicit/short default.
export const maxDuration = 300;

async function syncCalendarStatus(calendarId: string): Promise<void> {
  const [connection] = await db.select().from(calendarConnections)
    .where(eq(calendarConnections.recallCalendarId, calendarId));
  if (!connection) return;
  const calendar = await retrieveCalendar(calendarId, connection.recallAccount);
  await db
    .update(calendarConnections)
    .set({ status: calendar.status })
    .where(eq(calendarConnections.recallCalendarId, calendarId));
}

async function autoScheduleChangedEvents(
  calendarId: string,
  updatedAtGte?: string,
): Promise<void> {
  const [connection] = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.recallCalendarId, calendarId));

  if (!connection || !connection.autoRecord) return;

  const result = await listCalendarEvents(calendarId, { updatedAtGte }, connection.recallAccount);

  for (const event of result.results) {
    if (event.is_deleted || !event.meeting_url || event.bots?.length) {
      continue;
    }
    try {
      await scheduleBotForCalendarEvent(
        connection.userId,
        event.id,
        event.ical_uid,
        { recallAccount: connection.recallAccount },
      );
    } catch (err) {
      console.error(`Failed to auto-schedule event ${event.id}`, err);
    }
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const accountId = getRecallWebhookAccount(request.headers, rawBody);
  if (!accountId) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object") {
    return Response.json({ error: "invalid payload" }, { status: 400 });
  }
  const eventName = typeof parsed.event === "string" ? parsed.event : "";

  // A signature from one account cannot authorize a resource owned by the
  // other. Unknown resources are acknowledged without processing.
  const botId = parsed.data?.bot?.id;
  const calendarId = parsed.data?.calendar_id;
  if (typeof botId === "string") {
    const [meeting] = await db.select({ recallAccount: meetings.recallAccount })
      .from(meetings).where(eq(meetings.recallBotId, botId));
    if (!meeting) return Response.json({ received: true });
    if (meeting.recallAccount !== accountId) {
      return Response.json({ error: "account mismatch" }, { status: 401 });
    }
  } else if (typeof calendarId === "string") {
    const [connection] = await db.select({ recallAccount: calendarConnections.recallAccount })
      .from(calendarConnections).where(eq(calendarConnections.recallCalendarId, calendarId));
    if (!connection) return Response.json({ received: true });
    if (connection.recallAccount !== accountId) {
      return Response.json({ error: "account mismatch" }, { status: 401 });
    }
  }

  if (eventName.startsWith("bot.")) {
    const payload = RecallBotWebhookPayloadSchema.parse(parsed);
    const botId = payload.data.bot.id;

    if (payload.event === "bot.done") {
      after(() =>
        processCompletedBot(botId).catch((err) => {
          console.error(`Failed to process bot ${botId}`, err);
        }),
      );
    } else if (payload.event === "bot.fatal") {
      const subCode = payload.data.data?.sub_code ?? null;
      after(() =>
        markBotFatal(botId, subCode).catch((err) => {
          console.error(`Failed to mark bot ${botId} fatal`, err);
        }),
      );
    }
  } else if (eventName.startsWith("calendar.")) {
    const payload = RecallCalendarWebhookPayloadSchema.parse(parsed);

    if (payload.event === "calendar.update") {
      const calendarId = payload.data.calendar_id;
      after(() =>
        syncCalendarStatus(calendarId).catch((err) => {
          console.error(`Failed to sync calendar ${calendarId}`, err);
        }),
      );
    } else if (payload.event === "calendar.sync_events") {
      const calendarId = payload.data.calendar_id;
      const updatedAtGte = payload.data.last_updated_ts;
      after(() =>
        autoScheduleChangedEvents(calendarId, updatedAtGte).catch((err) => {
          console.error(`Failed to auto-schedule for calendar ${calendarId}`, err);
        }),
      );
    }
  } else if (eventName === "participant_events.chat_message") {
    const payload = RecallChatMessageWebhookPayloadSchema.parse(parsed);
    const botId = payload.data.bot.id;
    const { participant, data } = payload.data.data;
    after(() =>
      handleLiveChatMessage(botId, participant.name, data.text).catch(
        (err) => {
          console.error(`Failed to handle live chat message for bot ${botId}`, err);
        },
      ),
    );
  } else if (eventName === "transcript.data") {
    const payload = RecallRealtimeTranscriptWebhookPayloadSchema.parse(parsed);
    // A finalized utterance is small enough to process before acknowledging.
    // Return failure when persistence fails so redelivery can repair it.
    try {
      await processLiveTranscript(payload);
    } catch (err) {
      console.error("Failed to process live transcript", err);
      return Response.json({ error: "transcript processing failed" }, { status: 503 });
    }
  }

  return Response.json({ received: true });
}
