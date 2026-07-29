import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

// Single-user placeholder for Phase 1 — replaced by real session-based
// auth once multi-user support (Phase 2) lands. Every table already has
// a `user_id` column so that swap won't touch the schema.
export async function getCurrentUserId(): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).limit(1);
  if (!user) {
    throw new Error("No user found — run `npm run db:seed` first.");
  }
  return user.id;
}
