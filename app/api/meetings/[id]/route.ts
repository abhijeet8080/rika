import { and, eq, isNull } from "drizzle-orm";
import { after } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import {
  categories,
  meetings,
} from "@/lib/db/schema";
import { requestMeetingDeletion } from "@/lib/lifecycle/repository";
import { runCleanupStep } from "@/lib/lifecycle/cleanup";

import { z } from "zod";
import { isSameOrigin } from "@/lib/lifecycle/request-origin";

export const maxDuration = 300;

export async function PATCH(
  request: Request,
  { params }: RouteContext<"/api/meetings/[id]">,
) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Meeting not found" }, { status: 404 });
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
    .where(and(eq(meetings.id, id), eq(meetings.userId, userId), isNull(meetings.deletionRequestedAt)));

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
    .where(and(eq(meetings.id, id), eq(meetings.userId, userId), isNull(meetings.deletionRequestedAt)))
    .returning();

  return Response.json({ meeting: updated });
}

export async function DELETE(
  request: Request,
  { params }: RouteContext<"/api/meetings/[id]">,
) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Meeting not found" }, { status: 404 });
  const userId = await getCurrentUserId();
  if (!(await requestMeetingDeletion(id, userId))) {
    return Response.json({ error: "Meeting not found" }, { status: 404 });
  }
  after(async () => { await runCleanupStep("meeting", id); });
  return Response.json({ deletionRequested: true }, { status: 202 });
}
