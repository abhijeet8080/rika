import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { embedChunks } from "@/lib/ai/embeddings";
import { db } from "@/lib/db/client";
import { meetings, transcriptChunks } from "@/lib/db/schema";
import { upsertTranscriptChunks } from "@/lib/vector/transcript-chunks";
import { qdrant, TRANSCRIPT_CHUNKS_COLLECTION } from "@/lib/vector/client";
import { meetingAcceptsWrites, writableMeeting } from "@/lib/lifecycle/meeting-access";
import { storeLiveTranscript } from "./store-live-transcript";
import type { RecallRealtimeTranscriptWebhookPayload } from "./types";

function stableUtteranceId(
  botId: string,
  participantId: number,
  startMs: number,
  endMs: number,
  text: string,
): string {
  const hash = createHash("sha256")
    .update(`${botId}:${participantId}:${startMs}:${endMs}:${text}`)
    .digest("hex");
  // Qdrant accepts UUID point ids. Make a deterministic UUID-shaped id so
  // webhook redelivery upserts the same point as the Postgres primary key.
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function processLiveTranscript(
  payload: RecallRealtimeTranscriptWebhookPayload,
): Promise<void> {
  const [meeting] = await db
    .select({ id: meetings.id, userId: meetings.userId, status: meetings.status })
    .from(meetings)
    .where(eq(meetings.recallBotId, payload.data.bot.id));
  // processCompletedBot switches to "processing" before rebuilding the
  // canonical transcript. Ignore late real-time deliveries in that window
  // so they cannot race the clean rebuild and leave duplicate chunks.
  if (!meeting || !(await meetingAcceptsWrites(meeting.id)) || meeting.status === "done" || meeting.status === "processing" || meeting.status.startsWith("fatal")) {
    return;
  }

  const utterance = payload.data.data;
  const words = utterance.words;
  const text = words.map((word) => word.text).join(" ").trim();
  const startMs = Math.round(words[0].start_timestamp.relative * 1000);
  const lastWord = words.at(-1)!;
  const endMs = Math.round(
    (lastWord.end_timestamp?.relative ?? lastWord.start_timestamp.relative) * 1000,
  );
  if (!text) return;

  const id = stableUtteranceId(
    payload.data.bot.id,
    utterance.participant.id,
    startMs,
    endMs,
    text,
  );
  await storeLiveTranscript({
    id, meetingId: meeting.id, userId: meeting.userId,
    speaker: utterance.participant.name, startMs, endMs, text,
  }, {
    async embed(text) {
      const [vector] = await embedChunks([text]);
      return vector;
    },
    async isActive() {
      const [current] = await db.select({ status: meetings.status }).from(meetings)
        .where(eq(meetings.id, meeting.id));
      return Boolean(await meetingAcceptsWrites(meeting.id)) && Boolean(current && current.status !== "done" && current.status !== "processing" && !current.status.startsWith("fatal"));
    },
    async upsertVector(chunk, vector) {
      await upsertTranscriptChunks([{ ...chunk, vector }]);
    },
    async saveChunk(chunk) {
      await db.execute(sql`WITH active AS (${writableMeeting(meeting.id)})
        INSERT INTO transcript_chunks (id, meeting_id, speaker, start_ms, end_ms, text)
        SELECT ${chunk.id}::uuid, id, ${chunk.speaker}, ${chunk.startMs}, ${chunk.endMs}, ${chunk.text}
        FROM active ON CONFLICT DO NOTHING`);
    },
    async removeChunk(id) {
      await qdrant.delete(TRANSCRIPT_CHUNKS_COLLECTION, { points: [id], wait: true });
      await db.delete(transcriptChunks).where(eq(transcriptChunks.id, id));
    },
  });
}
