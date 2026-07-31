import { eq } from "drizzle-orm";
import { answerQuestionText } from "@/lib/ai/rag";
import { db } from "@/lib/db/client";
import { meetings } from "@/lib/db/schema";
import { sendChatMessage } from "./client";

const BOT_DISPLAY_NAME = "Rika";

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

function extractQuestion(text: string): string | null {
  const match = TRIGGER_PATTERN.exec(text.trim());
  const question = match?.[1]?.trim();
  return question || null;
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
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
      userId: meetings.userId,
      categoryId: meetings.categoryId,
      platform: meetings.platform,
    })
    .from(meetings)
    .where(eq(meetings.recallBotId, botId));

  if (!meeting) return;

  const answer = await answerQuestionText(question, {
    userId: meeting.userId,
    ...(meeting.categoryId
      ? { categoryId: meeting.categoryId }
      : { uncategorizedOnly: true }),
  });

  const limit =
    CHAT_CHAR_LIMITS[meeting.platform ?? ""] ?? DEFAULT_CHAT_CHAR_LIMIT;

  await sendChatMessage(botId, truncate(answer, limit));
}
