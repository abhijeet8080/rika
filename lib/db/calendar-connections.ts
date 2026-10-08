import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { calendarConnections } from "@/lib/db/schema";
import { deleteCalendar } from "@/lib/recall/client";

export async function upsertCalendarConnection(
  userId: string, provider: string, recallCalendarId: string, status: string,
  email?: string, recallAccount = "primary", targetConnectionId?: string,
): Promise<void> {
  const existing = targetConnectionId || email ? (await db.select().from(calendarConnections).where(and(
    eq(calendarConnections.userId, userId), eq(calendarConnections.provider, provider), eq(calendarConnections.recallAccount, recallAccount),
    targetConnectionId ? eq(calendarConnections.id, targetConnectionId) : eq(calendarConnections.email, email!),
  )))[0] : undefined;
  if (targetConnectionId && !existing) throw new Error("Calendar connection not found");
  if (existing?.status === "disconnecting") throw new Error("Wait for disconnection to finish before reconnecting");
  if (targetConnectionId && existing?.email && email !== existing.email) {
    throw new Error(`Choose the same calendar account when reconnecting`);
  }
  // A replacement calendar must not leave the old OAuth connection syncing.
  // A failed deletion leaves the existing row intact and the caller cleans
  // up the newly created provider calendar.
  if (existing && existing.recallCalendarId !== recallCalendarId) await deleteCalendar(existing.recallCalendarId, existing.recallAccount);
  const result = existing ? await db.execute(sql`
    WITH active AS (SELECT id FROM users WHERE id = ${userId}::uuid AND deletion_requested_at IS NULL FOR UPDATE)
    UPDATE calendar_connections SET recall_calendar_id = ${recallCalendarId}, status = ${status},
      auto_record = false, deletion_requested_at = NULL, cleanup_error = NULL,
      cleanup_lease_token = NULL, cleanup_lease_expires_at = NULL
    WHERE id = ${existing.id}::uuid AND recall_calendar_id = ${existing.recallCalendarId}
      AND status <> 'disconnecting' AND user_id IN (SELECT id FROM active) RETURNING id
  `) : await db.execute(sql`
    WITH active AS (SELECT id FROM users WHERE id = ${userId}::uuid AND deletion_requested_at IS NULL FOR UPDATE)
    INSERT INTO calendar_connections (user_id, provider, recall_calendar_id, status, email, recall_account)
    SELECT id, ${provider}, ${recallCalendarId}, ${status}, ${email ?? null}, ${recallAccount} FROM active
    RETURNING id
  `);
  if (!result.rows.length) throw new Error("Account or calendar changed while connecting. Please try again");
}
