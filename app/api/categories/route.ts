import { and, eq, isNull, sql } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { categories, meetings } from "@/lib/db/schema";

export async function GET() {
  const userId = await getCurrentUserId();

  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      meetingCount: sql<number>`count(${meetings.id})`.mapWith(Number),
    })
    .from(categories)
    .leftJoin(meetings, and(eq(meetings.categoryId, categories.id), isNull(meetings.deletionRequestedAt)))
    .where(eq(categories.userId, userId))
    .groupBy(categories.id)
    .orderBy(categories.name);

  return Response.json({ categories: rows });
}

export async function POST(request: Request) {
  const { name } = await request.json();

  if (!name || typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const userId = await getCurrentUserId();

  const result = await db.execute(sql`WITH active AS (
    SELECT id FROM users WHERE id = ${userId}::uuid AND deletion_requested_at IS NULL FOR UPDATE
  ) INSERT INTO categories (user_id, name) SELECT id, ${name.trim()} FROM active RETURNING id, name`);
  const category = result.rows[0];
  if (!category) return Response.json({ error: "Account deletion is in progress" }, { status: 409 });

  return Response.json({ category }, { status: 201 });
}
