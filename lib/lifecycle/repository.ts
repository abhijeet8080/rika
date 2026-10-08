import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { CleanupKind } from "./policy";

const tables = { user: "users", calendar: "calendar_connections", meeting: "meetings" } as const;
export interface CleanupResource {
  id: string;
  user_id?: string;
  recall_account?: string;
  recall_bot_id?: string;
  recall_calendar_id?: string;
  clerk_user_id?: string | null;
  clerk_deleted_at?: string | null;
  cleanup_lease_token: string;
  deletion_requested_at: string;
}

export async function requestAccountDeletion(userId: string, clerkAlreadyDeleted = false) {
  // Lock the user row across the transactional batch. New resource creation
  // uses that same lock and cannot race account-deletion's child snapshot.
  await db.batch([
    db.execute(sql`UPDATE users SET deletion_requested_at = COALESCE(deletion_requested_at, now()),
      clerk_deleted_at = CASE WHEN ${clerkAlreadyDeleted ? sql`true` : sql`false`} THEN COALESCE(clerk_deleted_at, now()) ELSE clerk_deleted_at END,
      cleanup_after = now() WHERE id = ${userId}::uuid`),
    db.execute(sql`UPDATE calendar_connections SET auto_record = false, status = 'disconnecting',
      deletion_requested_at = COALESCE(deletion_requested_at, now()), cleanup_after = now()
      WHERE user_id = ${userId}::uuid AND status <> 'disconnected'`),
    db.execute(sql`UPDATE meetings SET deletion_requested_at = COALESCE(deletion_requested_at, now()),
      cleanup_after = CASE WHEN status = 'processing' THEN now() + interval '310 seconds' ELSE now() END
      WHERE user_id = ${userId}::uuid AND deletion_requested_at IS NULL`),
  ]);
}

export async function requestCalendarDisconnect(id: string, userId: string): Promise<boolean> {
  const result = await db.execute(sql`UPDATE calendar_connections SET
    auto_record = false, status = 'disconnecting',
    deletion_requested_at = COALESCE(deletion_requested_at, now()), cleanup_after = now()
    WHERE id = ${id}::uuid AND user_id = ${userId}::uuid AND status <> 'disconnected' RETURNING id`);
  return result.rows.length > 0;
}

export async function requestMeetingDeletion(id: string, userId: string): Promise<boolean> {
  const result = await db.execute(sql`UPDATE meetings SET
    cleanup_after = CASE WHEN status = 'processing' THEN now() + interval '310 seconds' ELSE now() END,
    deletion_requested_at = COALESCE(deletion_requested_at, now())
    WHERE id = ${id}::uuid AND user_id = ${userId}::uuid RETURNING id`);
  return result.rows.length > 0;
}

export async function markExpiredMeetings() {
  await db.execute(sql`UPDATE meetings m SET deletion_requested_at = now(), cleanup_after = now()
    FROM users u WHERE m.user_id = u.id AND u.retention_days IS NOT NULL
      AND m.deletion_requested_at IS NULL AND (m.status = 'done' OR m.status LIKE 'fatal%')
      AND COALESCE(m.ended_at, m.created_at) <= now() - u.retention_days * interval '1 day'`);
}

export async function claimCleanup(kind: CleanupKind, id?: string): Promise<CleanupResource | null> {
  const table = sql.identifier(tables[kind]);
  const result = await db.execute(sql`
    WITH candidate AS (
      SELECT r.id FROM ${table} r WHERE r.deletion_requested_at IS NOT NULL AND r.cleanup_after <= now()
        AND (r.cleanup_lease_expires_at IS NULL OR r.cleanup_lease_expires_at <= now())
        ${id ? sql`AND r.id = ${id}::uuid` : sql``}
        ${kind === "calendar" ? sql`AND r.status <> 'disconnected'` : sql``}
        ${kind === "user" ? sql`AND (r.clerk_deleted_at IS NULL OR (
          r.deletion_requested_at <= now() - interval '310 seconds'
          AND NOT EXISTS (SELECT 1 FROM meetings m WHERE m.user_id = r.id)
          AND NOT EXISTS (SELECT 1 FROM calendar_connections c WHERE c.user_id = r.id AND c.status <> 'disconnected')
        ))` : sql``}
      ORDER BY r.cleanup_after, r.deletion_requested_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE ${table} SET cleanup_lease_token = ${randomUUID()}::uuid,
      cleanup_lease_expires_at = now() + interval '10 minutes'
    WHERE id IN (SELECT id FROM candidate) RETURNING *
  `);
  return (result.rows[0] as unknown as CleanupResource | undefined) ?? null;
}

export function ownedCleanup(kind: CleanupKind, resource: CleanupResource) {
  return sql`SELECT id FROM ${sql.identifier(tables[kind])}
    WHERE id = ${resource.id}::uuid AND deletion_requested_at IS NOT NULL
      AND cleanup_lease_token = ${resource.cleanup_lease_token}::uuid AND cleanup_lease_expires_at > now()
    FOR UPDATE`;
}

export async function releaseCleanup(kind: CleanupKind, resource: CleanupResource, message: string | null, delaySeconds = 60) {
  await db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)})
    UPDATE ${sql.identifier(tables[kind])} SET cleanup_lease_token = NULL, cleanup_lease_expires_at = NULL,
      cleanup_error = ${message}, cleanup_after = now() + ${delaySeconds} * interval '1 second'
    WHERE id IN (SELECT id FROM owned)`);
}

export async function assertCleanupLease(kind: CleanupKind, resource: CleanupResource) {
  const result = await db.execute(sql`WITH owned AS (${ownedCleanup(kind, resource)}) SELECT id FROM owned`);
  if (!result.rows.length) throw new Error("Cleanup lease was revoked");
}


// If a failed OAuth save cannot delete its new provider calendar immediately,
// retain that identifier so normal cleanup can retry it.
export async function preserveUnlinkedCalendar(userId: string, provider: string, calendarId: string, account: string) {
  const result = await db.execute(sql`
    WITH owner AS (SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE)
    INSERT INTO calendar_connections (user_id, provider, recall_calendar_id, recall_account, status, deletion_requested_at)
    SELECT id, ${provider}, ${calendarId}, ${account}, 'disconnecting', now() FROM owner RETURNING id
  `);
  if (!result.rows.length) throw new Error("Could not retain orphan calendar for cleanup");
}
