import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { RetentionSchema } from "@/lib/lifecycle/policy";
import { isSameOrigin } from "@/lib/lifecycle/request-origin";
import { requestAccountDeletion } from "@/lib/lifecycle/repository";
import { runLifecycleCleanup } from "@/lib/lifecycle/cleanup";

export const maxDuration = 300;

async function ownedAccount() {
  const { userId } = await auth.protect();
  const [user] = await db.select().from(users).where(eq(users.clerkUserId, userId));
  return user;
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const account = await ownedAccount();
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  if (account.deletionRequestedAt) return Response.json({ error: "Account deletion is in progress" }, { status: 409 });
  const body = await request.json().catch(() => null);
  const parsed = RetentionSchema.safeParse(body?.retentionDays);
  if (!parsed.success) return Response.json({ error: "Choose keep forever, 30, 90, 180, or 365 days" }, { status: 400 });
  const saved = await db.update(users).set({ retentionDays: parsed.data })
    .where(and(eq(users.id, account.id), isNull(users.deletionRequestedAt))).returning({ id: users.id });
  if (!saved.length) return Response.json({ error: "Account deletion is in progress" }, { status: 409 });
  after(async () => { await runLifecycleCleanup(); });
  return Response.json({ retentionDays: parsed.data });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin" }, { status: 403 });
  const account = await ownedAccount();
  if (!account) return Response.json({ error: "Account not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== "DELETE") return Response.json({ error: "Type DELETE to confirm account deletion" }, { status: 400 });
  await requestAccountDeletion(account.id);
  after(async () => { await runLifecycleCleanup(); });
  return Response.json({ deletionRequested: true }, { status: 202 });
}
