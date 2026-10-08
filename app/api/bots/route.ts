import { meetingCreationAccount, registerCreatedMeeting } from "@/lib/lifecycle/register-meeting";
import { getCurrentUserId } from "@/lib/auth";
import { findActiveMeetingForUrl } from "@/lib/db/meetings";
import { rateLimit } from "@/lib/rate-limit";
import { getRecallAccount, getDefaultRecallAccountId } from "@/lib/recall/accounts";
import { createBot } from "@/lib/recall/client";
import { BOT_DISPLAY_NAME } from "@/lib/recall/live-chat";
import { detectPlatform } from "@/lib/recall/platform";

export const maxDuration = 300;

export async function POST(request: Request) {
  const { meetingUrl, recordVideo, recordAudio, recallAccount } = await request.json();

  if (!meetingUrl || typeof meetingUrl !== "string") {
    return Response.json({ error: "meetingUrl is required" }, { status: 400 });
  }
  if (recordVideo !== undefined && typeof recordVideo !== "boolean") {
    return Response.json({ error: "recordVideo must be a boolean" }, { status: 400 });
  }
  if (recordAudio !== undefined && typeof recordAudio !== "boolean") {
    return Response.json({ error: "recordAudio must be a boolean" }, { status: 400 });
  }

  let accountId;
  try {
    accountId = getRecallAccount(recallAccount ?? getDefaultRecallAccountId()).id;
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Invalid Recall account" }, { status: 400 });
  }

  const userId = await getCurrentUserId();

  const limited = await rateLimit("bots", userId);
  if (limited) return limited;

  // Covers the case a calendar auto-record already dispatched a bot for
  // this same meeting (or a previous manual join did) — without this,
  // pasting the same link twice sends two bots into the same call.
  const existing = await findActiveMeetingForUrl(userId, meetingUrl);
  if (existing) {
    return Response.json(
      {
        error: "Rika is already in this meeting.",
        meetingId: existing.id,
      },
      { status: 409 },
    );
  }

  const account = await meetingCreationAccount(userId);
  const bot = await createBot({
    meetingUrl,
    botName: BOT_DISPLAY_NAME,
    recordVideo,
    recordAudio,
    retentionDays: account.retentionDays,
  }, accountId);
  const latestStatus = bot.status_changes.at(-1)?.code ?? "joining";

  const meeting = await registerCreatedMeeting(userId, {
    botId: bot.id, account: accountId, platform: detectPlatform(meetingUrl), meetingUrl, status: latestStatus,
  });
  if (meeting.deletionRequestedAt) return Response.json({ error: "Account deletion is in progress" }, { status: 409 });
  return Response.json({ meeting }, { status: 201 });
}
