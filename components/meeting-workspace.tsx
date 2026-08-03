"use client";

import { useEffect, useRef, useState } from "react";
import { AudioPlayer } from "@/components/audio-player";
import { ChatPanel } from "@/components/chat-panel";
import { TranscriptViewer, type TranscriptChunkItem } from "@/components/transcript-viewer";

type Tab = "transcript" | "chat";

export function MeetingWorkspace({
  meetingId,
  chunks,
  videoUrl,
  audioUrl,
}: {
  meetingId: string;
  chunks: TranscriptChunkItem[];
  videoUrl: string | null;
  audioUrl: string | null;
}) {
  const [tab, setTab] = useState<Tab>("transcript");
  const [activeChunkId, setActiveChunkId] = useState<string | null>(null);
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const hasRecording = Boolean(videoUrl || audioUrl);

  function handleSeek(startMs: number) {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = startMs / 1000;
    void media.play();
  }

  function handleTimeUpdate() {
    const media = mediaRef.current;
    if (!media) return;
    const currentMs = media.currentTime * 1000;

    let current: TranscriptChunkItem | null = null;
    for (const chunk of chunks) {
      if (chunk.startMs > currentMs) break;
      current = chunk;
    }
    setActiveChunkId(current?.id ?? null);
  }

  useEffect(() => {
    if (!activeChunkId) return;
    transcriptRef.current
      ?.querySelector(`[data-chunk-id="${activeChunkId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeChunkId]);

  return (
    <div
      className={`grid min-h-0 flex-1 gap-6 ${
        hasRecording
          ? "lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,1fr)] lg:grid-rows-1"
          : ""
      }`}
    >
      {hasRecording && (
        <div className="flex min-h-[240px] min-w-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-ink lg:min-h-0">
          {videoUrl ? (
            <video
              ref={(el) => {
                mediaRef.current = el;
              }}
              src={videoUrl}
              controls
              preload="metadata"
              playsInline
              onTimeUpdate={handleTimeUpdate}
              className="h-full max-h-[min(56vh,720px)] w-full bg-ink object-contain lg:max-h-none"
            />
          ) : (
            audioUrl && (
              <div className="w-full p-4">
                <AudioPlayer
                  src={audioUrl}
                  mediaRefCallback={(el) => {
                    mediaRef.current = el;
                  }}
                  onTimeUpdate={handleTimeUpdate}
                />
              </div>
            )
          )}
        </div>
      )}

      <div className="flex min-h-[min(50vh,420px)] min-w-0 flex-col gap-3 lg:min-h-0">
        <div className="flex shrink-0 items-center gap-5 border-b border-line font-mono text-[13px] tracking-wider uppercase">
          <button
            type="button"
            onClick={() => setTab("transcript")}
            className={`border-b-2 pb-2 transition-colors ${
              tab === "transcript"
                ? "border-rec text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Transcript
          </button>
          <button
            type="button"
            onClick={() => setTab("chat")}
            className={`border-b-2 pb-2 transition-colors ${
              tab === "chat"
                ? "border-rec text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Ask Rika
          </button>
        </div>

        {tab === "transcript" ? (
          <div ref={transcriptRef} className="min-h-0 flex-1">
            <TranscriptViewer
              chunks={chunks}
              onSeek={hasRecording ? handleSeek : undefined}
              activeChunkId={activeChunkId}
              className="h-full max-h-[min(50vh,420px)] lg:max-h-none"
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ChatPanel meetingId={meetingId} />
          </div>
        )}
      </div>
    </div>
  );
}
