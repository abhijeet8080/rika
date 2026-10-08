import { getCurrentUserId } from "@/lib/auth";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { calendarConnections } from "@/lib/db/schema";
import { listCalendarEvents } from "@/lib/recall/client";
import { rateLimit } from "@/lib/rate-limit";
import { scheduleBotForCalendarEvent } from "@/lib/recall/schedule-event";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/calendar/events/[id]/schedule">,
) {
  const { id } = await params;
  const { icalUid, categoryId, recordVideo, recordAudio, calendarConnectionId } = await request.json();

  if (!icalUid || typeof icalUid !== "string") {
    return Response.json({ error: "icalUid is required" }, { status: 400 });
  }
  if (categoryId !== undefined && categoryId !== null && typeof categoryId !== "string") {
    return Response.json(
      { error: "categoryId must be a string or null" },
      { status: 400 },
    );
  }
  if (recordVideo !== undefined && typeof recordVideo !== "boolean") {
    return Response.json({ error: "recordVideo must be a boolean" }, { status: 400 });
  }
  if (recordAudio !== undefined && typeof recordAudio !== "boolean") {
    return Response.json({ error: "recordAudio must be a boolean" }, { status: 400 });
  }

  const userId = await getCurrentUserId();

  const limited = await rateLimit("bots", userId);
  if (limited) return limited;

  try {
    if (calendarConnectionId !== undefined && typeof calendarConnectionId !== "string") {
      return Response.json({ error: "calendarConnectionId must be a string" }, { status: 400 });
    }
    const connections = await db.select().from(calendarConnections).where(
      and(eq(calendarConnections.userId, userId), eq(calendarConnections.status, "connected"), isNull(calendarConnections.deletionRequestedAt),
        calendarConnectionId ? eq(calendarConnections.id, calendarConnectionId) : undefined),
    );
    // Resolve ownership using server-held calendar connections. Never trust
    // a client-supplied account or event id to choose another user's bot.
    for (const connection of connections) {
      let cursor: string | undefined;
      do {
        const page = await listCalendarEvents(connection.recallCalendarId, { cursor }, connection.recallAccount);
        const event = page.results.find((event) => event.id === id && event.calendar_id === connection.recallCalendarId);
        if (event) {
          if (event.is_deleted || !event.meeting_url) {
            return Response.json({ error: "Event has no available meeting" }, { status: 400 });
          }
          const meeting = await scheduleBotForCalendarEvent(userId, id, event.ical_uid, {
            categoryId, recordVideo, recordAudio, recallAccount: connection.recallAccount, calendarConnectionId: connection.id,
          });
          return Response.json({ meeting }, { status: 201 });
        }
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
    }
    return Response.json({ error: "Calendar event not found" }, { status: 404 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to schedule bot" },
      { status: 502 },
    );
  }
}
