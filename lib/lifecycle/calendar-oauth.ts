import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { calendarConnections } from "@/lib/db/schema";
import { getDefaultRecallAccountId } from "@/lib/recall/accounts";

export const CalendarOAuthStateSchema = z.object({
  state: z.string(), userId: z.uuid(), connectionId: z.uuid().optional(), recallAccount: z.enum(["primary", "secondary"]),
});
export type CalendarOAuthState = z.infer<typeof CalendarOAuthStateSchema>;

export async function calendarAuthorizationState(request: Request, provider: string): Promise<CalendarOAuthState> {
  const userId = await getCurrentUserId();
  const connectionId = new URL(request.url).searchParams.get("connectionId") ?? undefined;
  let recallAccount = getDefaultRecallAccountId();
  if (connectionId) {
    if (!z.uuid().safeParse(connectionId).success) throw new Error("Calendar connection not found");
    const [connection] = await db.select().from(calendarConnections).where(and(
      eq(calendarConnections.id, connectionId), eq(calendarConnections.userId, userId), eq(calendarConnections.provider, provider),
    ));
    if (!connection) throw new Error("Calendar connection not found");
    if (connection.status === "disconnecting") throw new Error("Wait for disconnection to finish before reconnecting");
    recallAccount = connection.recallAccount as typeof recallAccount;
  }
  return { state: randomBytes(16).toString("hex"), userId, connectionId, recallAccount };
}

export async function verifyCalendarAuthorization(cookie: string | undefined, state: string | null) {
  let decoded;
  try { decoded = CalendarOAuthStateSchema.parse(JSON.parse(cookie ?? "")); } catch { throw new Error("Invalid OAuth state — please try connecting again"); }
  const userId = await getCurrentUserId();
  if (!state || decoded.state !== state || decoded.userId !== userId) throw new Error("Invalid OAuth state — please try connecting again");
  return decoded;
}
