import Link from "next/link";

export interface MeetingListItem {
  id: string;
  title: string | null;
  platform: string | null;
  meetingUrl: string;
  status: string;
  scheduledStart: Date | null;
  startedAt: Date | null;
}

function formatWhen(meeting: MeetingListItem): string {
  const date = meeting.startedAt ?? meeting.scheduledStart;
  return date ? date.toLocaleString() : "—";
}

export function MeetingList({
  meetings,
  emptyLabel,
}: {
  meetings: MeetingListItem[];
  emptyLabel: string;
}) {
  if (meetings.length === 0) {
    return <p className="text-sm text-zinc-500">{emptyLabel}</p>;
  }

  return (
    <ul className="flex max-w-lg flex-col gap-2">
      {meetings.map((meeting) => (
        <li
          key={meeting.id}
          className="rounded border border-black/[.08] p-3 text-sm dark:border-white/[.145]"
        >
          <Link
            href={`/meetings/${meeting.id}`}
            className="flex items-center justify-between gap-4"
          >
            <div>
              <p className="font-medium">{meeting.title ?? meeting.meetingUrl}</p>
              <p className="text-zinc-500">
                {formatWhen(meeting)} · {meeting.platform ?? "unknown platform"}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-black/[.15] px-2 py-0.5 text-xs dark:border-white/[.2]">
              {meeting.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
