"use client";

import { ChevronRight, Trash2, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CategorySelect } from "@/components/category-select";
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
  categoryId: string | null;
}

interface Category {
  id: string;
  name: string;
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
  categories,
  emptyLabel,
}: {
  meetings: MeetingListItem[];
  categories: Category[];
  emptyLabel: string;
}) {
  const router = useRouter();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (res.ok) {
      router.refresh();
    }
  }

  if (meetings.length === 0) {
    if (!emptyLabel) return null;
    return <EmptyState>{emptyLabel}</EmptyState>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {meetings.map((meeting) => (
        <li
          key={meeting.id}
          className="group flex items-center gap-4 rounded-xl border border-line bg-card px-4 py-3 transition-colors hover:border-ink/25 hover:bg-white"
        >
          <Link
            href={`/meetings/${meeting.id}`}
            className="flex min-w-0 flex-1 items-center gap-4"
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
          </Link>

          <CategorySelect
            // Remount if this meeting's category or the overall category
            // list changes underneath us (e.g. created/deleted from
            // another row's picker) — CategorySelect only reads its
            // initial props on mount.
            key={`${meeting.categoryId ?? "none"}:${categories.length}`}
            mode="bound"
            meetingId={meeting.id}
            initialCategoryId={meeting.categoryId}
            categories={categories}
          />

          <Link
            href={`/meetings/${meeting.id}`}
            className="flex shrink-0 items-center gap-3"
          >
            <StatusBadge status={meeting.status} />
            <ChevronRight
              className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
              strokeWidth={1.75}
            />
          </Link>

          {confirmDeleteId === meeting.id ? (
            <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px]">
              <button
                type="button"
                disabled={deletingId === meeting.id}
                onClick={() => handleDelete(meeting.id)}
                className="text-rec underline underline-offset-2 disabled:opacity-50"
              >
                {deletingId === meeting.id ? "Removing…" : "Remove"}
              </button>
              <button
                type="button"
                disabled={deletingId === meeting.id}
                onClick={() => setConfirmDeleteId(null)}
                className="text-ink-muted disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(meeting.id)}
              aria-label="Remove meeting"
              className="shrink-0 rounded-lg p-1.5 text-ink-muted opacity-0 transition-opacity hover:bg-paper-soft hover:text-rec group-hover:opacity-100"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
