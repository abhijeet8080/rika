"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import {
  AudioLines,
  FileText,
  MessageSquareText,
  Play,
  ScrollText,
  VideoOff,
} from "lucide-react";
import { AudioPlayer } from "./audio-player";
import { ChatPanel } from "./chat-panel";
import { MeetingNotes } from "./meeting-notes";
import {
  TranscriptViewer,
  type TranscriptChunkItem,
} from "./transcript-viewer";
import type { MeetingActionItem, MeetingHighlight } from "@/lib/db/schema";
import styles from "./meeting-detail.module.css";

type Seek = { startMs: number; play: boolean };

export function MeetingWorkspace({
  meetingId,
  chunks,
  videoUrl,
  audioUrl,
  summary,
  actionItems,
  highlights,
  status,
}: {
  meetingId: string;
  chunks: TranscriptChunkItem[];
  videoUrl: string | null;
  audioUrl: string | null;
  summary: string | null;
  actionItems: MeetingActionItem[] | null;
  highlights: MeetingHighlight[] | null;
  status: string;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"notes" | "transcript" | "chat">(
    searchParams.get("source") ? "transcript" : "notes",
  );
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{
    id: string;
    sequence: number;
  } | null>(null);
  const [dismissedSource, setDismissedSource] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [mediaError, setMediaError] = useState(false);
  const [useAudio, setUseAudio] = useState(false);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const pendingSeek = useRef<Seek | null>(null);
  const sourceId = searchParams.get("source");
  const source = chunks.find((chunk) => chunk.id === sourceId);
  const citedChunk = source && dismissedSource !== sourceId ? source : null;
  const hasRecording = Boolean(videoUrl || audioUrl);
  const canGenerate = status === "done" && chunks.length > 0;

  function applyPendingSeek() {
    const media = mediaRef.current;
    const seek = pendingSeek.current;
    if (!media || !seek || media.readyState < 1) return;
    try {
      media.currentTime = Math.max(
        0,
        Math.min(
          seek.startMs / 1000,
          Number.isFinite(media.duration) ? media.duration : Infinity,
        ),
      );
      pendingSeek.current = null;
      if (seek.play)
        void media.play().catch(() => {
          setNotice("The moment is selected. Press play to continue playback.");
        });
    } catch {
      // A media element may not be seekable until its data finishes loading.
    }
  }

  // Deep links select an excerpt immediately and seek once metadata is ready.
  // Navigation does not attempt autoplay; explicit timestamp clicks do.
  useEffect(() => {
    if (!source || dismissedSource === sourceId) return;
    pendingSeek.current = { startMs: source.startMs, play: false };
    const media = mediaRef.current;
    const apply = () => {
      const seek = pendingSeek.current;
      if (!media || !seek || media.readyState < 1) return;
      try {
        media.currentTime = Math.max(
          0,
          Math.min(
            seek.startMs / 1000,
            Number.isFinite(media.duration) ? media.duration : Infinity,
          ),
        );
        pendingSeek.current = null;
      } catch {
        /* Retry when media data is ready. */
      }
    };
    apply();
    media?.addEventListener("loadedmetadata", apply);
    media?.addEventListener("canplay", apply);
    return () => {
      media?.removeEventListener("loadedmetadata", apply);
      media?.removeEventListener("canplay", apply);
    };
  }, [source, sourceId, dismissedSource, useAudio]);

  function seekTo(startMs: number, chunkId?: string) {
    const chunk = chunkId
      ? chunks.find((item) => item.id === chunkId)
      : [...chunks].reverse().find((item) => item.startMs <= startMs);
    setNotice(
      hasRecording
        ? null
        : "No recording is available. Select Transcript to view the highlighted source excerpt.",
    );
    setDismissedSource(sourceId);
    if (chunk) {
      setActiveChunkId(chunk.id);
      setFocusRequest((previous) => ({
        id: chunk.id,
        sequence: (previous?.sequence ?? 0) + 1,
      }));
    }
    pendingSeek.current = { startMs, play: true };
    applyPendingSeek();
  }

  function handleCitation(chunkId: string) {
    const chunk = chunks.find((item) => item.id === chunkId);
    if (!chunk) {
      setNotice(
        "This source excerpt is no longer available in the transcript.",
      );
      return;
    }
    seekTo(chunk.startMs, chunk.id);
  }

  function handleTimeUpdate() {
    const media = mediaRef.current;
    if (!media) return;
    const currentMs = media.currentTime * 1000;
    let current: TranscriptChunkItem | undefined;
    for (const chunk of chunks) {
      if (chunk.startMs > currentMs) break;
      current = chunk;
    }
    setActiveChunkId(current?.id ?? null);
    setDismissedSource(sourceId);
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.leftColumn}>
        {hasRecording ? (
          <section className={styles.recording} aria-label="Meeting recording">
            <div className={styles.playerHeading}>
              <span>
                <Play size={12} /> Recording
              </span>
              <span>
                {videoUrl && !useAudio ? "Video playback" : "Audio playback"}
              </span>
            </div>
            <div
              className={
                videoUrl && !useAudio ? styles.videoBox : styles.audioBox
              }
              style={{ "--recording-aspect": videoAspect } as CSSProperties}
            >
              {videoUrl && !useAudio ? (
                <video
                  ref={mediaRef as React.Ref<HTMLVideoElement>}
                  src={videoUrl}
                  controls
                  preload="metadata"
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    if (video.videoWidth && video.videoHeight) {
                      setVideoAspect(video.videoWidth / video.videoHeight);
                    }
                    applyPendingSeek();
                  }}
                  onCanPlay={applyPendingSeek}
                  onError={() => setMediaError(true)}
                  aria-label="Meeting video"
                />
              ) : (
                audioUrl && (
                  <AudioPlayer
                    src={audioUrl}
                    mediaRefCallback={(element) => {
                      mediaRef.current = element;
                    }}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={applyPendingSeek}
                    onError={() => setMediaError(true)}
                  />
                )
              )}
              {mediaError && (
                <div className={styles.mediaError}>
                  <VideoOff size={23} />
                  <p>The recording couldn&apos;t load.</p>
                  <small>
                    Refresh this page to request a fresh recording link.
                  </small>
                  {audioUrl && !useAudio && videoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setUseAudio(true);
                        setMediaError(false);
                      }}
                    >
                      Use audio recording
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        ) : (
          <div className={styles.noRecording}>
            <AudioLines size={18} />
            <div>
              <strong>
                {status === "done"
                  ? "Transcript-only meeting"
                  : "The conversation is being prepared"}
              </strong>
              <p>
                {status === "done"
                  ? "Your notes and source excerpts are available in the side panel."
                  : "The recording will appear here when it is available."}
              </p>
            </div>
          </div>
        )}

      </div>
      <section
        className={styles.insightsPanel}
        aria-label="Meeting notes, transcript and chat"
      >
        <div
          className={styles.insightsHeading}
          role="tablist"
          aria-label="Meeting insights"
        >
          {(
            [
              { id: "notes", label: "Meeting notes", icon: FileText },
              { id: "transcript", label: "Transcript", icon: ScrollText },
              { id: "chat", label: "Ask Rika", icon: MessageSquareText },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`detail-tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              aria-controls={`detail-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const tabs = ["notes", "transcript", "chat"] as const;
                  const direction = event.key === "ArrowLeft" ? -1 : 1;
                  const next =
                    event.key === "Home"
                      ? tabs[0]
                      : event.key === "End"
                        ? tabs[2]
                        : tabs[(tabs.indexOf(tab) + direction + tabs.length) % tabs.length];
                  setTab(next);
                  document.getElementById(`detail-tab-${next}`)?.focus();
                }
              }}
              data-active={tab === id}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        {notice && (
          <div className={styles.notice} role="status">
            {notice}
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss playback notice"
            >
              ×
            </button>
          </div>
        )}
        <div
          id="detail-panel-notes"
          role="tabpanel"
          aria-labelledby="detail-tab-notes"
          hidden={tab !== "notes"}
          className={styles.notesBody}
        >
          <MeetingNotes
            meetingId={meetingId}
            summary={summary}
            actionItems={actionItems}
            highlights={highlights}
            onSeek={seekTo}
            canGenerate={canGenerate}
            hideRegenerate
          />
        </div>
        <div
          id="detail-panel-transcript"
          role="tabpanel"
          className={styles.transcriptPanel}
          aria-labelledby="detail-tab-transcript"
          hidden={tab !== "transcript"}
        >
          <div className={styles.panelHeading}>
            <h2 id="transcript-heading">Transcript</h2>
            <span>
              {chunks.length} excerpt{chunks.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className={styles.transcriptBody}>
            <TranscriptViewer
              chunks={chunks}
              visible={tab === "transcript"}
              onSeek={hasRecording ? seekTo : undefined}
              activeChunkId={citedChunk?.id ?? activeChunkId}
              focusRequest={
                citedChunk ? { id: citedChunk.id, sequence: 0 } : focusRequest
              }
              className={styles.transcriptViewer}
            />
          </div>
        </div>
        <div
          id="detail-panel-chat"
          role="tabpanel"
          aria-labelledby="detail-tab-chat"
          hidden={tab !== "chat"}
          className={styles.chatBody}
        >
          <ChatPanel
            key={meetingId}
            meetingId={meetingId}
            onCitation={handleCitation}
            suggestions={[
              "What did we decide?",
              "What are the next steps?",
              "Summarize the key points",
            ]}
          />
        </div>
      </section>
    </div>
  );
}
