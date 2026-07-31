"use client";

import { ArrowRight, Mic, MicOff, Video, VideoOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface JoinedMeeting {
  id: string;
  status: string;
  platform: string | null;
  meetingUrl: string;
}

export function JoinMeetingForm() {
  const router = useRouter();
  const [meetingUrl, setMeetingUrl] = useState("");
  const [recordVideo, setRecordVideo] = useState(true);
  const [recordAudio, setRecordAudio] = useState(true);
  const [status, setStatus] = useState<"idle" | "joining" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<JoinedMeeting | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("joining");
    setError(null);
    setJoined(null);

    const res = await fetch("/api/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingUrl, recordVideo, recordAudio }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body.error ?? `Request failed (${res.status})`);
      setStatus("error");
      return;
    }

    setJoined(body.meeting);
    setStatus("idle");
    setMeetingUrl("");
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="url"
          required
          value={meetingUrl}
          onChange={(e) => setMeetingUrl(e.target.value)}
          placeholder="Paste a Zoom, Meet, or Teams link..."
          disabled={status === "joining"}
          className="w-full sm:w-72"
        />
        <button
          type="submit"
          disabled={status === "joining"}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink/85 disabled:opacity-50"
        >
          {status === "joining" ? "Joining…" : "Join now"}
          {status !== "joining" && (
            <ArrowRight className="h-4 w-4" strokeWidth={2} />
          )}
        </button>
      </form>

      <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
        <button
          type="button"
          onClick={() => setRecordVideo((v) => !v)}
          disabled={status === "joining"}
          aria-pressed={recordVideo}
          className={`flex items-center gap-1 rounded-full border px-2 py-1 transition-colors disabled:opacity-50 ${
            recordVideo
              ? "border-ink/30 text-ink"
              : "border-line text-ink-muted"
          }`}
        >
          {recordVideo ? (
            <Video className="h-3 w-3" strokeWidth={1.75} />
          ) : (
            <VideoOff className="h-3 w-3" strokeWidth={1.75} />
          )}
          Video
        </button>
        <button
          type="button"
          onClick={() => setRecordAudio((v) => !v)}
          disabled={status === "joining"}
          aria-pressed={recordAudio}
          className={`flex items-center gap-1 rounded-full border px-2 py-1 transition-colors disabled:opacity-50 ${
            recordAudio
              ? "border-ink/30 text-ink"
              : "border-line text-ink-muted"
          }`}
        >
          {recordAudio ? (
            <Mic className="h-3 w-3" strokeWidth={1.75} />
          ) : (
            <MicOff className="h-3 w-3" strokeWidth={1.75} />
          )}
          Audio
        </button>
      </div>

      {error && <p className="font-mono text-[12px] text-rec">{error}</p>}

      {joined && (
        <p className="font-mono text-[12px] text-ink-muted">
          Bot dispatched to {joined.platform ?? "the call"} ·{" "}
          <Link
            href={`/meetings/${joined.id}`}
            className="text-ink underline underline-offset-2"
          >
            view meeting
          </Link>
        </p>
      )}
    </div>
  );
}
