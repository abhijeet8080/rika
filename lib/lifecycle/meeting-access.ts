import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export async function meetingAcceptsWrites(meetingId: string): Promise<boolean> {
  const result = await db.execute(sql`SELECT m.id FROM meetings m JOIN users u ON u.id = m.user_id
    WHERE m.id = ${meetingId}::uuid AND m.deletion_requested_at IS NULL AND u.deletion_requested_at IS NULL`);
  return result.rows.length > 0;
}

export function writableMeeting(meetingId: string) {
  return sql`SELECT m.id FROM meetings m JOIN users u ON u.id = m.user_id
    WHERE m.id = ${meetingId}::uuid AND m.deletion_requested_at IS NULL AND u.deletion_requested_at IS NULL
    FOR UPDATE OF m, u`;
}
