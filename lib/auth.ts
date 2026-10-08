import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { redirect } from "next/navigation";

// The enforcement point: every protected page/route calls this, and
// auth.protect() is what actually redirects/401s unauthenticated requests
// (resource-based checks — see proxy.ts for why this isn't in middleware).
export async function getCurrentUserId(): Promise<string> {
  const { userId: clerkUserId } = await auth.protect();

  const [byClerkId] = await db
    .select({ id: users.id, deletionRequestedAt: users.deletionRequestedAt })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));
  if (byClerkId) {
    if (byClerkId.deletionRequestedAt) redirect("/account-deletion");
    return byClerkId.id;
  }

  // First request from this Clerk account. If a pre-auth row already
  // exists with a matching email (e.g. the Phase 1 seeded user), link it
  // instead of creating a duplicate — preserves its existing meetings.
  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== clerkUserId) redirect("/sign-in");
  const email = clerkUser.primaryEmailAddress?.emailAddress;

  if (email) {
    const [byEmail] = await db
      .select({ id: users.id, clerkUserId: users.clerkUserId, deletionRequestedAt: users.deletionRequestedAt })
      .from(users)
      .where(eq(users.email, email));

    if (byEmail) {
      if (byEmail.deletionRequestedAt) redirect("/account-deletion");
      if (byEmail.clerkUserId && byEmail.clerkUserId !== clerkUserId) {
        throw new Error("This email is already linked to another account");
      }
      const linked = await db
        .update(users)
        .set({ clerkUserId })
        .where(and(eq(users.id, byEmail.id), isNull(users.deletionRequestedAt),
          or(isNull(users.clerkUserId), eq(users.clerkUserId, clerkUserId)))).returning({ id: users.id });
      if (!linked.length) redirect("/account-deletion");
      return linked[0].id;
    }
  }

  const [created] = await db
    .insert(users)
    .values({ email: email ?? `${clerkUserId}@unknown.local`, clerkUserId })
    .returning({ id: users.id });
  return created.id;
}
