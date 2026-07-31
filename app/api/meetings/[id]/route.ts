import { and, eq } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { categories, meetings } from "@/lib/db/schema";

export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/meetings/[id]">,
) {
  const { id } = await params;
  const { categoryId } = await request.json();

  if (categoryId !== null && typeof categoryId !== "string") {
    return Response.json(
      { error: "categoryId must be a string or null" },
      { status: 400 },
    );
  }

  const userId = await getCurrentUserId();

  const [meeting] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.id, id), eq(meetings.userId, userId)));

  if (!meeting) {
    return Response.json({ error: "Meeting not found" }, { status: 404 });
  }

  if (categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(eq(categories.id, categoryId), eq(categories.userId, userId)),
      );

    if (!category) {
      return Response.json({ error: "Category not found" }, { status: 404 });
    }
  }

  const [updated] = await db
    .update(meetings)
    .set({ categoryId })
    .where(eq(meetings.id, id))
    .returning();

  return Response.json({ meeting: updated });
}
