export type MeetingGroup = "completed" | "upcoming" | "attention" | "active";

/** Scheduled calls are distinct from bots joining, recording, or processing. */
export function meetingGroup(status: string): MeetingGroup {
  if (status === "done") return "completed";
  if (status.startsWith("fatal")) return "attention";
  if (status === "scheduled") return "upcoming";
  return "active";
}

export function meetingStatusLabel(status: string): string {
  if (status === "done") return "Ready";
  if (status.startsWith("fatal")) return "Needs attention";
  if (status === "scheduled") return "Upcoming";
  if (status === "in_call_recording") return "Recording";
  if (["call_ended", "recording_done", "analysis_done"].includes(status))
    return "Processing";
  if (status === "in_call_not_recording") return "In call";
  if (status === "in_waiting_room") return "Waiting to join";
  if (status === "joining" || status === "joining_call") return "Joining";
  return (
    status
      .split(/[_:]/)
      .filter(Boolean)
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(" ") || "Preparing"
  );
}
