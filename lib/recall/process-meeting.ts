import { meetingAcceptsWrites, writableMeeting } from "@/lib/lifecycle/meeting-access";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { embedChunks } from "@/lib/ai/embeddings";
import { generateMeetingIntelligence } from "@/lib/ai/meeting-intelligence";
import { db } from "@/lib/db/client";
import {
  meetings,
  participants,
  transcriptChunks,
  type MeetingActionItem,
  type MeetingHighlight,
} from "@/lib/db/schema";
import {
  deleteTranscriptChunksForMeeting,
  upsertTranscriptChunks,
} from "@/lib/vector/transcript-chunks";
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
    .where(and(eq(meetings.recallBotId, botId), isNull(meetings.deletionRequestedAt)));
}

export async function processCompletedBot(botId: string): Promise<void> {
  const [meeting] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.recallBotId, botId), isNull(meetings.deletionRequestedAt)));

  if (!meeting) {
    throw new Error(`No meeting row found for Recall bot ${botId}`);
  }

  // Webhooks can be redelivered (Recall retries for up to 24h on failure) —
  // make reprocessing a no-op instead of duplicating chunks/participants.
  if (meeting.status === "done" || !(await meetingAcceptsWrites(meeting.id))) {
    return;
  }

  await db
    .update(meetings)
    .set({ status: "processing" })
    .where(and(eq(meetings.id, meeting.id), isNull(meetings.deletionRequestedAt)));

  const bot = await retrieveBot(botId, meeting.recallAccount);
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

  // A webhook can retry after a partial run (for example, Qdrant succeeded
  // but a later Postgres or intelligence call timed out). Start every retry
  // from a clean, meeting-scoped state so random UUIDs cannot accumulate as
  // orphaned vectors or duplicate transcript rows.
  if (!(await meetingAcceptsWrites(meeting.id))) return;
  await Promise.all([
    deleteTranscriptChunksForMeeting(meeting.id),
    db.delete(transcriptChunks).where(eq(transcriptChunks.meetingId, meeting.id)),
    db.delete(participants).where(eq(participants.meetingId, meeting.id)),
  ]);

  // Ids assigned up front so the embedding call and the Qdrant write —
  // both external calls, both liable to fail — happen *before* any
  // Postgres write. A failure here should leave nothing committed,
  // rather than transcript chunks landing in Postgres with no
  // embeddings, no participants, and no status update (exactly what
  // happened to a real meeting: 238 chunks committed, everything after
  // silently never ran, and it sat stuck on "scheduled" indefinitely).
  const chunksWithIds = chunkDrafts.map((c) => ({ id: randomUUID(), ...c }));

  if (chunksWithIds.length > 0) {
    const embeddings = await embedChunks(chunksWithIds.map((c) => c.text));

    if (!(await meetingAcceptsWrites(meeting.id))) return;
    await upsertTranscriptChunks(
      chunksWithIds.map((c, i) => ({
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

    const saved = await db.execute(sql`WITH active AS (${writableMeeting(meeting.id)})
      INSERT INTO transcript_chunks (id, meeting_id, speaker, start_ms, end_ms, text)
      SELECT c.id, active.id, c.speaker, c."startMs", c."endMs", c.text FROM active,
      jsonb_to_recordset(${JSON.stringify(chunksWithIds)}::jsonb)
        AS c(id uuid, speaker text, "startMs" integer, "endMs" integer, text text) RETURNING id`);
    if (!saved.rows.length) { await deleteTranscriptChunksForMeeting(meeting.id); return; }
  }

  const uniqueParticipants = new Map<number, TranscriptEntry["participant"]>();
  for (const entry of transcriptEntries) {
    uniqueParticipants.set(entry.participant.id, entry.participant);
  }

  if (uniqueParticipants.size > 0) {
    await db.execute(sql`WITH active AS (${writableMeeting(meeting.id)})
      INSERT INTO participants (meeting_id, name, email)
      SELECT active.id, p.name, p.email FROM active,
      jsonb_to_recordset(${JSON.stringify(Array.from(uniqueParticipants.values()).map((p) => ({ name: p.name, email: p.email ?? null })))}::jsonb)
        AS p(name text, email text)`);
  }

  // "Join now" meetings have no calendar event to pull a title from up
  // front — meeting_metadata is the only place one might show up, and
  // only after the call. Don't clobber a title already set at schedule
  // time (calendar-derived titles are more reliable than this).
  const metadataTitle = shortcuts.meeting_metadata?.data?.title;
  const title = meeting.title ?? metadataTitle ?? null;

  // Intelligence is best-effort — a failed summary must not leave the
  // meeting stuck off "done" with chunks already written.
  let summary: string | null = null;
  let actionItems: MeetingActionItem[] | null = null;
  let highlights: MeetingHighlight[] | null = null;

  if (chunksWithIds.length > 0) {
    try {
      const intelligence = await generateMeetingIntelligence(
        chunksWithIds.map((c) => ({
          speaker: c.speaker,
          startMs: c.startMs,
          text: c.text,
        })),
        { title },
      );
      if (intelligence) {
        summary = intelligence.summary;
        actionItems = intelligence.actionItems;
        highlights = intelligence.highlights;
      }
    } catch (err) {
      console.error(
        `Meeting intelligence failed for bot ${botId} (meeting ${meeting.id})`,
        err,
      );
    }
  }

  await db
    .update(meetings)
    .set({
      status: "done",
      title,
      recordingVideoUrl: shortcuts.video_mixed?.data?.download_url ?? null,
      recordingAudioUrl: shortcuts.audio_mixed?.data?.download_url ?? null,
      endedAt: new Date(),
      summary,
      actionItems,
      highlights,
    })
    .where(and(eq(meetings.id, meeting.id), isNull(meetings.deletionRequestedAt)));
}
