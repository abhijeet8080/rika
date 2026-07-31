"use client";

import { Download, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { useRef, useState } from "react";

const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;
const SKIP_SECONDS = 10;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "00:00";
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({
  src,
  mediaRefCallback,
  onTimeUpdate,
}: {
  src: string;
  /** Also hands the element to the caller — e.g. MeetingWorkspace's shared mediaRef, so transcript timestamp clicks can keep seeking it. */
  mediaRefCallback: (el: HTMLAudioElement | null) => void;
  onTimeUpdate?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  function skip(deltaSeconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(
      Math.max(audio.currentTime + deltaSeconds, 0),
      duration || audio.currentTime + deltaSeconds,
    );
  }

  function cycleSpeed() {
    const audio = audioRef.current;
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio) audio.playbackRate = next;
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-card px-4 py-3">
      <audio
        ref={(el) => {
          audioRef.current = el;
          mediaRefCallback(el);
        }}
        src={src}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
          onTimeUpdate?.();
        }}
      />

      <span className="shrink-0 font-mono text-[12px] text-ink-muted tabular-nums">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <div className="flex flex-1 items-center justify-center gap-3">
        <button
          type="button"
          onClick={cycleSpeed}
          className="rounded-full border border-line px-2 py-1 font-mono text-[11px] text-ink-muted hover:border-ink/30 hover:text-ink"
        >
          {speed}×
        </button>
        <button
          type="button"
          onClick={() => skip(-SKIP_SECONDS)}
          aria-label={`Back ${SKIP_SECONDS} seconds`}
          className="text-ink-muted hover:text-ink"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-colors hover:bg-ink/85"
        >
          {playing ? (
            <Pause className="h-4 w-4" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play className="ml-0.5 h-4 w-4" fill="currentColor" strokeWidth={0} />
          )}
        </button>
        <button
          type="button"
          onClick={() => skip(SKIP_SECONDS)}
          aria-label={`Forward ${SKIP_SECONDS} seconds`}
          className="text-ink-muted hover:text-ink"
        >
          <RotateCw className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <a
        href={src}
        download
        target="_blank"
        rel="noreferrer"
        aria-label="Download recording"
        className="shrink-0 text-ink-muted hover:text-ink"
      >
        <Download className="h-4 w-4" strokeWidth={1.75} />
      </a>
    </div>
  );
}
