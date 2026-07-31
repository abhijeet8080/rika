import { desc, eq } from "drizzle-orm";
import { JoinMeetingForm } from "@/components/join-meeting-form";
import { MeetingsBrowser } from "@/components/meetings-browser";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { categories, meetings } from "@/lib/db/schema";

// Meeting statuses change via webhooks between requests — must not be
// frozen at build time.
export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const userId = await getCurrentUserId();

  const [allMeetings, userCategories] = await Promise.all([
    db
      .select({
        id: meetings.id,
        title: meetings.title,
        platform: meetings.platform,
        meetingUrl: meetings.meetingUrl,
        status: meetings.status,
        scheduledStart: meetings.scheduledStart,
        startedAt: meetings.startedAt,
        createdAt: meetings.createdAt,
        categoryId: meetings.categoryId,
      })
      .from(meetings)
      .where(eq(meetings.userId, userId))
      .orderBy(desc(meetings.createdAt)),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId)),
  ]);

  const activeCount = allMeetings.filter(
    (m) => m.status !== "done" && !m.status.startsWith("fatal"),
  ).length;
  const capturedCount = allMeetings.filter((m) => m.status === "done").length;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Meetings"
        description={`${allMeetings.length} total · ${activeCount} active · ${capturedCount} captured`}
        action={<JoinMeetingForm />}
      />

      <MeetingsBrowser meetings={allMeetings} categories={userCategories} />
    </div>
  );
}
