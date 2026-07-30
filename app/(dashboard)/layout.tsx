import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

const navItems = [
  { href: "/meetings", label: "Meetings" },
  { href: "/chat", label: "Chat" },
  { href: "/settings/calendar", label: "Calendar" },
];

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col bg-paper">
      <header className="sticky top-0 z-50 flex items-center gap-8 border-b border-line bg-paper/90 px-6 py-4 backdrop-blur-md">
        <Link href="/meetings" className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rec" />
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-ink">
            Rika
          </span>
        </Link>
        <nav className="flex flex-1 gap-6 font-mono text-[13px] text-ink-muted">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <UserButton />
      </header>
      <main className="flex flex-1 flex-col px-6 py-10">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </main>
    </div>
  );
}
