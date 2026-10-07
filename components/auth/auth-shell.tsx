import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, AudioLines, Check } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <Image
          src="/images/rika-valley.png"
          alt=""
          fill
          sizes="100vw"
          preload
          className="object-cover object-center opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-white/50 to-white/95" />
      </div>
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link
          href="/"
          aria-label="Rika home"
          className="flex items-center gap-2.5 text-[30px] font-semibold tracking-[-1.8px] text-ink"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
            <AudioLines size={21} />
          </span>
          rika.
        </Link>
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-ink-muted hover:text-ink"
        >
          <ArrowLeft size={14} /> Back to home
        </Link>
      </header>
      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 py-12 lg:grid-cols-2 lg:px-10">
        <div className="hidden pb-16 lg:block">
          <span className="section-label">A little more presence.</span>
          <h1 className="mt-6 text-6xl font-medium leading-[1.08] tracking-[-3px] text-ink">
            Be present.
            <br />
            Rika remembers.
          </h1>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-ink-muted">
            A home for your meetings, and the clarity that comes after them.
          </p>
          <div className="mt-9 flex flex-col gap-3 text-sm text-ink-muted">
            <p className="flex items-center gap-2">
              <Check size={15} className="text-moss" /> Capture the conversation
            </p>
            <p className="flex items-center gap-2">
              <Check size={15} className="text-moss" /> Keep the decisions and
              next steps
            </p>
            <p className="flex items-center gap-2">
              <Check size={15} className="text-moss" /> Come back to an answer
              with a source
            </p>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">{children}</div>
      </div>
      <footer className="relative z-10 flex justify-center gap-5 pb-7 text-[11px] text-ink-muted">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </footer>
    </main>
  );
}
