import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { calendarConnections, categories, meetings, users } from "@/lib/db/schema";
import { cancelScheduledBot, RecallApiError, removeBotFromCall } from "@/lib/recall/client";

export async function meetingCreationAccount(userId: string, connectionId?: string, categoryId?: string | null) {
  const [user] = await db.select({ retentionDays: users.retentionDays }).from(users)
    .where(and(eq(users.id, userId), isNull(users.deletionRequestedAt)));
  if (!user) throw new Error("Account deletion is in progress");
  if (connectionId) {
    const [connection] = await db.select({ id: calendarConnections.id }).from(calendarConnections).where(and(
      eq(calendarConnections.id, connectionId), eq(calendarConnections.userId, userId),
      eq(calendarConnections.status, "connected"), isNull(calendarConnections.deletionRequestedAt),
    ));
    if (!connection) throw new Error("Calendar is not connected");
  }
  if (categoryId) {
    const [category] = await db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
    if (!category) throw new Error("Category not found");
  }
  return user;
}

interface NewMeeting {
  botId: string; account: string; title?: string | null; categoryId?: string | null;
  platform: string | null; meetingUrl: string; calendarEventId?: string;
  calendarConnectionId?: string; scheduledStart?: Date; status: string;
}

export async function registerCreatedMeeting(userId: string, meeting: NewMeeting) {
  // Preserve late bot creations as deletion tombstones. The account cleanup
  // finalizer waits for in-flight requests, so their provider IDs remain
  // reachable even if deletion/disconnection began during the Recall request.
  const connection = meeting.calendarConnectionId ? sql`AND EXISTS (SELECT 1 FROM calendar_connections c
    WHERE c.id = ${meeting.calendarConnectionId}::uuid AND c.user_id = ${userId}::uuid
      AND c.status = 'connected' AND c.deletion_requested_at IS NULL FOR UPDATE)` : sql``;
  const result = await db.execute(sql`
    WITH owner AS (SELECT id, deletion_requested_at FROM users WHERE id = ${userId}::uuid FOR UPDATE),
    state AS (SELECT id, deletion_requested_at IS NULL ${connection} AS active FROM owner)
    INSERT INTO meetings (user_id, recall_bot_id, recall_account, title, category_id, platform, meeting_url,
      calendar_event_id, calendar_connection_id, scheduled_start, status, deletion_requested_at)
    SELECT id, ${meeting.botId}, ${meeting.account}, ${meeting.title ?? null},
      (SELECT id FROM categories WHERE id = ${meeting.categoryId ?? null}::uuid AND user_id = ${userId}::uuid),
      ${meeting.platform}, ${meeting.meetingUrl}, ${meeting.calendarEventId ?? null},
      ${meeting.calendarConnectionId ?? null}::uuid, ${meeting.scheduledStart?.toISOString() ?? null}::timestamptz,
      ${meeting.status}, CASE WHEN active THEN NULL ELSE now() END FROM state
    ON CONFLICT (recall_bot_id) DO UPDATE SET
      title = EXCLUDED.title, scheduled_start = EXCLUDED.scheduled_start,
      category_id = COALESCE(EXCLUDED.category_id, meetings.category_id)
    WHERE meetings.user_id = EXCLUDED.user_id AND meetings.deletion_requested_at IS NULL
      AND EXCLUDED.deletion_requested_at IS NULL AND meetings.status = 'scheduled'
    RETURNING id
  `);
  const id = result.rows[0]?.id;
  const [saved] = await db.select().from(meetings).where(and(
    id ? eq(meetings.id, String(id)) : eq(meetings.recallBotId, meeting.botId), eq(meetings.userId, userId),
  ));
  if (saved) return saved;
  // The owning row can only disappear after its cleanup grace period. If a
  // request outlives it, compensate instead of leaving an untracked bot.
  try { await cancelScheduledBot(meeting.botId, meeting.account); }
  catch (error) {
    if (!(error instanceof RecallApiError && error.status === 405)) throw error;
    await removeBotFromCall(meeting.botId, meeting.account);
  }
  throw new Error("Account was removed while creating the meeting");
}
