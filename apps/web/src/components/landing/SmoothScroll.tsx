"use client";

import Lenis from "lenis";
import { useEffect } from "react";

import { ScrollTrigger, gsap, prefersReducedMotion } from "@/lib/gsap";

/** Lenis smooth scroll for Persuade/Read pages only, synced with GSAP ScrollTrigger. */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);
  return null;
}
