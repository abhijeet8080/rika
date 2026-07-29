import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { meetings } from "@/lib/db/schema";
import { createBot } from "@/lib/recall/client";
import { detectPlatform } from "@/lib/recall/platform";

export async function POST(request: Request) {
  const { meetingUrl } = await request.json();

  if (!meetingUrl || typeof meetingUrl !== "string") {
    return Response.json({ error: "meetingUrl is required" }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  const bot = await createBot({ meetingUrl, botName: "Rika" });
  const latestStatus = bot.status_changes.at(-1)?.code ?? "joining";

  const [meeting] = await db
    .insert(meetings)
    .values({
      userId,
      recallBotId: bot.id,
      platform: detectPlatform(meetingUrl),
      meetingUrl,
      status: latestStatus,
    })
    .returning();

  return Response.json({ meeting }, { status: 201 });
}
