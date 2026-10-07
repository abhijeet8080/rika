"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import styles from "./landing.module.css";

export function LandingMotion({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();

    media.add(
      {
        animate: "(prefers-reduced-motion: no-preference)",
        desktop: "(min-width: 801px)",
      },
      (context) => {
        if (!context.conditions?.animate) return;
        const desktop = context.conditions.desktop;
        const select = gsap.utils.selector(root);

        if (window.scrollY < 80) {
          gsap.from(select(`.${styles.heroCopy} > *`), {
            opacity: 0,
            y: desktop ? 20 : 12,
            duration: 0.8,
            stagger: 0.09,
            ease: "power3.out",
            clearProps: "opacity,transform",
          });
        }

        const targets = select(
          [
            styles.integrations,
            styles.sectionHeading,
            styles.featureCard,
            styles.smallFeature,
            styles.step,
            styles.askCopy,
            styles.largeChat,
            styles.faqList,
            styles.ctaInner,
          ]
            .filter(Boolean)
            .map((className) => `.${className}`)
            .join(","),
        );

        const cleanups: Array<() => void> = [];
        targets.forEach((element: HTMLElement) => {
          const siblings = Array.from(element.parentElement?.children ?? []);
          const stagger = element.matches(
            `.${styles.featureCard}, .${styles.smallFeature}, .${styles.step}`,
          )
            ? Math.min(siblings.indexOf(element), 2) * 0.08
            : 0;
          const reveal = gsap.from(element, {
            opacity: 0,
            y: desktop ? 30 : 16,
            duration: 0.75,
            delay: stagger,
            ease: "power3.out",
            clearProps: "opacity,transform",
            scrollTrigger: {
              trigger: element,
              start: "top 92%",
              once: true,
            },
          });
          // Keyboard navigation must never land on an invisible control.
          const showOnFocus = () => reveal.progress(1);
          element.addEventListener("focusin", showOnFocus);
          cleanups.push(() =>
            element.removeEventListener("focusin", showOnFocus),
          );
        });
        return () => cleanups.forEach((cleanup) => cleanup());
      },
      root,
    );

    return () => media.revert();
  }, []);

  return (
    <div ref={rootRef} className={styles.site}>
      {children}
    </div>
  );
}
