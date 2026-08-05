"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { MeetingList, type MeetingListItem } from "@/components/meeting-list";
import { Input } from "@/components/ui/input";

interface Category {
  id: string;
  name: string;
}

function matches(meeting: MeetingListItem, query: string): boolean {
  const haystack =
    `${meeting.title ?? ""} ${meeting.meetingUrl} ${meeting.platform ?? ""} ${meeting.summary ?? ""}`.toLowerCase();
  return haystack.includes(query);
}

function Section({
  label,
  count,
  accent,
  children,
}: {
  label: string;
  count: number;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className={`section-label ${accent ? "text-rec" : ""}`}
        >
          {label}
        </h2>
        <span className="font-mono text-[11px] text-ink-muted tabular-nums">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

export function MeetingsBrowser({
  meetings,
  categories,
}: {
  meetings: MeetingListItem[];
  categories: Category[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? meetings.filter((m) => matches(m, q)) : meetings;
  }, [meetings, query]);

  const failed = filtered.filter((m) => m.status.startsWith("fatal"));
  const past = filtered.filter((m) => m.status === "done");
  const upcoming = filtered.filter(
    (m) => m.status !== "done" && !m.status.startsWith("fatal"),
  );

  const isSearching = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-8">
      {meetings.length > 0 && (
        <div className="relative max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-muted"
            strokeWidth={1.75}
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, platform, notes…"
            className="w-full bg-white/60 pl-10"
          />
        </div>
      )}

      {isSearching ? (
        <Section label="Search results" count={filtered.length}>
          <MeetingList
            meetings={filtered}
            categories={categories}
            emptyLabel="No meetings match your search."
          />
        </Section>
      ) : (
        <>
          <Section label="Live & upcoming" count={upcoming.length}>
            <MeetingList
              meetings={upcoming}
              categories={categories}
              emptyLabel="Nothing scheduled — join a meeting above or connect your calendar."
            />
          </Section>

          <Section label="Past captures" count={past.length}>
            <MeetingList
              meetings={past}
              categories={categories}
              emptyLabel="No completed meetings yet."
            />
          </Section>

          {failed.length > 0 && (
            <Section label="Failed to join" count={failed.length} accent>
              <MeetingList
                meetings={failed}
                categories={categories}
                emptyLabel=""
              />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
