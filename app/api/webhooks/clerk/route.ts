import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";
import { type NextRequest, after } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requestAccountDeletion } from "@/lib/lifecycle/repository";
import { runLifecycleCleanup } from "@/lib/lifecycle/cleanup";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) return Response.json({ error: "Clerk webhook is not configured" }, { status: 503 });
  let event;
  try { event = await verifyWebhook(request); }
  catch { return Response.json({ error: "Invalid webhook signature" }, { status: 400 }); }
  if (event.type !== "user.deleted") return Response.json({ received: true });
  if (!event.data.id) return Response.json({ error: "Missing deleted user ID" }, { status: 400 });
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerkUserId, event.data.id));
    if (user) {
      await requestAccountDeletion(user.id, true);
      after(async () => { await runLifecycleCleanup(); });
    }
  } catch (error) {
    console.error("Could not persist Clerk account deletion", error);
    return Response.json({ error: "Account cleanup could not be saved" }, { status: 503 });
  }
  return Response.json({ received: true });
}
