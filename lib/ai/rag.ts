import { createDeepSeek } from "@ai-sdk/deepseek";
import { generateText, streamText, type ModelMessage } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { meetings } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { qdrant, TRANSCRIPT_CHUNKS_COLLECTION } from "@/lib/vector/client";
import { embedQuery } from "./embeddings";

// Lazy — reading env.DEEPSEEK_API_KEY at module load time would make any
// build that imports this file fail before the key is even needed.
let chatModel: ReturnType<ReturnType<typeof createDeepSeek>> | undefined;

function getChatModel() {
  if (!chatModel) {
    const deepseek = createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY });
    chatModel = deepseek("deepseek-chat");
  }
  return chatModel;
}

export interface ChatScope {
  userId: string;
  /** Takes precedence over categoryId/uncategorizedOnly if set. */
  meetingId?: string;
  /** Ignored if meetingId is set. */
  categoryId?: string;
  /** Meetings with no category. Ignored if meetingId or categoryId is set. */
  uncategorizedOnly?: boolean;
  // At least one of meetingId/categoryId/uncategorizedOnly is required —
  // there is no unscoped "every meeting" retrieval.
}

export interface RetrievedChunk {
  text: string;
  speaker: string | null;
  startMs: number;
  meetingId: string;
  score: number;
}

export async function retrieveChunks(
  question: string,
  scope: ChatScope,
  limit = 8,
): Promise<RetrievedChunk[]> {
  let filter: object;

  if (scope.meetingId) {
    filter = { must: [{ key: "meeting_id", match: { value: scope.meetingId } }] };
  } else if (scope.categoryId || scope.uncategorizedOnly) {
    // Category membership is resolved from Postgres at query time rather
    // than synced into Qdrant payloads — categories get renamed/reassigned,
    // and that sync path isn't worth the drift risk.
    const rows = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(
        scope.categoryId
          ? and(
              eq(meetings.userId, scope.userId),
              eq(meetings.categoryId, scope.categoryId),
            )
          : and(eq(meetings.userId, scope.userId), isNull(meetings.categoryId)),
      );
    const meetingIds = rows.map((r) => r.id);

    if (meetingIds.length === 0) return [];

    filter = { must: [{ key: "meeting_id", match: { any: meetingIds } }] };
  } else {
    throw new Error(
      "retrieveChunks requires meetingId, categoryId, or uncategorizedOnly",
    );
  }

  const vector = await embedQuery(question);

  const results = await qdrant.search(TRANSCRIPT_CHUNKS_COLLECTION, {
    vector,
    filter,
    limit,
    with_payload: true,
  });

  return results.map((r) => {
    const payload = r.payload as Record<string, unknown>;
    return {
      text: payload.text as string,
      speaker: (payload.speaker as string | null) ?? null,
      startMs: payload.start_ms as number,
      meetingId: payload.meeting_id as string,
      score: r.score,
    };
  });
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function buildContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "No relevant transcript excerpts were found.";
  }
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] (${c.speaker ?? "Unknown"} @ ${formatTimestamp(c.startMs)}) ${c.text}`,
    )
    .join("\n");
}

function extractLastUserText(messages: ModelMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  if (typeof lastUser.content === "string") return lastUser.content;
  return lastUser.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

export async function answerQuestion(
  messages: ModelMessage[],
  scope: ChatScope,
) {
  const question = extractLastUserText(messages);
  const chunks = await retrieveChunks(question, scope);
  const context = buildContext(chunks);

  return streamText({
    model: getChatModel(),
    system:
      "You answer questions about meeting transcripts using only the excerpts " +
      "provided below. Cite excerpts by their [n] marker and mention the " +
      "speaker/timestamp when useful. If the excerpts don't contain the " +
      "answer, say so plainly instead of guessing.\n\n" +
      `Transcript excerpts:\n${context}`,
    messages,
  });
}

// Non-streaming variant for the live in-meeting chat handler, which needs
// a single plain-text reply to hand to Recall's send-chat-message
// endpoint rather than a UI stream.
export async function answerQuestionText(
  question: string,
  scope: ChatScope,
): Promise<string> {
  const chunks = await retrieveChunks(question, scope);
  const context = buildContext(chunks);

  const result = await generateText({
    model: getChatModel(),
    system:
      "You answer questions about meeting transcripts using only the excerpts " +
      "provided below. This reply is being posted directly into a live meeting's " +
      "chat panel, so keep it to 1-3 short sentences — no markdown, no citation " +
      "markers. If the excerpts don't contain the answer, say so plainly instead " +
      "of guessing.\n\n" +
      `Transcript excerpts:\n${context}`,
    prompt: question,
  });

  return result.text;
}
