import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat-panel";
import { TranscriptViewer } from "@/components/transcript-viewer";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { meetings, participants, transcriptChunks } from "@/lib/db/schema";
import { retrieveBot } from "@/lib/recall/client";

// Transcript/participants/recording-url state changes via webhooks —
// must not be frozen at build time.
export const dynamic = "force-dynamic";

export default async function MeetingDetailPage({
  params,
}: PageProps<"/meetings/[id]">) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));

  if (!meeting || meeting.userId !== userId) {
    notFound();
  }

  const [meetingParticipants, chunks] = await Promise.all([
    db
      .select()
      .from(participants)
      .where(eq(participants.meetingId, meeting.id)),
    db
      .select()
      .from(transcriptChunks)
      .where(eq(transcriptChunks.meetingId, meeting.id))
      .orderBy(asc(transcriptChunks.startMs)),
  ]);

  // Recall's recording URLs are signed/expiring — re-fetch fresh ones for a
  // completed meeting rather than trusting whatever was stored at webhook
  // time, falling back to the stored value if Recall is unreachable.
  let recordingVideoUrl = meeting.recordingVideoUrl;
  let recordingAudioUrl = meeting.recordingAudioUrl;

  if (meeting.status === "done") {
    try {
      const bot = await retrieveBot(meeting.recallBotId);
      const shortcuts = bot.recordings?.[0]?.media_shortcuts;
      recordingVideoUrl =
        shortcuts?.video_mixed?.data?.download_url ?? recordingVideoUrl;
      recordingAudioUrl =
        shortcuts?.audio_mixed?.data?.download_url ?? recordingAudioUrl;
    } catch {
      // fall back to the possibly-stale stored URLs
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {meeting.title ?? meeting.meetingUrl}
        </h1>
        <p className="text-sm text-zinc-500">
          {meeting.platform ?? "unknown platform"} · {meeting.status}
        </p>
      </div>

      {(recordingVideoUrl || recordingAudioUrl) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Recording</h2>
          <div className="flex gap-4 text-sm">
            {recordingVideoUrl && (
              <a
                href={recordingVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Video
              </a>
            )}
            {recordingAudioUrl && (
              <a
                href={recordingAudioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Audio
              </a>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Participants</h2>
        {meetingParticipants.length === 0 ? (
          <p className="text-sm text-zinc-500">No participants recorded yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {meetingParticipants.map((p) => (
              <li
                key={p.id}
                className="rounded-full border border-black/[.15] px-3 py-1 dark:border-white/[.2]"
              >
                {p.name ?? p.email ?? "Unknown"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Transcript</h2>
        <TranscriptViewer chunks={chunks} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Ask about this meeting</h2>
        <ChatPanel meetingId={meeting.id} />
      </section>
    </div>
  );
}
