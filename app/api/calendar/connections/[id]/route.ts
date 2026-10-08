import { and, eq, isNull } from "drizzle-orm";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { calendarConnections } from "@/lib/db/schema";
import { listCalendarEvents } from "@/lib/recall/client";
import { scheduleBotForCalendarEvent } from "@/lib/recall/schedule-event";
import { requestCalendarDisconnect } from "@/lib/lifecycle/repository";
import { runCleanupStep } from "@/lib/lifecycle/cleanup";
import { isSameOrigin } from "@/lib/lifecycle/request-origin";
import { z } from "zod";

export const maxDuration = 300;

export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/calendar/connections/[id]">,
) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Connection not found" }, { status: 404 });
  const { autoRecord } = await request.json();

  if (typeof autoRecord !== "boolean") {
    return Response.json(
      { error: "autoRecord must be a boolean" },
      { status: 400 },
    );
  }

  const userId = await getCurrentUserId();

  const [connection] = await db
    .select()
    .from(calendarConnections)
    .where(
      and(
        eq(calendarConnections.id, id),
        eq(calendarConnections.userId, userId),
      ),
    );

  if (!connection) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }
  if (connection.status !== "connected" || connection.deletionRequestedAt) {
    return Response.json({ error: "Reconnect this calendar before enabling recording" }, { status: 409 });
  }

  const updated = await db
    .update(calendarConnections)
    .set({ autoRecord })
    .where(and(eq(calendarConnections.id, id), eq(calendarConnections.status, "connected"), isNull(calendarConnections.deletionRequestedAt))).returning({ id: calendarConnections.id });
  if (!updated.length) return Response.json({ error: "Calendar disconnected" }, { status: 409 });

  // Turning it on should also cover what's already on the calendar, not
  // just events changed from this point forward (that part is handled by
  // the calendar.sync_events webhook).
  let scheduled = 0;
  let failed = 0;

  if (autoRecord) {
    const result = await listCalendarEvents(connection.recallCalendarId, {
      startTimeGte: new Date().toISOString(),
    }, connection.recallAccount);

    for (const event of result.results) {
      if (event.is_deleted || !event.meeting_url || event.bots?.length) {
        continue;
      }
      try {
        await scheduleBotForCalendarEvent(userId, event.id, event.ical_uid, { recallAccount: connection.recallAccount, calendarConnectionId: connection.id });
        scheduled++;
      } catch (err) {
        console.error(`Failed to auto-schedule event ${event.id}`, err);
        failed++;
      }
    }
  }

  return Response.json({ autoRecord, scheduled, failed });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const userId = await getCurrentUserId();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Connection not found" }, { status: 404 });
  const [connection] = await db.select().from(calendarConnections)
    .where(and(eq(calendarConnections.id, id), eq(calendarConnections.userId, userId)));
  if (!connection) return Response.json({ error: "Connection not found" }, { status: 404 });
  if (connection.status === "disconnected") return Response.json({ disconnected: true });
  await requestCalendarDisconnect(id, userId);
  after(async () => { await runCleanupStep("calendar", id); });
  return Response.json({ disconnectRequested: true }, { status: 202 });
}
