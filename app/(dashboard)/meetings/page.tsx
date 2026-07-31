import { desc, eq } from "drizzle-orm";
import { JoinMeetingForm } from "@/components/join-meeting-form";
import { MeetingList } from "@/components/meeting-list";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { categories, meetings } from "@/lib/db/schema";

// Meeting statuses change via webhooks between requests — must not be
// frozen at build time.
export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const userId = await getCurrentUserId();

  const allMeetings = await db
    .select({
      id: meetings.id,
      title: meetings.title,
      platform: meetings.platform,
      meetingUrl: meetings.meetingUrl,
      status: meetings.status,
      scheduledStart: meetings.scheduledStart,
      startedAt: meetings.startedAt,
      createdAt: meetings.createdAt,
      categoryName: categories.name,
    })
    .from(meetings)
    .leftJoin(categories, eq(meetings.categoryId, categories.id))
    .where(eq(meetings.userId, userId))
    .orderBy(desc(meetings.createdAt));

  const failed = allMeetings.filter((m) => m.status.startsWith("fatal"));
  const past = allMeetings.filter((m) => m.status === "done");
  const upcoming = allMeetings.filter(
    (m) => m.status !== "done" && !m.status.startsWith("fatal"),
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink">
            Meetings
          </h1>
          <p className="mt-1.5 font-mono text-[13px] text-ink-muted">
            {allMeetings.length} total · {upcoming.length} active ·{" "}
            {past.length} captured
          </p>
        </div>
        <JoinMeetingForm />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[13px] tracking-wider text-ink-muted uppercase">
          Upcoming &amp; in progress
        </h2>
        <MeetingList
          meetings={upcoming}
          emptyLabel="Nothing scheduled — join a meeting or connect your calendar."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[13px] tracking-wider text-ink-muted uppercase">
          Past
        </h2>
        <MeetingList meetings={past} emptyLabel="No completed meetings yet." />
      </section>

      {failed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[13px] tracking-wider text-rec uppercase">
            Failed to join
          </h2>
          <MeetingList meetings={failed} emptyLabel="" />
        </section>
      )}
    </div>
  );
}
