import { and, eq } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { calendarConnections } from "@/lib/db/schema";
import { listCalendarEvents } from "@/lib/recall/client";

export async function GET() {
  const userId = await getCurrentUserId();

  const [connection] = await db
    .select()
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.userId, userId),
        eq(calendarConnections.provider, "google"),
      ),
    );

  if (!connection) {
    return Response.json({ error: "No calendar connected" }, { status: 404 });
  }

  const result = await listCalendarEvents(connection.recallCalendarId, {
    startTimeGte: new Date().toISOString(),
  });

  return Response.json({ events: result.results });
}
