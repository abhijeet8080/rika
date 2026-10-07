import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarSettingsLoading() {
  return <div className="flex flex-col gap-7" role="status"><span className="sr-only">Loading your calendar…</span><div className="flex items-center justify-between gap-6"><div className="flex flex-col gap-3"><Skeleton className="h-3 w-36" /><Skeleton className="h-10 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></div><Skeleton className="hidden h-10 w-40 rounded-xl sm:block" /></div><div className="flex flex-col gap-5 rounded-2xl border border-line bg-white/60 p-6"><Skeleton className="h-6 w-32" /><Skeleton className="h-10 w-full rounded-lg" />{[0,1,2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div></div>;
}
