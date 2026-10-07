"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, AudioLines, Menu, X } from "lucide-react";
import styles from "./landing.module.css";

export function LandingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className={styles.navWrap}>
      <div className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="Rika home">
          <span className={styles.brandIcon}>
            <AudioLines size={21} strokeWidth={1.8} />
          </span>
          rika<span className={styles.brandDot}>.</span>
        </Link>
        <nav className={styles.desktopLinks} aria-label="Main navigation">
          <a href="#features">Why Rika</a>
          <a href="#how-it-works">How it works</a>
          <a href="#ask">Ask Rika</a>
        </nav>
        <div className={styles.navActions}>
          <Link href="/sign-in" className={styles.signIn}>
            Sign in
          </Link>
          <Link href="/sign-up" className={styles.navCta}>
            Get started <ArrowUpRight size={15} />
          </Link>
          <button
            className={styles.menuToggle}
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          className={styles.mobileLinks}
          aria-label="Mobile navigation"
        >
          <a href="#features" onClick={() => setOpen(false)}>
            Why Rika
          </a>
          <a href="#how-it-works" onClick={() => setOpen(false)}>
            How it works
          </a>
          <a href="#ask" onClick={() => setOpen(false)}>
            Ask Rika
          </a>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      )}
    </header>
  );
}
