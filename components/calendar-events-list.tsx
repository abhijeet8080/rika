"use client";

import { CalendarCheck2, CalendarDays, Check, ChevronDown, Clock3, Link2Off, Mic, RefreshCw, Search, SlidersHorizontal, Video, X } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toaster";
import { Switch } from "@/components/ui/switch";
import { useCategories } from "@/lib/hooks/use-categories";
import { agendaDuration, filterAgenda, groupAgenda, type AgendaFilter } from "@/lib/calendar-agenda";
import styles from "./calendar-workspace.module.css";

interface CalendarEvent {
  id: string;
  calendarConnectionId: string;
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
type Props = { hasConnections: boolean; refreshKey?: number; connectionCount?: number };
const FILTERS = [{ id: "all", label: "All upcoming" }, { id: "scheduled", label: "Rika will join" }, { id: "unscheduled", label: "Not scheduled" }] as const;

function CalendarEventsListContent({ hasConnections, refreshKey = 0, connectionCount = 0 }: Props) {
  const params = useSearchParams();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loaded, setLoaded] = useState(!hasConnections);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [filter, setFilter] = useState<AgendaFilter>("all");
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [recordErrors, setRecordErrors] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState<Record<string, string | null>>({});
  const [videoPrefs, setVideoPrefs] = useState<Record<string, boolean>>({});
  const [audioPrefs, setAudioPrefs] = useState<Record<string, boolean>>({});
  const { categories } = useCategories();
  const { toast } = useToast();
  const filtered = filterAgenda(events, filter, query);
  const groups = groupAgenda(filtered);
  const scheduledCount = events.filter((event) => event.bots?.length).length;

  function selectedCategoryFor(id: string) {
    const categoryId = selectedCategory[id];
    return categoryId && categories.some((category) => category.id === categoryId) ? categoryId : null;
  }

  useEffect(() => {
    if (!hasConnections) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/calendar/events", { signal: controller.signal });
        if (!response.ok) throw new Error("We couldn’t load your calendar. Please try again.");
        const body = await response.json();
        if (controller.signal.aborted) return;
        setEvents((body.events as CalendarEvent[]).filter((event) => !event.is_deleted));
        setLoadError(null);
        setLoaded(true);
      } catch {
        if (!controller.signal.aborted) {
          setLoadError("We couldn’t load your calendar. Please try again.");
          setLoaded(true);
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [hasConnections, refreshKey, retryKey]);

  async function handleRecord(event: CalendarEvent) {
    if (schedulingId || !event.meeting_url || event.bots?.length) return;
    setSchedulingId(event.id);
    setRecordErrors((previous) => ({ ...previous, [event.id]: "" }));
    try {
      const response = await fetch(`/api/calendar/events/${event.id}/schedule`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icalUid: event.ical_uid, calendarConnectionId: event.calendarConnectionId,
          categoryId: selectedCategoryFor(event.id), recordVideo: videoPrefs[event.id] ?? true, recordAudio: audioPrefs[event.id] ?? true }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn’t schedule this recording. Try again.");
      }
      setEvents((previous) => previous.map((item) => item.id === event.id ? { ...item, bots: [{ bot_id: "pending" }] } : item));
      toast({ title: "Rika will join this meeting", description: "Your recording is scheduled.", tone: "success" });
    } catch (error) {
      setRecordErrors((previous) => ({ ...previous, [event.id]: error instanceof Error ? error.message : "Couldn’t reach the server. Try again." }));
    } finally { setSchedulingId(null); }
  }

  return (
    <section className={styles.agenda} aria-labelledby="agenda-title">
      {params.get("error") && <p className={styles.error} role="alert">{params.get("error")}</p>}
      {params.get("connected") && <p className={styles.success} role="status"><Check size={15} />{params.get("connected") === "google" ? "Google" : "Outlook"} Calendar connected.</p>}
      <div className={styles.agendaHeader}><div><h2 id="agenda-title">Your agenda</h2><p>{hasConnections ? `${connectionCount} connected calendar${connectionCount === 1 ? "" : "s"}. Times are shown in your local timezone.` : "Your upcoming conversations will appear here."}</p></div>{hasConnections && <button type="button" className={styles.refresh} onClick={() => setRetryKey((key) => key + 1)} aria-label="Refresh calendar"><RefreshCw size={15} />Refresh</button>}</div>
      {hasConnections && <div className={styles.agendaToolbar}>
        <div className={styles.filters} role="group" aria-label="Filter meetings">{FILTERS.map(({ id, label }) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}<span>{id === "all" ? events.length : id === "scheduled" ? scheduledCount : events.length - scheduledCount}</span></button>)}</div>
        <div className={styles.search}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a meeting…" aria-label="Search calendar meetings" />{query && <button type="button" aria-label="Clear meeting search" onClick={() => setQuery("")}><X size={14} /></button>}</div>
      </div>}
      {loadError && <div className={styles.error} role="alert">{loadError}<button type="button" onClick={() => setRetryKey((key) => key + 1)}>Try again</button></div>}
      {!loaded ? <div className={styles.loading} role="status"><RefreshCw size={18} />Finding your upcoming meetings…</div>
        : !hasConnections ? <div className={styles.disconnected}><CalendarDays size={19} /><p>Connect a calendar to get started.</p></div>
        : filtered.length === 0 && !loadError ? <div className={styles.empty}><span><CalendarCheck2 size={28} strokeWidth={1.5} /></span><h3>{query || filter !== "all" ? "No meetings match this view." : "You’re all caught up."}</h3><p>{query || filter !== "all" ? "Try another search or show all upcoming meetings." : "When new invitations arrive, you’ll find them here."}</p>{(query || filter !== "all") && <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Show all meetings</button>}</div>
        : <div className={styles.days}>{groups.map((group) => <section key={group.key} className={styles.day} aria-label={group.label}>
          <div className={styles.dayHeading}><span className={styles.dateMarker}><strong>{group.date.getDate()}</strong><small>{group.date.toLocaleDateString(undefined, { month: "short" })}</small></span><div><h3>{group.label}</h3><p>{group.events.length} meeting{group.events.length === 1 ? "" : "s"}</p></div></div>
          <ul className={styles.events}>{group.events.map((event) => {
            const scheduled = Boolean(event.bots?.length);
            const expanded = expandedIds.includes(event.id);
            const pending = schedulingId === event.id;
            const duration = agendaDuration(event.start_time, event.end_time);
            return <li key={event.id} className={styles.event}>
              <div className={styles.eventMain}><div className={styles.time}><strong>{new Date(event.start_time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</strong>{duration && <span><Clock3 size={11} />{duration}</span>}</div>
                <div className={styles.eventInfo}><h4>{event.title ?? "Untitled meeting"}</h4><p><CalendarDays size={12} />{event.accountEmail ?? (event.provider === "google" ? "Google Calendar" : "Outlook Calendar")}</p></div>
                <div className={styles.eventActions}>{scheduled ? <span className={styles.scheduled}><Check size={14} />Rika will join</span> : !event.meeting_url ? <span className={styles.noLink}><Link2Off size={14} />No meeting link</span> : <button type="button" className={styles.schedule} disabled={schedulingId !== null} onClick={() => handleRecord(event)}>{pending ? "Scheduling…" : "Schedule recording"}</button>}</div>
              </div>
              {!scheduled && event.meeting_url && <div className={styles.optionsRow}><button type="button" className={styles.optionsTrigger} aria-expanded={expanded} aria-controls={`options-${event.id}`} onClick={() => setExpandedIds((ids) => expanded ? ids.filter((id) => id !== event.id) : [...ids, event.id])}><SlidersHorizontal size={13} />Recording options<ChevronDown size={13} data-open={expanded} /></button><span>{videoPrefs[event.id] ?? true ? "Video" : "No video"} · {audioPrefs[event.id] ?? true ? "Audio" : "No audio"}</span></div>}
              {expanded && !scheduled && event.meeting_url && <div id={`options-${event.id}`} className={styles.options}>
                <label className={styles.category}><span>Save to category</span><select value={selectedCategoryFor(event.id) ?? ""} disabled={pending} onChange={(e) => setSelectedCategory((values) => ({ ...values, [event.id]: e.target.value || null }))}><option value="">Uncategorized</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <div className={styles.recordOption}><span><Video size={16} />Video recording</span><Switch aria-label={`Video recording for ${event.title ?? "Untitled meeting"}`} checked={videoPrefs[event.id] ?? true} disabled={pending} onCheckedChange={(value) => setVideoPrefs((values) => ({ ...values, [event.id]: value }))} /></div>
                <div className={styles.recordOption}><span><Mic size={16} />Audio recording</span><Switch aria-label={`Audio recording for ${event.title ?? "Untitled meeting"}`} checked={audioPrefs[event.id] ?? true} disabled={pending} onCheckedChange={(value) => setAudioPrefs((values) => ({ ...values, [event.id]: value }))} /></div>
              </div>}
              {recordErrors[event.id] && <p className={styles.recordError} role="alert">{recordErrors[event.id]}</p>}
            </li>;
          })}</ul>
        </section>)}</div>}
    </section>
  );
}
export function CalendarEventsList(props: Props) {
  return <Suspense fallback={<div className={styles.loading}>Loading your agenda…</div>}><CalendarEventsListContent {...props} /></Suspense>;
}
