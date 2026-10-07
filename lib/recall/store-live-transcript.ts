export interface LiveTranscriptChunk {
  id: string;
  meetingId: string;
  userId: string;
  speaker: string | null;
  startMs: number;
  endMs: number;
  text: string;
}

export interface LiveTranscriptWriter {
  embed(text: string): Promise<number[]>;
  isActive(): Promise<boolean>;
  upsertVector(chunk: LiveTranscriptChunk, vector: number[]): Promise<void>;
  saveChunk(chunk: LiveTranscriptChunk): Promise<void>;
  removeChunk(id: string): Promise<void>;
}

// Persist the vector before the transcript row. Redelivery repairs either
// partial write using the same id instead of skipping an incomplete row.
export async function storeLiveTranscript(
  chunk: LiveTranscriptChunk,
  writer: LiveTranscriptWriter,
): Promise<void> {
  const vector = await writer.embed(chunk.text);
  if (!(await writer.isActive())) return;
  try {
    await writer.upsertVector(chunk, vector);
    if (!(await writer.isActive())) return;
    await writer.saveChunk(chunk);
  } finally {
    // Finalization may start while an external write is in flight. Remove
    // this live-only id without touching the rebuilt canonical transcript.
    if (!(await writer.isActive())) await writer.removeChunk(chunk.id);
  }
}
