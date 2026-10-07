"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Download,
  MoreHorizontal,
  RefreshCw,
  Users,
} from "lucide-react";
import { CategorySelect } from "./category-select";
import { useToast } from "./ui/toaster";
import { meetingStatusLabel } from "@/lib/meeting-library";
import { formatMeetingWhen } from "@/lib/format-date";
import styles from "./meeting-detail.module.css";

export function MeetingDetailHeader({
  meetingId,
  title,
  platform,
  duration,
  date,
  status,
  categoryId,
  categories,
  participants,
  canExport,
  canGenerate,
}: {
  meetingId: string;
  title: string;
  platform: string;
  duration: string | null;
  date: Date | null;
  status: string;
  categoryId: string | null;
  categories: { id: string; name: string }[];
  participants: { id: string; name: string | null; email: string | null }[];
  canExport: boolean;
  canGenerate: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  async function regenerate() {
    setGenerating(true);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/intelligence`, {
        method: "POST",
      });
      if (!response.ok)
        throw new Error("Couldn't regenerate notes. Try again.");
      router.refresh();
      toast({ title: "Meeting notes refreshed", tone: "success" });
    } catch (error) {
      toast({
        title:
          error instanceof Error ? error.message : "Couldn't regenerate notes",
        tone: "error",
      });
    } finally {
      setGenerating(false);
    }
  }
  return (
    <header className={styles.header}>
      <div className={styles.headerTop}>
        <Link href="/meetings" className={styles.back}>
          <ArrowLeft size={14} /> All meetings
        </Link>
        <span className={styles.status} data-error={status.startsWith("fatal")}>
          {meetingStatusLabel(status)}
        </span>
      </div>
      <div className={styles.titleRow}>
        <h1>{title}</h1>
        <Popover.Root>
          <Popover.Trigger
            className={styles.actionsButton}
            aria-label="Meeting actions"
          >
            <MoreHorizontal size={20} />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner align="end" sideOffset={8}>
              <Popover.Popup className={styles.actionMenu}>
                <span>MEETING ACTIONS</span>
                {canExport && (
                  <>
                    <p>
                      <Download size={14} /> Export transcript
                    </p>
                    {["txt", "srt", "pdf"].map((format) => (
                      <a
                        key={format}
                        href={`/api/meetings/${meetingId}/export?format=${format}`}
                      >
                        Download {format.toUpperCase()}
                      </a>
                    ))}
                  </>
                )}
                {canGenerate && (
                  <button
                    type="button"
                    disabled={generating}
                    onClick={regenerate}
                  >
                    <RefreshCw
                      size={14}
                      className={generating ? "animate-spin" : ""}
                    />
                    {generating ? "Regenerating…" : "Regenerate notes"}
                  </button>
                )}
                {!canExport && !canGenerate && (
                  <p>Actions will be available when the transcript is ready.</p>
                )}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <div className={styles.metadata}>
        <span>{platform}</span>
        {date && (
          <span suppressHydrationWarning>
            <CalendarDays size={13} />
            {formatMeetingWhen(date)}
          </span>
        )}
        {duration && (
          <span>
            <Clock3 size={13} />
            {duration}
          </span>
        )}
        <CategorySelect
          mode="bound"
          meetingId={meetingId}
          initialCategoryId={categoryId}
          categories={categories}
        />
        {participants.length > 0 && (
          <Popover.Root>
            <Popover.Trigger
              className={styles.participants}
              aria-label={`View ${participants.length} participants`}
            >
              <span className={styles.avatars}>
                {participants.slice(0, 3).map((person) => (
                  <i key={person.id}>
                    {(person.name ?? person.email ?? "?")[0].toUpperCase()}
                  </i>
                ))}
              </span>
              <Users size={13} />
              {participants.length} participants
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner align="end" sideOffset={8}>
                <Popover.Popup className={styles.participantsMenu}>
                  <h2>People in this meeting</h2>
                  <ul>
                    {participants.map((person) => (
                      <li key={person.id}>
                        {person.name ?? person.email ?? "Unknown"}
                      </li>
                    ))}
                  </ul>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
    </header>
  );
}
