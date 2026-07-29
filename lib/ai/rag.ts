import { createDeepSeek } from "@ai-sdk/deepseek";
import { streamText, type ModelMessage } from "ai";
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
  /** Omit for cross-meeting retrieval. */
  meetingId?: string;
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
  const vector = await embedQuery(question);

  const filter = scope.meetingId
    ? { must: [{ key: "meeting_id", match: { value: scope.meetingId } }] }
    : { must: [{ key: "user_id", match: { value: scope.userId } }] };

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
