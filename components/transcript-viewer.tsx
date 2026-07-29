export interface TranscriptChunkItem {
  id: string;
  speaker: string | null;
  startMs: number;
  text: string;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function TranscriptViewer({ chunks }: { chunks: TranscriptChunkItem[] }) {
  if (chunks.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No transcript available yet.</p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {chunks.map((chunk) => (
        <li key={chunk.id} className="text-sm">
          <div className="flex gap-2 text-zinc-500">
            <span className="font-medium text-foreground">
              {chunk.speaker ?? "Unknown"}
            </span>
            <span>{formatTimestamp(chunk.startMs)}</span>
          </div>
          <p>{chunk.text}</p>
        </li>
      ))}
    </ol>
  );
}
