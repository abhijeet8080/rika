import { eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { calendarConnections } from "@/lib/db/schema";
import { retrieveCalendar } from "@/lib/recall/client";
import { markBotFatal, processCompletedBot } from "@/lib/recall/process-meeting";
import {
  RecallBotWebhookPayloadSchema,
  RecallCalendarWebhookPayloadSchema,
} from "@/lib/recall/types";
import { verifyRecallWebhookSignature } from "@/lib/recall/verify-webhook";

async function syncCalendarStatus(calendarId: string): Promise<void> {
  const calendar = await retrieveCalendar(calendarId);
  await db
    .update(calendarConnections)
    .set({ status: calendar.status })
    .where(eq(calendarConnections.recallCalendarId, calendarId));
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyRecallWebhookSignature(request.headers, rawBody)) {
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }

  const parsed = JSON.parse(rawBody);
  const eventName = typeof parsed.event === "string" ? parsed.event : "";

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
    }
    // calendar.sync_events: nothing to invalidate locally — the calendar
    // page always fetches events live from Recall on load.
  }

  return Response.json({ received: true });
}
