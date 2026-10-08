import { and, desc, eq, isNull } from "drizzle-orm";
import { MeetingsWorkspace } from "@/components/meetings-workspace";
import {
  getDefaultRecallAccountId,
  getRecallAccountChoices,
} from "@/lib/recall/accounts";
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
        summary: meetings.summary,
        actionItems: meetings.actionItems,
      })
      .from(meetings)
      .where(and(eq(meetings.userId, userId), isNull(meetings.deletionRequestedAt)))
      .orderBy(desc(meetings.createdAt)),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.userId, userId)),
  ]);

  const listMeetings = allMeetings.map(({ actionItems, ...m }) => ({
    ...m,
    actionItemCount: actionItems?.length ?? 0,
  }));

  return (
    <MeetingsWorkspace
      meetings={listMeetings}
      categories={userCategories}
      recallAccounts={getRecallAccountChoices()}
      defaultRecallAccount={getDefaultRecallAccountId()}
    />
  );
}
