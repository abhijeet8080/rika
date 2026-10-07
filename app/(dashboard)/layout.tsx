"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  ArrowUpRight,
  AudioLines,
  CalendarDays,
  ChevronRight,
  MessageSquareText,
  Sparkles,
  Video,
} from "lucide-react";
import { ToastProvider } from "@/components/ui/toaster";

const navItems = [
  { href: "/meetings", label: "Meetings", icon: Video },
  { href: "/chat", label: "Ask Rika", icon: MessageSquareText },
  { href: "/settings/calendar", label: "Calendar", icon: CalendarDays },
];

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const isMeetingWorkspace = /^\/meetings\/[^/]+$/.test(pathname);
  const pageName =
    navItems.find((item) => pathname.startsWith(item.href))?.label ??
    "Meetings";
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <ToastProvider>
      <div
        className={`bg-studio flex min-h-dvh flex-1 flex-col lg:grid lg:grid-cols-[224px_minmax(0,1fr)] ${isMeetingWorkspace ? "lg:h-dvh lg:overflow-hidden" : ""}`}
      >
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-[#f4f8f5] px-4 py-6 lg:flex">
          <Link
            href="/meetings"
            className="mb-8 flex w-fit items-center gap-2.5 px-2 text-[30px] font-semibold tracking-[-1.8px] text-ink"
            aria-label="Rika meetings"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
              <AudioLines size={21} strokeWidth={1.8} />
            </span>
            rika.
          </Link>
          <div className="mb-7 rounded-xl border border-line bg-white/80 px-3.5 py-3">
            <p className="text-xs font-medium text-ink">Your workspace</p>
            <p className="mt-1 text-[11px] text-ink-muted">
              A home for your conversations
            </p>
          </div>
          <p className="section-label mb-3 px-3">Workspace</p>
          <nav
            aria-label="Workspace navigation"
            className="flex flex-col gap-1"
          >
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition-colors ${isActive(href) ? "bg-[#e3eee6] text-[#245e4b]" : "text-ink-muted hover:bg-paper-soft hover:text-ink"}`}
              >
                <Icon size={17} strokeWidth={1.65} />
                {label}
                {isActive(href) && (
                  <span className="ml-auto h-1 w-1 rounded-full bg-moss" />
                )}
              </Link>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-line bg-white/70 p-4">
            <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-paper-soft text-moss">
              <Sparkles size={16} />
            </span>
            <p className="text-[13px] font-medium text-ink">
              Be there. We&apos;ll remember.
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              Connect your calendar for one less thing to think about.
            </p>
            <Link
              href="/settings/calendar"
              className="mt-4 flex items-center gap-2 text-[11px] font-medium text-moss"
            >
              Manage calendar <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="mt-5 flex items-center justify-between px-2 text-[10px] text-ink-muted">
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <span>rika.</span>
          </div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-col">
          <header className="sticky top-0 z-40 shrink-0 border-b border-line bg-white/90 backdrop-blur-xl">
            <div className="flex h-16 items-center justify-between gap-4 px-5 sm:px-8">
              <Link
                href="/meetings"
                className="flex items-center gap-2 text-2xl font-semibold tracking-[-1px] text-ink lg:hidden"
              >
                <AudioLines size={20} />
                rika.
              </Link>
              <div className="hidden items-center gap-2 text-xs text-ink-muted lg:flex">
                <span>Workspace</span>
                <ChevronRight size={12} />
                <span className="font-medium text-ink">{pageName}</span>
                {isMeetingWorkspace && (
                  <>
                    <ChevronRight size={12} />
                    <span>Meeting details</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="hidden text-[11px] text-ink-muted sm:block">
                  A little more presence.
                </span>
                <UserButton
                  appearance={{
                    elements: {
                      avatarBox:
                        "h-8 w-8 ring-2 ring-white outline outline-1 outline-line",
                    },
                  }}
                />
              </div>
            </div>
            <nav
              aria-label="Mobile workspace navigation"
              className="flex gap-1 border-t border-line/50 px-4 py-2 lg:hidden"
            >
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${isActive(href) ? "bg-paper-soft text-moss" : "text-ink-muted"}`}
                >
                  <Icon size={14} />
                  {label}
                </Link>
              ))}
            </nav>
          </header>
          <main
            className={`flex min-h-0 flex-1 flex-col px-5 sm:px-8 xl:px-10 ${isMeetingWorkspace ? "py-5" : "py-8 sm:py-10"}`}
          >
            <div
              className={
                isMeetingWorkspace
                  ? "mx-auto flex min-h-0 w-full max-w-[1680px] flex-1 flex-col"
                  : "mx-auto w-full max-w-6xl"
              }
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
