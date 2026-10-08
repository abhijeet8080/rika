import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { MeetingWorkspace } from "@/components/meeting-workspace";
import { MeetingDetailHeader } from "@/components/meeting-detail-header";
import styles from "@/components/meeting-detail.module.css";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import {
  categories,
  meetings,
  participants,
  transcriptChunks,
} from "@/lib/db/schema";
import { retrieveBot } from "@/lib/recall/client";

// Transcript/participants/recording-url state changes via webhooks —
// must not be frozen at build time.
export const dynamic = "force-dynamic";

function formatDuration(
  startedAt: Date | null,
  endedAt: Date | null,
): string | null {
  if (!startedAt || !endedAt) return null;
  const totalMinutes = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 60000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function platformLabel(platform: string | null): string {
  if (!platform) return "unknown platform";
  if (platform === "google_meet") return "Google Meet";
  if (platform === "microsoft_teams" || platform === "teams") {
    return "Microsoft Teams";
  }
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export default async function MeetingDetailPage({
  params,
}: PageProps<"/meetings/[id]">) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));

  if (!meeting || meeting.userId !== userId || meeting.deletionRequestedAt) {
    notFound();
  }

  const [meetingParticipants, chunks, userCategories] = await Promise.all([
    db
      .select()
      .from(participants)
      .where(eq(participants.meetingId, meeting.id)),
    db
      .select()
      .from(transcriptChunks)
      .where(eq(transcriptChunks.meetingId, meeting.id))
      .orderBy(asc(transcriptChunks.startMs)),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId)),
  ]);

  // Recall's recording URLs are signed/expiring — re-fetch fresh ones for a
  // completed meeting rather than trusting whatever was stored at webhook
  // time, falling back to the stored value if Recall is unreachable.
  let recordingVideoUrl = meeting.recordingVideoUrl;
  let recordingAudioUrl = meeting.recordingAudioUrl;

  if (meeting.status === "done") {
    try {
      const bot = await retrieveBot(meeting.recallBotId, meeting.recallAccount);
      const shortcuts = bot.recordings?.[0]?.media_shortcuts;
      recordingVideoUrl =
        shortcuts?.video_mixed?.data?.download_url ?? recordingVideoUrl;
      recordingAudioUrl =
        shortcuts?.audio_mixed?.data?.download_url ?? recordingAudioUrl;
    } catch {
      // fall back to the possibly-stale stored URLs
    }
  }

  const duration = formatDuration(meeting.startedAt, meeting.endedAt);

  return (
    <div className={styles.detailPage}>
      <MeetingDetailHeader
        meetingId={meeting.id}
        title={meeting.title ?? meeting.meetingUrl}
        platform={platformLabel(meeting.platform)}
        duration={duration}
        date={meeting.startedAt ?? meeting.scheduledStart ?? meeting.createdAt}
        status={meeting.status}
        categoryId={meeting.categoryId}
        categories={userCategories}
        participants={meetingParticipants}
        canExport={chunks.length > 0}
        canGenerate={meeting.status === "done" && chunks.length > 0}
      />
      <MeetingWorkspace
        key={meeting.id}
        meetingId={meeting.id}
        chunks={chunks}
        videoUrl={recordingVideoUrl}
        audioUrl={recordingAudioUrl}
        summary={meeting.summary}
        actionItems={meeting.actionItems}
        highlights={meeting.highlights}
        status={meeting.status}
      />
    </div>
  );
}
