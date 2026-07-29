import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { meetings } from "@/lib/db/schema";
import { scheduleCalendarBot } from "@/lib/recall/client";
import { detectPlatform } from "@/lib/recall/platform";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/calendar/events/[id]/schedule">,
) {
  const { id } = await params;
  const { icalUid } = await request.json();

  if (!icalUid || typeof icalUid !== "string") {
    return Response.json({ error: "icalUid is required" }, { status: 400 });
  }

  const event = await scheduleCalendarBot(id, {
    deduplicationKey: icalUid,
    botConfig: { botName: "Rika" },
  });

  if (!event.bot_id) {
    return Response.json(
      { error: "Recall did not return a bot id for this event" },
      { status: 502 },
    );
  }

  // event.meeting_url's real shape is unconfirmed until tested against a
  // live connected calendar — guard rather than assume.
  const meetingUrl = typeof event.meeting_url === "string" ? event.meeting_url : "";
  const userId = await getCurrentUserId();

  const [meeting] = await db
    .insert(meetings)
    .values({
      userId,
      recallBotId: event.bot_id,
      platform: meetingUrl ? detectPlatform(meetingUrl) : null,
      meetingUrl,
      calendarEventId: event.id,
      scheduledStart: new Date(event.start_time),
      status: "scheduled",
    })
    .onConflictDoUpdate({
      target: meetings.recallBotId,
      set: { status: "scheduled", scheduledStart: new Date(event.start_time) },
    })
    .returning();

  return Response.json({ meeting }, { status: 201 });
}
