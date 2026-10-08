import { and, eq, isNotNull } from "drizzle-orm";
import { AccountSettings } from "@/components/account-settings";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { meetings, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const userId = await getCurrentUserId();
  const [account] = await db.select().from(users).where(eq(users.id, userId));
  const pending = await db.select({ id: meetings.id, title: meetings.title, error: meetings.cleanupError })
    .from(meetings).where(and(eq(meetings.userId, userId), isNotNull(meetings.deletionRequestedAt)));
  return <AccountSettings retentionDays={account.retentionDays} pending={pending} />;
}
