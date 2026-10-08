import { eq } from "drizzle-orm";
import { CalendarWorkspace } from "@/components/calendar-workspace";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { calendarConnections } from "@/lib/db/schema";

// OAuth callbacks change connection status between requests.
export const dynamic = "force-dynamic";

export default async function CalendarSettingsPage() {
  const userId = await getCurrentUserId();
  const connections = await db.select({
    id: calendarConnections.id,
    provider: calendarConnections.provider,
    email: calendarConnections.email,
    autoRecord: calendarConnections.autoRecord,
    status: calendarConnections.status,
    cleanupError: calendarConnections.cleanupError,
  }).from(calendarConnections).where(eq(calendarConnections.userId, userId));

  return <CalendarWorkspace connections={connections} outlookEnabled={Boolean(process.env.MICROSOFT_OAUTH_CLIENT_ID)} />;
}
