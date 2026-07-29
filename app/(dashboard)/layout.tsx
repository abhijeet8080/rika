import Link from "next/link";

const navItems = [
  { href: "/meetings", label: "Meetings" },
  { href: "/chat", label: "Chat" },
  { href: "/join", label: "Join Now" },
  { href: "/settings/calendar", label: "Calendar" },
];

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-6 border-b border-black/[.08] px-6 py-4 dark:border-white/[.145]">
        <span className="font-semibold">Rika</span>
        <nav className="flex gap-4 text-sm">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex flex-1 flex-col px-6 py-8">{children}</main>
    </div>
  );
}
