"use client";

import { useState } from "react";
import Link from "next/link";

interface JoinedMeeting {
  id: string;
  status: string;
  platform: string | null;
  meetingUrl: string;
}

export default function JoinNowPage() {
  const [meetingUrl, setMeetingUrl] = useState("");
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
      body: JSON.stringify({ meetingUrl }),
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
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Join a meeting now</h1>
      <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Meeting link
          <input
            type="url"
            required
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="https://zoom.us/j/... or meet.google.com/... or teams.microsoft.com/..."
            className="rounded border border-black/[.15] bg-transparent px-3 py-2 text-sm dark:border-white/[.2]"
          />
        </label>
        <button
          type="submit"
          disabled={status === "joining"}
          className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {status === "joining" ? "Sending bot..." : "Join now"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {joined && (
        <div className="max-w-lg rounded border border-black/[.08] p-4 text-sm dark:border-white/[.145]">
          <p className="font-medium">Bot dispatched</p>
          <dl className="mt-2 flex flex-col gap-1 text-zinc-600 dark:text-zinc-400">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0">Status</dt>
              <dd>{joined.status}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0">Platform</dt>
              <dd>{joined.platform ?? "unknown"}</dd>
            </div>
          </dl>
          <Link
            href={`/meetings/${joined.id}`}
            className="mt-3 inline-block underline"
          >
            View meeting →
          </Link>
        </div>
      )}
    </div>
  );
}
