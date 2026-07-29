import { desc, eq } from "drizzle-orm";
import { MeetingList } from "@/components/meeting-list";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { meetings } from "@/lib/db/schema";

// Meeting statuses change via webhooks between requests — must not be
// frozen at build time.
export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const userId = await getCurrentUserId();

  const allMeetings = await db
    .select()
    .from(meetings)
    .where(eq(meetings.userId, userId))
    .orderBy(desc(meetings.createdAt));

  const failed = allMeetings.filter((m) => m.status.startsWith("fatal"));
  const past = allMeetings.filter((m) => m.status === "done");
  const upcoming = allMeetings.filter(
    (m) => m.status !== "done" && !m.status.startsWith("fatal"),
  );

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Meetings</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Upcoming / in progress</h2>
        <MeetingList
          meetings={upcoming}
          emptyLabel="Nothing scheduled — join a meeting or connect your calendar."
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Past</h2>
        <MeetingList meetings={past} emptyLabel="No completed meetings yet." />
      </section>

      {failed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Failed to join</h2>
          <MeetingList meetings={failed} emptyLabel="" />
        </section>
      )}
    </div>
  );
}
