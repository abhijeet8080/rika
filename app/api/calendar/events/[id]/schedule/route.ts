import { getCurrentUserId } from "@/lib/auth";
import { scheduleBotForCalendarEvent } from "@/lib/recall/schedule-event";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/calendar/events/[id]/schedule">,
) {
  const { id } = await params;
  const { icalUid } = await request.json();

  if (!icalUid || typeof icalUid !== "string") {
    return Response.json({ error: "icalUid is required" }, { status: 400 });
  }

  const userId = await getCurrentUserId();

  try {
    const meeting = await scheduleBotForCalendarEvent(userId, id, icalUid);
    return Response.json({ meeting }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to schedule bot" },
      { status: 502 },
    );
  }
}
