export interface AgendaEvent {
  id: string;
  start_time: string;
  end_time: string;
  title: string | null;
  accountEmail: string | null;
  bots?: { bot_id: string }[];
}
export type AgendaFilter = "all" | "scheduled" | "unscheduled";

export function filterAgenda<T extends AgendaEvent>(events: T[], filter: AgendaFilter, query: string): T[] {
  const term = query.trim().toLowerCase();
  return events.filter((event) => {
    const scheduled = Boolean(event.bots?.length);
    return (filter === "all" || (filter === "scheduled" ? scheduled : !scheduled)) &&
      (!term || `${event.title ?? "Untitled meeting"} ${event.accountEmail ?? ""}`.toLowerCase().includes(term));
  });
}
function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
export function groupAgenda<T extends AgendaEvent>(events: T[], now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const groups = new Map<string, { key: string; label: string; date: Date; events: T[] }>();
  const sorted = [...events].sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  for (const event of sorted) {
    const date = new Date(event.start_time);
    const key = dayKey(date);
    if (!groups.has(key)) groups.set(key, {
      key, date,
      label: key === dayKey(now) ? "Today" : key === dayKey(tomorrow) ? "Tomorrow" : date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
      events: [],
    });
    groups.get(key)!.events.push(event);
  }
  return [...groups.values()];
}
export function agendaDuration(start: string, end: string): string | null {
  const minutes = Math.round((Date.parse(end) - Date.parse(start)) / 60000);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes} min`;
}
