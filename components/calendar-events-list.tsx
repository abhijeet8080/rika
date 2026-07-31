"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/empty-state";

interface CalendarEvent {
  id: string;
  ical_uid: string;
  start_time: string;
  end_time: string;
  meeting_url?: string | null;
  title: string | null;
  bots?: { bot_id: string }[];
  is_deleted: boolean;
  provider: string;
  accountEmail: string | null;
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  microsoft_outlook: "Outlook",
};

function CalendarEventsListContent({
  hasConnections,
}: {
  hasConnections: boolean;
}) {
  const searchParams = useSearchParams();
  const connectError = searchParams.get("error");
  const justConnected = searchParams.get("connected");

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(!hasConnections);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!hasConnections) return;
    let cancelled = false;

    async function load() {
      const res = await fetch("/api/calendar/events");
      if (cancelled) return;
      if (res.status === 404) {
        setLoaded(true);
        return;
      }
      if (!res.ok) {
        setLoadError(`Failed to load events (${res.status})`);
        setLoaded(true);
        return;
      }
      const body = await res.json();
      setEvents((body.events as CalendarEvent[]).filter((e) => !e.is_deleted));
      setLoaded(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hasConnections]);

  async function handleRecord(event: CalendarEvent) {
    setSchedulingId(event.id);
    setRecordErrors((prev) => {
      const next = { ...prev };
      delete next[event.id];
      return next;
    });

    let res: Response;
    try {
      res = await fetch(`/api/calendar/events/${event.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icalUid: event.ical_uid }),
      });
    } catch {
      setSchedulingId(null);
      setRecordErrors((prev) => ({
        ...prev,
        [event.id]: "Network error — could not reach the server.",
      }));
      return;
    }
    setSchedulingId(null);

    if (res.ok) {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id ? { ...e, bots: [{ bot_id: "pending" }] } : e,
        ),
      );
      return;
    }

    const body = await res.json().catch(() => ({}));
    setRecordErrors((prev) => ({
      ...prev,
      [event.id]: body.error ?? `Request failed (${res.status})`,
    }));
  }

  return (
    <div className="flex flex-col gap-3">
      {connectError && (
        <p className="font-mono text-[12px] text-rec">{connectError}</p>
      )}
      {justConnected && (
        <p className="font-mono text-[12px] text-moss">
          {justConnected === "google" ? "Google" : "Outlook"} Calendar
          connected.
        </p>
      )}
      {loadError && <p className="font-mono text-[12px] text-rec">{loadError}</p>}

      {!loaded ? (
        <p className="font-mono text-[12px] text-ink-muted">Loading…</p>
      ) : events.length === 0 ? (
        <EmptyState>
          {hasConnections
            ? "No upcoming meetings found."
            : "Connect a calendar above to see upcoming meetings here."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-2 rounded-xl border border-line bg-card p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {event.title ?? "Untitled meeting"}
                  </p>
                  <p className="truncate font-mono text-[12px] text-ink-muted">
                    {new Date(event.start_time).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    ·{" "}
                    {event.accountEmail ??
                      PROVIDER_LABELS[event.provider] ??
                      event.provider}
                  </p>
                </div>
                <button
                  onClick={() => handleRecord(event)}
                  disabled={
                    !event.meeting_url ||
                    !!event.bots?.length ||
                    schedulingId === event.id
                  }
                  className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm text-ink transition-colors hover:border-ink/30 disabled:opacity-50"
                >
                  {event.bots?.length
                    ? "Recording"
                    : schedulingId === event.id
                      ? "Scheduling…"
                      : "Record"}
                </button>
              </div>
              {recordErrors[event.id] && (
                <p className="font-mono text-[12px] text-rec">
                  {recordErrors[event.id]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CalendarEventsList({
  hasConnections,
}: {
  hasConnections: boolean;
}) {
  return (
    <Suspense
      fallback={
        <p className="font-mono text-[12px] text-ink-muted">Loading…</p>
      }
    >
      <CalendarEventsListContent hasConnections={hasConnections} />
    </Suspense>
  );
}
