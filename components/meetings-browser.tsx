"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  AudioLines,
  CalendarDays,
  Search,
  SlidersHorizontal,
  Video,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  MeetingList,
  platformLabel,
  type MeetingListItem,
} from "./meeting-list";
import { meetingGroup, meetingStatusLabel } from "@/lib/meeting-library";
import styles from "./meetings.module.css";

const views = [
  { id: "all", label: "All meetings" },
  { id: "completed", label: "Completed" },
  { id: "upcoming", label: "Upcoming" },
  { id: "attention", label: "Needs attention" },
] as const;
type View = (typeof views)[number]["id"];

function meetingTime(meeting: MeetingListItem) {
  const value =
    meeting.startedAt ?? meeting.scheduledStart ?? meeting.createdAt;
  return value ? new Date(value).getTime() : 0;
}

export function MeetingsBrowser({
  meetings,
  categories,
  onNewMeeting,
}: {
  meetings: MeetingListItem[];
  categories: { id: string; name: string }[];
  onNewMeeting?: () => void;
}) {
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("newest");
  const platforms = useMemo(
    () => [
      ...new Set(
        meetings.map((m) => m.platform).filter((p): p is string => Boolean(p)),
      ),
    ],
    [meetings],
  );
  const activePlatform = platforms.includes(platform) ? platform : "all";
  const activeCategory =
    category === "uncategorized" || categories.some((c) => c.id === category)
      ? category
      : "all";
  const active = meetings.filter((m) => meetingGroup(m.status) === "active");
  const search = query.trim().toLowerCase();
  const filtered = meetings
    .filter((m) => {
      if (view !== "all" && meetingGroup(m.status) !== view) return false;
      if (activePlatform !== "all" && m.platform !== activePlatform)
        return false;
      if (activeCategory === "uncategorized" && m.categoryId) return false;
      if (
        activeCategory !== "all" &&
        activeCategory !== "uncategorized" &&
        m.categoryId !== activeCategory
      )
        return false;
      return (
        !search ||
        `${m.title ?? ""} ${m.meetingUrl} ${m.platform ?? ""} ${platformLabel(m.platform)} ${m.summary ?? ""}`
          .toLowerCase()
          .includes(search)
      );
    })
    .sort((a, b) =>
      sort === "title"
        ? (a.title ?? a.meetingUrl).localeCompare(b.title ?? b.meetingUrl)
        : (meetingTime(a) - meetingTime(b)) * (sort === "oldest" ? 1 : -1),
    );

  const filtering =
    Boolean(query.trim()) ||
    activePlatform !== "all" ||
    activeCategory !== "all";
  function reset() {
    setQuery("");
    setPlatform("all");
    setCategory("all");
    setView("all");
  }

  return (
    <>
      {active.length > 0 && (
        <section className={styles.activity} aria-labelledby="activity-heading">
          <div className={styles.activityHeading}>
            <h2 id="activity-heading">
              <span /> Happening now
            </h2>
            <span>{active.length} in progress</span>
          </div>
          <div className={styles.activityGrid}>
            {active.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/meetings/${meeting.id}`}
                className={styles.activeCard}
              >
                <span className={styles.activeIcon}>
                  <AudioLines size={21} />
                </span>
                <div>
                  <span
                    className={styles.status}
                    data-tone={
                      meeting.status === "in_call_recording"
                        ? "recording"
                        : "active"
                    }
                  >
                    <i />
                    {meetingStatusLabel(meeting.status)}
                  </span>
                  <h3>
                    {meeting.title ??
                      `${platformLabel(meeting.platform)} meeting`}
                  </h3>
                  <p>
                    {platformLabel(meeting.platform)} ·{" "}
                    {meetingStatusLabel(meeting.status) === "Processing"
                      ? "Preparing your meeting notes"
                      : "Rika is taking care of the details"}
                  </p>
                </div>
                <ArrowUpRight size={18} className={styles.activeArrow} />
                <span className={styles.openLabel}>Open meeting</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className={styles.library} aria-labelledby="library-heading">
        <div className={styles.libraryHeading}>
          <div>
            <h2 id="library-heading">Your meeting library</h2>
            <p>Every conversation. A clearer way back.</p>
          </div>
          <span className={styles.libraryIcon}>
            <Video size={19} />
          </span>
        </div>
        <div
          className={styles.viewBar}
          role="group"
          aria-label="Meeting status filters"
        >
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={view === item.id}
              onClick={() => setView(item.id)}
              className={styles.viewButton}
              data-active={view === item.id}
            >
              {item.label}
              <span>
                {item.id === "all"
                  ? meetings.length
                  : meetings.filter((m) => meetingGroup(m.status) === item.id)
                      .length}
              </span>
            </button>
          ))}
        </div>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={17} />
            <input
              aria-label="Search meetings"
              placeholder="Search conversations or notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </label>
          <div className={styles.filters}>
            <SlidersHorizontal size={15} aria-hidden="true" />
            <select
              aria-label="Filter by category"
              value={activeCategory}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">All categories</option>
              <option value="uncategorized">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by platform"
              value={activePlatform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="all">All platforms</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {platformLabel(p)}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort meetings"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A–Z</option>
            </select>
          </div>
        </div>
        {meetings.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <AudioLines size={30} strokeWidth={1.3} />
            </span>
            <span className={styles.eyebrow}>MAKE ROOM FOR THE MOMENT</span>
            <h3>Your first conversation starts here.</h3>
            <p>
              Bring Rika to a meeting. Your notes, decisions, and next steps
              will find a home right here.
            </p>
            <div>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={onNewMeeting}
              >
                Join your first meeting <ArrowUpRight size={15} />
              </button>
              <Link href="/settings/calendar" className={styles.quietButton}>
                <CalendarDays size={15} /> Connect calendar
              </Link>
            </div>
            <small>Works with Zoom, Google Meet, and Microsoft Teams.</small>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <Search size={25} />
            </span>
            <h3>
              {filtering
                ? "No matching conversations."
                : view === "upcoming"
                  ? "A little space before the next call."
                  : view === "attention"
                    ? "Everything looks clear."
                    : "Your notes are on their way."}
            </h3>
            <p>
              {filtering
                ? "Try a different search or clear your filters."
                : view === "upcoming"
                  ? "Connect your calendar to bring upcoming meetings here."
                  : view === "attention"
                    ? "There are no meetings that need your attention."
                    : "Completed meetings will appear here once Rika finishes capturing them."}
            </p>
            <button
              type="button"
              className={styles.quietButton}
              onClick={reset}
            >
              {filtering ? "Clear filters" : "View all meetings"}
            </button>
            {view === "upcoming" && !filtering && (
              <Link href="/settings/calendar" className={styles.textLink}>
                Connect calendar <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className={styles.results} aria-live="polite">
              <span>
                {filtered.length} conversation{filtered.length === 1 ? "" : "s"}
                {filtering ? " found" : ""}
              </span>
              {filtering && (
                <button type="button" onClick={reset}>
                  Clear filters <X size={12} />
                </button>
              )}
            </div>
            <MeetingList
              meetings={filtered}
              categories={categories}
              emptyLabel="No matching meetings."
            />
          </>
        )}
      </section>
    </>
  );
}
