import { meetingAcceptsWrites, writableMeeting } from "@/lib/lifecycle/meeting-access";
import { desc, eq, sql } from "drizzle-orm";
import { answerQuestionText } from "@/lib/ai/rag";
import { db } from "@/lib/db/client";
import { liveChatMessages, meetings } from "@/lib/db/schema";
import { sendChatMessage } from "./client";

// Single source of truth for the bot's meeting participant name — must
// match `botName` passed to createBot/scheduleCalendarBot exactly, or
// the self-message guard below breaks and Rika starts replying to
// herself in a loop.
export const BOT_DISPLAY_NAME = "RIKA";

// Directed at Rika if the message starts with her name, optionally
// preceded by "@" and followed by punctuation/whitespace before the
// actual question — e.g. "@Rika, what did we agree on pricing?".
const TRIGGER_PATTERN = /^@?rika[,:\s]+(.+)/i;

const CHAT_CHAR_LIMITS: Record<string, number> = {
  google_meet: 500,
  zoom: 4096,
  teams: 4096,
};
const DEFAULT_CHAT_CHAR_LIMIT = 500;

// Each webhook delivery is a separate serverless invocation with no
// shared memory, so recent conversation context is read back from
// live_chat_messages rather than held in process.
const HISTORY_LIMIT = 10;

function extractQuestion(text: string): string | null {
  const match = TRIGGER_PATTERN.exec(text.trim());
  const question = match?.[1]?.trim();
  return question || null;
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

async function getRecentHistory(meetingId: string): Promise<string | null> {
  const rows = await db
    .select({
      role: liveChatMessages.role,
      participantName: liveChatMessages.participantName,
      text: liveChatMessages.text,
    })
    .from(liveChatMessages)
    .where(eq(liveChatMessages.meetingId, meetingId))
    .orderBy(desc(liveChatMessages.createdAt))
    .limit(HISTORY_LIMIT);

  if (rows.length === 0) return null;

  return rows
    .reverse()
    .map((r) =>
      r.role === "assistant"
        ? `${BOT_DISPLAY_NAME}: ${r.text}`
        : `${r.participantName ?? "Someone"}: ${r.text}`,
    )
    .join("\n");
}

export async function handleLiveChatMessage(
  botId: string,
  participantName: string | null,
  text: string,
): Promise<void> {
  // Recall reports the bot's own sent messages back through the same
  // participant-chat event — without this guard, a reply containing
  // "Rika" would re-trigger itself.
  if (participantName === BOT_DISPLAY_NAME) return;

  const question = extractQuestion(text);
  if (!question) return;

  const [meeting] = await db
    .select({
      id: meetings.id,
      userId: meetings.userId,
      recallAccount: meetings.recallAccount,
      categoryId: meetings.categoryId,
      platform: meetings.platform,
    })
    .from(meetings)
    .where(eq(meetings.recallBotId, botId));

  if (!meeting || !(await meetingAcceptsWrites(meeting.id))) return;

  const conversationHistory = await getRecentHistory(meeting.id);

  const answer = await answerQuestionText(
    question,
    {
      userId: meeting.userId,
      includeMeetingId: meeting.id,
      ...(meeting.categoryId
        ? { categoryId: meeting.categoryId }
        : { uncategorizedOnly: true }),
    },
    { conversationHistory },
  );

  const limit =
    CHAT_CHAR_LIMITS[meeting.platform ?? ""] ?? DEFAULT_CHAT_CHAR_LIMIT;
  const truncated = truncate(answer, limit);

  if (!(await meetingAcceptsWrites(meeting.id))) return;
  const saved = await db.execute(sql`WITH active AS (${writableMeeting(meeting.id)})
    INSERT INTO live_chat_messages (meeting_id, role, participant_name, text)
    SELECT active.id, message.role, message.name, message.text FROM active,
    jsonb_to_recordset(${JSON.stringify([
      { role: "user", name: participantName, text: question },
      { role: "assistant", name: null, text: truncated },
    ])}::jsonb) AS message(role text, name text, text text) RETURNING id`);
  if (saved.rows.length && await meetingAcceptsWrites(meeting.id)) await sendChatMessage(botId, truncated, meeting.recallAccount);
}
