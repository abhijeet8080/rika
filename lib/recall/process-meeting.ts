import { eq } from "drizzle-orm";
import { embedChunks } from "@/lib/ai/embeddings";
import { db } from "@/lib/db/client";
import { meetings, participants, transcriptChunks } from "@/lib/db/schema";
import { upsertTranscriptChunks } from "@/lib/vector/transcript-chunks";
import { retrieveBot } from "./client";
import { TranscriptSchema, type TranscriptEntry } from "./types";

// Non-overlapping window per speaker turn — keeps each embedded chunk to a
// reasonable size without splitting mid-turn for short exchanges.
const MAX_WORDS_PER_CHUNK = 150;

interface ChunkDraft {
  speaker: string | null;
  startMs: number;
  endMs: number;
  text: string;
}

function chunkTranscriptEntry(entry: TranscriptEntry): ChunkDraft[] {
  const drafts: ChunkDraft[] = [];

  for (let i = 0; i < entry.words.length; i += MAX_WORDS_PER_CHUNK) {
    const slice = entry.words.slice(i, i + MAX_WORDS_PER_CHUNK);
    if (slice.length === 0) continue;

    drafts.push({
      speaker: entry.participant.name,
      startMs: Math.round(slice[0].start_timestamp.relative * 1000),
      endMs: Math.round(
        slice[slice.length - 1].end_timestamp.relative * 1000,
      ),
      text: slice.map((w) => w.text).join(" "),
    });
  }

  return drafts;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  return res.json();
}

export async function markBotFatal(
  botId: string,
  subCode: string | null,
): Promise<void> {
  await db
    .update(meetings)
    .set({ status: subCode ? `fatal:${subCode}` : "fatal", endedAt: new Date() })
    .where(eq(meetings.recallBotId, botId));
}

export async function processCompletedBot(botId: string): Promise<void> {
  const [meeting] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.recallBotId, botId));

  if (!meeting) {
    throw new Error(`No meeting row found for Recall bot ${botId}`);
  }

  // Webhooks can be redelivered (Recall retries for up to 24h on failure) —
  // make reprocessing a no-op instead of duplicating chunks/participants.
  if (meeting.status === "done") {
    return;
  }

  const bot = await retrieveBot(botId);
  const recording = bot.recordings?.[0];
  if (!recording) {
    throw new Error(`Bot ${botId} completed with no recordings`);
  }

  const shortcuts = recording.media_shortcuts ?? {};
  const transcriptUrl = shortcuts.transcript?.data?.download_url;
  if (!transcriptUrl) {
    throw new Error(`Bot ${botId} has no transcript download URL`);
  }

  const transcriptEntries = TranscriptSchema.parse(
    await fetchJson(transcriptUrl),
  );

  const chunkDrafts = transcriptEntries.flatMap(chunkTranscriptEntry);

  if (chunkDrafts.length > 0) {
    const insertedChunks = await db
      .insert(transcriptChunks)
      .values(
        chunkDrafts.map((c) => ({
          meetingId: meeting.id,
          speaker: c.speaker,
          startMs: c.startMs,
          endMs: c.endMs,
          text: c.text,
        })),
      )
      .returning();

    const embeddings = await embedChunks(insertedChunks.map((c) => c.text));

    await upsertTranscriptChunks(
      insertedChunks.map((c, i) => ({
        id: c.id,
        vector: embeddings[i],
        meetingId: meeting.id,
        userId: meeting.userId,
        speaker: c.speaker,
        startMs: c.startMs,
        endMs: c.endMs,
        text: c.text,
      })),
    );
  }

  const uniqueParticipants = new Map<number, TranscriptEntry["participant"]>();
  for (const entry of transcriptEntries) {
    uniqueParticipants.set(entry.participant.id, entry.participant);
  }

  if (uniqueParticipants.size > 0) {
    await db.insert(participants).values(
      Array.from(uniqueParticipants.values()).map((p) => ({
        meetingId: meeting.id,
        name: p.name,
        email: p.email ?? null,
      })),
    );
  }

  await db
    .update(meetings)
    .set({
      status: "done",
      recordingVideoUrl: shortcuts.video_mixed?.data?.download_url ?? null,
      recordingAudioUrl: shortcuts.audio_mixed?.data?.download_url ?? null,
      endedAt: new Date(),
    })
    .where(eq(meetings.id, meeting.id));
}
