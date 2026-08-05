import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

export interface TranscriptChunkItem {
  id: string;
  speaker: string | null;
  startMs: number;
  text: string;
}

const AVATAR_COLORS = [
  "#1F6F54",
  "#B45309",
  "#6D28D9",
  "#BE185D",
  "#1D4ED8",
  "#0F766E",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function SpeakerAvatar({ name }: { name: string | null }) {
  const label = name ?? "?";
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-medium text-white"
      style={{ backgroundColor: colorFor(label) }}
    >
      {label[0]?.toUpperCase() ?? "?"}
    </span>
  );
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function TranscriptViewer({
  chunks,
  onSeek,
  activeChunkId,
  className,
}: {
  chunks: TranscriptChunkItem[];
  /** Omit to render read-only timestamps (no recording to seek). */
  onSeek?: (startMs: number) => void;
  activeChunkId?: string | null;
  className?: string;
}) {
  if (chunks.length === 0) {
    return <EmptyState>No transcript available yet.</EmptyState>;
  }

  return (
    <div className={cn("max-h-[min(70vh,640px)] overflow-y-auto", className)}>
      <ol className="flex flex-col gap-1">
        {chunks.map((chunk) => {
          const isActive = chunk.id === activeChunkId;
          return (
            <li
              key={chunk.id}
              data-chunk-id={chunk.id}
              className={`flex gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                isActive
                  ? "bg-white shadow-[inset_3px_0_0_0_var(--color-rec)]"
                  : "hover:bg-white/60"
              }`}
            >
              <SpeakerAvatar name={chunk.speaker} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-ink">
                    {chunk.speaker ?? "Unknown"}
                  </span>
                  {onSeek ? (
                    <button
                      type="button"
                      onClick={() => onSeek(chunk.startMs)}
                      className="font-mono text-[11px] tracking-wide text-ink-muted tabular-nums underline-offset-2 hover:text-ink hover:underline"
                    >
                      {formatTimestamp(chunk.startMs)}
                    </button>
                  ) : (
                    <span className="font-mono text-[11px] tracking-wide text-ink-muted tabular-nums">
                      {formatTimestamp(chunk.startMs)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[14px] leading-relaxed text-ink-muted">
                  {chunk.text}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
