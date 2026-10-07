"use client";

import {
  CheckSquare,
  ArrowUpRight,
  MoreHorizontal,
  Trash2,
  Video,
  Folder,
  CalendarDays,
} from "lucide-react";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import styles from "./meetings.module.css";
import { meetingGroup, meetingStatusLabel } from "@/lib/meeting-library";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CategorySelect } from "@/components/category-select";
import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/ui/toaster";
import { formatMeetingWhen } from "@/lib/format-date";

export interface MeetingListItem {
  id: string;
  title: string | null;
  platform: string | null;
  meetingUrl: string;
  status: string;
  createdAt?: Date | string;
  scheduledStart: Date | null;
  startedAt: Date | null;
  categoryId: string | null;
  summary: string | null;
  actionItemCount: number;
}

interface Category {
  id: string;
  name: string;
}

export function platformLabel(platform: string | null): string {
  if (!platform) return "Unknown";
  if (platform === "google_meet") return "Meet";
  if (platform === "microsoft_teams" || platform === "teams") return "Teams";
  return platform.charAt(0).toUpperCase() + platform.slice(1);
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
  const { toast } = useToast();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Meeting removed", tone: "success" });
        router.refresh();
      } else {
        toast({
          title: "Couldn't remove the meeting",
          description: `Request failed (${res.status}) — try again.`,
          tone: "error",
        });
      }
    } catch {
      toast({
        title: "Couldn't remove the meeting",
        description: "Network error — check your connection and try again.",
        tone: "error",
      });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  if (meetings.length === 0) {
    if (!emptyLabel) return null;
    return <EmptyState>{emptyLabel}</EmptyState>;
  }

  return (
    <ul className={styles.meetingList}>
      {meetings.map((meeting) => {
        const title =
          meeting.title ?? `${platformLabel(meeting.platform)} meeting`;
        const category = categories.find(
          (c) => c.id === meeting.categoryId,
        )?.name;
        const group = meetingGroup(meeting.status);
        const tone =
          meeting.status === "in_call_recording" ? "recording" : group;
        return (
          <li key={meeting.id} className={styles.meetingRow}>
            <Link
              href={`/meetings/${meeting.id}`}
              className={styles.meetingLink}
              aria-label={`Open ${title}`}
            >
              <span
                className={styles.platformIcon}
                data-platform={meeting.platform}
              >
                {meeting.platform === "zoom" ? (
                  <Video size={20} fill="currentColor" />
                ) : meeting.platform === "microsoft_teams" ||
                  meeting.platform === "teams" ? (
                  <span>T</span>
                ) : (
                  <Video size={20} />
                )}
              </span>
              <div className={styles.meetingContent}>
                <div className={styles.titleLine}>
                  <h3>{title}</h3>
                  <span className={styles.status} data-tone={tone}>
                    <i />
                    {meetingStatusLabel(meeting.status)}
                  </span>
                </div>
                <p className={styles.summary}>
                  {meeting.summary ??
                    (group === "upcoming"
                      ? "Rika will join when your meeting begins."
                      : group === "attention"
                        ? "Rika couldn't capture this call. Open the meeting for details."
                        : group === "completed"
                          ? "Open this meeting to revisit the conversation."
                          : "Your conversation is being captured and prepared.")}
                </p>
                <div className={styles.meetingMeta}>
                  <span suppressHydrationWarning>
                    <CalendarDays size={12} />
                    {formatMeetingWhen(
                      meeting.startedAt ??
                        meeting.scheduledStart ??
                        meeting.createdAt,
                    )}
                  </span>
                  <span>{platformLabel(meeting.platform)}</span>
                  {category && (
                    <span>
                      <Folder size={12} />
                      {category}
                    </span>
                  )}
                  {meeting.actionItemCount > 0 && (
                    <span className={styles.actionsCount}>
                      <CheckSquare size={12} />
                      {meeting.actionItemCount} action
                      {meeting.actionItemCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
              <ArrowUpRight size={17} className={styles.rowArrow} />
            </Link>
            <Popover.Root
              onOpenChange={(open) => {
                if (!open) setConfirmDeleteId(null);
              }}
            >
              <Popover.Trigger
                aria-label={`More options for ${title}`}
                className={styles.moreButton}
              >
                <MoreHorizontal size={19} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner sideOffset={8} align="end">
                  <Popover.Popup className={styles.actionMenu}>
                    <span className={styles.menuLabel}>MEETING OPTIONS</span>
                    <Link
                      href={`/meetings/${meeting.id}`}
                      className={styles.menuAction}
                    >
                      <ArrowUpRight size={15} />
                      Open meeting
                    </Link>
                    <div className={styles.categoryMenu}>
                      <span>Move to category</span>
                      <CategorySelect
                        key={`${meeting.categoryId ?? "none"}:${categories.length}`}
                        mode="bound"
                        meetingId={meeting.id}
                        initialCategoryId={meeting.categoryId}
                        categories={categories}
                      />
                    </div>
                    {confirmDeleteId === meeting.id ? (
                      <div className={styles.deleteConfirmation}>
                        <p>Remove this meeting?</p>
                        <small>This removes the meeting and its notes.</small>
                        <div>
                          <button
                            type="button"
                            disabled={deletingId === meeting.id}
                            onClick={() => handleDelete(meeting.id)}
                          >
                            {deletingId === meeting.id
                              ? "Removing…"
                              : "Remove meeting"}
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === meeting.id}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(meeting.id)}
                        className={`${styles.menuAction} ${styles.deleteAction}`}
                      >
                        <Trash2 size={14} />
                        Remove meeting
                      </button>
                    )}
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </li>
        );
      })}
    </ul>
  );
}
