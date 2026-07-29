"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface CalendarEvent {
  id: string;
  ical_uid: string;
  start_time: string;
  end_time: string;
  meeting_url?: string | null;
  bot_id?: string | null;
  is_deleted: boolean;
}

function CalendarSettingsContent() {
  const searchParams = useSearchParams();
  const connectError = searchParams.get("error");

  const [connected, setConnected] = useState<boolean | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch("/api/calendar/events");
      if (cancelled) return;

      if (res.status === 404) {
        setConnected(false);
        return;
      }
      if (!res.ok) {
        setLoadError(`Failed to load events (${res.status})`);
        return;
      }

      const body = await res.json();
      setConnected(true);
      setEvents(
        (body.events as CalendarEvent[]).filter((e) => !e.is_deleted),
      );
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRecord(event: CalendarEvent) {
    setSchedulingId(event.id);
    const res = await fetch(`/api/calendar/events/${event.id}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icalUid: event.ical_uid }),
    });
    setSchedulingId(null);

    if (res.ok) {
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, bot_id: "pending" } : e)),
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Calendar</h1>

      {connectError && (
        <p className="max-w-lg text-sm text-red-600">{connectError}</p>
      )}
      {loadError && <p className="max-w-lg text-sm text-red-600">{loadError}</p>}

      {connected === null && (
        <p className="text-sm text-zinc-500">Loading…</p>
      )}

      {connected === false && (
        <a
          href="/api/calendar/connect"
          className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background"
        >
          Connect Google Calendar
        </a>
      )}

      {connected === true && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-zinc-500">
            Google Calendar connected. Choose which upcoming meetings to
            record.
          </p>
          {events.length === 0 && (
            <p className="text-sm text-zinc-500">No upcoming meetings found.</p>
          )}
          <ul className="flex max-w-lg flex-col gap-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between rounded border border-black/[.08] p-3 text-sm dark:border-white/[.145]"
              >
                <div>
                  <p>{new Date(event.start_time).toLocaleString()}</p>
                  <p className="text-zinc-500">
                    {event.meeting_url ?? "No meeting link"}
                  </p>
                </div>
                <button
                  onClick={() => handleRecord(event)}
                  disabled={
                    !event.meeting_url ||
                    !!event.bot_id ||
                    schedulingId === event.id
                  }
                  className="rounded-full border border-black/[.15] px-4 py-1.5 disabled:opacity-50 dark:border-white/[.2]"
                >
                  {event.bot_id
                    ? "Recording"
                    : schedulingId === event.id
                      ? "Scheduling..."
                      : "Record"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function CalendarSettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <CalendarSettingsContent />
    </Suspense>
  );
}
