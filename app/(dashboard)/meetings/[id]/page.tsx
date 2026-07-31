import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CategorySelect } from "@/components/category-select";
import { EmptyState } from "@/components/empty-state";
import { MeetingWorkspace } from "@/components/meeting-workspace";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/ui/page-header";
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

function formatDuration(startedAt: Date | null, endedAt: Date | null): string | null {
  if (!startedAt || !endedAt) return null;
  const totalMinutes = Math.max(
    0,
    Math.round((endedAt.getTime() - startedAt.getTime()) / 60000),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default async function MeetingDetailPage({
  params,
}: PageProps<"/meetings/[id]">) {
  const { id } = await params;
  const userId = await getCurrentUserId();

  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));

  if (!meeting || meeting.userId !== userId) {
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

  const duration = formatDuration(meeting.startedAt, meeting.endedAt);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/meetings"
          className="flex items-center gap-1.5 font-mono text-[13px] text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Meetings
        </Link>

        <PageHeader
          className="items-center"
          title={meeting.title ?? meeting.meetingUrl}
          description={
            <span className="flex flex-wrap items-center gap-3">
              <StatusBadge status={meeting.status} />
              <span className="text-ink-muted">
                {meeting.platform ?? "unknown platform"}
                {duration ? ` · ${duration}` : ""}
              </span>
              <CategorySelect
                mode="bound"
                meetingId={meeting.id}
                initialCategoryId={meeting.categoryId}
                categories={userCategories}
              />
            </span>
          }
        />
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="order-2 flex flex-col gap-3 lg:order-none">
          <h2 className="font-mono text-[13px] tracking-wider text-ink-muted uppercase">
            Participants
          </h2>
          {meetingParticipants.length === 0 ? (
            <EmptyState>No participants recorded yet.</EmptyState>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {meetingParticipants.map((p) => (
                <li
                  key={p.id}
                  className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-ink"
                >
                  {p.name ?? p.email ?? "Unknown"}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="order-1 lg:order-none">
          <MeetingWorkspace
            meetingId={meeting.id}
            chunks={chunks}
            videoUrl={recordingVideoUrl}
            audioUrl={recordingAudioUrl}
          />
        </div>
      </div>
    </div>
  );
}
