import { meetingCreationAccount, registerCreatedMeeting } from "@/lib/lifecycle/register-meeting";
import { scheduleCalendarBot } from "./client";
import { extractEventTitle } from "./event-title";
import { BOT_DISPLAY_NAME } from "./live-chat";
import { detectPlatform } from "./platform";

// Shared by the manual "Record" button and auto-record (backfill +
// calendar.sync_events webhook) — both ultimately need to call Recall's
// schedule-bot-for-event endpoint and turn the response into a
// `meetings` row the same way.
export async function scheduleBotForCalendarEvent(
  userId: string,
  eventId: string,
  icalUid: string,
  options: {
    recallAccount?: string;
    calendarConnectionId?: string;
    categoryId?: string | null;
    recordVideo?: boolean;
    recordAudio?: boolean;
  } = {},
) {
  const { categoryId, recordVideo, recordAudio, calendarConnectionId, recallAccount = "primary" } = options;

  const account = await meetingCreationAccount(userId, calendarConnectionId, categoryId);
  const event = await scheduleCalendarBot(eventId, {
    deduplicationKey: `${userId}:${icalUid}`,
    botConfig: { botName: BOT_DISPLAY_NAME, recordVideo, recordAudio, retentionDays: account.retentionDays },
  }, recallAccount);

  // Recall returns scheduled bots as a `bots` array (confirmed live) —
  // take the most recently scheduled one.
  const botId = event.bots?.at(-1)?.bot_id;
  if (!botId) {
    throw new Error(`Recall did not return a bot id for event ${eventId}`);
  }

  const meetingUrl =
    typeof event.meeting_url === "string" ? event.meeting_url : "";
  const title = extractEventTitle(event);

  const meeting = await registerCreatedMeeting(userId, {
    botId, account: recallAccount, title, categoryId, platform: meetingUrl ? detectPlatform(meetingUrl) : null,
    meetingUrl, calendarEventId: event.id, calendarConnectionId,
    scheduledStart: new Date(event.start_time), status: "scheduled",
  });
  if (meeting.deletionRequestedAt) throw new Error("Account or calendar disconnected while scheduling");
  return meeting;
}
