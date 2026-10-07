"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import styles from "./landing.module.css";

export function ScrollPreview({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const tilt = tiltRef.current;
    if (!stage || !tilt) return;
    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia();
    media.add(
      "(min-width: 801px) and (prefers-reduced-motion: no-preference)",
      () => {
        gsap.fromTo(
          tilt,
          {
            "--preview-tilt": "12deg",
            "--preview-scale": 0.96,
            "--preview-y": "14px",
          },
          {
            "--preview-tilt": "0deg",
            "--preview-scale": 1,
            "--preview-y": "0px",
            ease: "power1.inOut",
            scrollTrigger: {
              trigger: stage,
              start: 0,
              // Measure the untransformed stage, not the moving card.
              end: () =>
                Math.max(
                  180,
                  stage.getBoundingClientRect().top + window.scrollY -
                    window.innerHeight * 0.24,
                ),
              scrub: 0.55,
              invalidateOnRefresh: true,
            },
          },
        );
      },
      stage,
    );
    return () => media.revert();
  }, []);

  return (
    <div ref={stageRef} className={styles.previewStage}>
      <div ref={tiltRef} className={styles.previewTilt}>
        {children}
      </div>
    </div>
  );
}
