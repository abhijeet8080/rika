import Link from "next/link";
import { ChevronRight, Video } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";

export interface MeetingListItem {
  id: string;
  title: string | null;
  platform: string | null;
  meetingUrl: string;
  status: string;
  scheduledStart: Date | null;
  startedAt: Date | null;
  categoryName?: string | null;
}

function formatWhen(meeting: MeetingListItem): string {
  const date = meeting.startedAt ?? meeting.scheduledStart;
  if (!date) return "Not scheduled";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MeetingList({
  meetings,
  emptyLabel,
}: {
  meetings: MeetingListItem[];
  emptyLabel: string;
}) {
  if (meetings.length === 0) {
    if (!emptyLabel) return null;
    return <EmptyState>{emptyLabel}</EmptyState>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {meetings.map((meeting) => (
        <li key={meeting.id}>
          <Link
            href={`/meetings/${meeting.id}`}
            className="group flex items-center gap-4 rounded-xl border border-line bg-card px-4 py-3 transition-colors hover:border-ink/25 hover:bg-white"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper-soft text-ink-muted">
              <Video className="h-4 w-4" strokeWidth={1.75} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">
                {meeting.title ?? meeting.meetingUrl}
              </span>
              <span className="block truncate font-mono text-[12px] text-ink-muted">
                {formatWhen(meeting)} · {meeting.platform ?? "unknown platform"}
              </span>
            </span>

            {meeting.categoryName && (
              <span className="shrink-0 rounded-full border border-line bg-paper-soft px-2.5 py-1 font-mono text-[11px] text-ink-muted">
                {meeting.categoryName}
              </span>
            )}

            <StatusBadge status={meeting.status} />

            <ChevronRight
              className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
