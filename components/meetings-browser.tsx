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
  const haystack = `${meeting.title ?? ""} ${meeting.meetingUrl} ${meeting.platform ?? ""}`.toLowerCase();
  return haystack.includes(query);
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
        <div className="relative max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-muted"
            strokeWidth={1.75}
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meetings..."
            className="w-full pl-10"
          />
        </div>
      )}

      {isSearching ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[13px] tracking-wider text-ink-muted uppercase">
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </h2>
          <MeetingList
            meetings={filtered}
            categories={categories}
            emptyLabel="No meetings match your search."
          />
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="font-mono text-[13px] tracking-wider text-ink-muted uppercase">
              Upcoming &amp; in progress
            </h2>
            <MeetingList
              meetings={upcoming}
              categories={categories}
              emptyLabel="Nothing scheduled — join a meeting or connect your calendar."
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-mono text-[13px] tracking-wider text-ink-muted uppercase">
              Past
            </h2>
            <MeetingList
              meetings={past}
              categories={categories}
              emptyLabel="No completed meetings yet."
            />
          </section>

          {failed.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="font-mono text-[13px] tracking-wider text-rec uppercase">
                Failed to join
              </h2>
              <MeetingList meetings={failed} categories={categories} emptyLabel="" />
            </section>
          )}
        </>
      )}
    </div>
  );
}
