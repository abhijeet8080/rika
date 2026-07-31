import { eq } from "drizzle-orm";
import { Calendar, Check } from "lucide-react";
import { AutoRecordToggle } from "@/components/auto-record-toggle";
import { CalendarEventsList } from "@/components/calendar-events-list";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { calendarConnections } from "@/lib/db/schema";

// Connection status changes via OAuth callbacks between requests — must
// not be frozen at build time.
export const dynamic = "force-dynamic";

const PROVIDERS = [
  {
    id: "google",
    label: "Google Calendar",
    connectHref: "/api/calendar/google/connect",
  },
  {
    id: "microsoft_outlook",
    label: "Outlook Calendar",
    connectHref: "/api/calendar/outlook/connect",
  },
] as const;

export default async function CalendarSettingsPage() {
  const userId = await getCurrentUserId();
  const connections = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, userId));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Calendar"
        description="Connect one or more calendars to auto-detect meetings from invites."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const accounts = connections.filter(
            (c) => c.provider === provider.id,
          );
          return (
            <Card key={provider.id} className="flex flex-col divide-y divide-line p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-paper-soft text-ink-muted">
                    <Calendar className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {provider.label}
                  </span>
                </div>
                <a
                  href={provider.connectHref}
                  className="shrink-0 rounded-full border border-line px-4 py-1.5 text-sm text-ink transition-colors hover:border-ink/30"
                >
                  {accounts.length > 0 ? "Connect another" : "Connect"}
                </a>
              </div>

              {accounts.length > 0 && (
                <>
                  <div className="pt-4">
                    <AutoRecordToggle
                      connectionIds={accounts.map((a) => a.id)}
                      initialValue={accounts.every((a) => a.autoRecord)}
                    />
                  </div>
                  <ul className="flex flex-col gap-1.5 pt-4">
                    {accounts.map((account) => (
                      <li
                        key={account.id}
                        className="flex items-center gap-1.5 font-mono text-[12px] text-ink-muted"
                      >
                        <Check
                          className="h-3.5 w-3.5 shrink-0 text-moss"
                          strokeWidth={2}
                        />
                        {account.email ?? "Connected account"}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          );
        })}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-[13px] tracking-wider text-ink-muted uppercase">
          Upcoming meetings
        </h2>
        <CalendarEventsList hasConnections={connections.length > 0} />
      </section>
    </div>
  );
}
