const RRF_K = 60;

export interface RetrievedChunk {
  id: string;
  text: string;
  speaker: string | null;
  startMs: number;
  endMs: number;
  meetingId: string;
  /** Reciprocal-rank-fusion score. Neighbour chunks use 0. */
  score: number;
  isNeighbor?: boolean;
}

export type ScopedMeeting = {
  id: string;
  title: string | null;
  endedAt: Date | null;
  scheduledStart: Date | null;
  createdAt: Date;
  status: string;
  summary: string | null;
  actionItems: { text: string; assignee: string | null; dueHint: string | null }[] | null;
};

export function meetingTime(meeting: ScopedMeeting): number {
  return (meeting.endedAt ?? meeting.scheduledStart ?? meeting.createdAt).getTime();
}

export function selectMeetingsForPlan(meetingsInScope: ScopedMeeting[], plan: { meetingSelection: "scope" | "latest_completed" | "latest_two_completed" }) {
  const completed = meetingsInScope
    .filter((meeting) => meeting.status === "done")
    .sort((a, b) => meetingTime(b) - meetingTime(a));
  if (plan.meetingSelection === "latest_completed") return completed.slice(0, 1);
  if (plan.meetingSelection === "latest_two_completed") return completed.slice(0, 2);
  return meetingsInScope;
}

export function sampleChronology<T>(items: T[], maximum = 18): T[] {
  if (items.length <= maximum) return items;
  return Array.from({ length: maximum }, (_, index) =>
    items[Math.round((index * (items.length - 1)) / (maximum - 1))],
  );
}

export function fuseCandidates(dense: RetrievedChunk[], lexical: RetrievedChunk[], limit: number) {
  const merged = new Map<string, RetrievedChunk>();
  const scores = new Map<string, number>();
  for (const [rank, chunk] of dense.entries()) {
    merged.set(chunk.id, chunk);
    scores.set(chunk.id, (scores.get(chunk.id) ?? 0) + 1 / (RRF_K + rank + 1));
  }
  for (const [rank, chunk] of lexical.entries()) {
    merged.set(chunk.id, merged.get(chunk.id) ?? chunk);
    scores.set(chunk.id, (scores.get(chunk.id) ?? 0) + 1 / (RRF_K + rank + 1));
  }
  return [...merged.values()]
    .map((chunk) => ({ ...chunk, score: scores.get(chunk.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
