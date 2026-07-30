import { eq } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { calendarConnections } from "@/lib/db/schema";
import { listCalendarEvents } from "@/lib/recall/client";
import type { RecallCalendarEvent } from "@/lib/recall/types";

export async function GET() {
  const userId = await getCurrentUserId();

  const connections = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId));

  if (connections.length === 0) {
    return Response.json({ error: "No calendar connected" }, { status: 404 });
  }

  const perConnectionEvents = await Promise.all(
    connections.map(async (connection) => {
      const result = await listCalendarEvents(connection.recallCalendarId, {
        startTimeGte: new Date().toISOString(),
      });
      return result.results.map((event) => ({
        ...event,
        provider: connection.provider,
        accountEmail: connection.email,
      }));
    }),
  );

  const events = (
    perConnectionEvents.flat() as (RecallCalendarEvent & {
      provider: string;
      accountEmail: string | null;
    })[]
  ).sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
  );

  return Response.json({ events });
}
