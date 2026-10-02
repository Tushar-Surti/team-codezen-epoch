"use client";

import { useGSAP } from "@gsap/react";
import { Check, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";

import type { StageEvent } from "@/lib/contract.gen";
import { gsap, prefersReducedMotion } from "@/lib/gsap";

const SCRIPT_STAGES: { key: StageEvent["stage"]; label: string }[] = [
  { key: "ingest", label: "Reading the script" },
  { key: "segment", label: "Timing every line" },
  { key: "read", label: "Finding hooks, promises and loops" },
  { key: "predict", label: "Predicting the retention curve" },
  { key: "explain", label: "Explaining each drop" },
  { key: "fix", label: "Writing and simulating fixes" },
];
const URL_STAGES: { key: StageEvent["stage"]; label: string }[] = [
  { key: "ingest", label: "Opening the video on YouTube" },
  { key: "transcribe", label: "Getting the transcript" },
  ...SCRIPT_STAGES.slice(2),
];

/** The analysis arrives stage by stage; a pen line draws across the page as it goes. */
export function StageProgress({ events, error, mode = "script" }: { events: StageEvent[]; error: string | null; mode?: "script" | "url" }) {
  const STAGES = mode === "url" ? URL_STAGES : SCRIPT_STAGES;
  const scope = useRef<SVGSVGElement>(null);
  const prev = useRef(0);
  const reached = Math.max(-1, ...events.map((e) => STAGES.findIndex((s) => s.key === e.stage)));
  const latest = events.at(-1);
  const progress = Math.max(0.04, latest?.progress ?? 0.04);

  useGSAP(
    () => {
      const to = `${Math.round(progress * 100)}%`;
      if (prefersReducedMotion()) {
        gsap.set(".progress-pen", { drawSVG: to });
      } else {
        gsap.fromTo(".progress-pen", { drawSVG: `${Math.round(prev.current * 100)}%` }, { drawSVG: to, duration: 0.8, ease: "power2.out" });
      }
      prev.current = progress;
    },
    { scope, dependencies: [progress] },
  );

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <svg ref={scope} viewBox="0 0 560 90" className="mb-8 w-full" aria-hidden>
        <path
          className="progress-pen"
          d="M4,18 C80,20 90,64 150,66 C230,70 300,58 380,62 C450,66 500,70 556,74"
          fill="none"
          stroke="var(--ink)"
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      </svg>
      <ol className="space-y-3" aria-live="polite">
        {STAGES.map((s, i) => {
          const done = i < reached || (i === reached && events.some((e) => e.stage === s.key && e.status === "done"));
          const active = i === reached && !done;
          const msg = [...events].reverse().find((e) => e.stage === s.key)?.message;
          return (
            <motion.li
              key={s.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: i <= reached + 1 ? 1 : 0.35, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-start gap-3"
            >
              <span className="mt-[2px] grid size-5 place-items-center">
                <AnimatePresence mode="wait" initial={false}>
                  {done ? (
                    <motion.span key="done" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid size-5 place-items-center rounded-full bg-ink text-paper">
                      <Check size={12} strokeWidth={3} />
                    </motion.span>
                  ) : active ? (
                    <motion.span key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <Loader2 size={17} className="animate-spin text-ink-2" />
                    </motion.span>
                  ) : (
                    <span className="size-2 rounded-full bg-rule-strong" />
                  )}
                </AnimatePresence>
              </span>
              <span>
                <span className={`block text-[15px] ${done || active ? "font-[600] text-ink" : "text-ink-3"}`}>{s.label}</span>
                {msg && msg.toLowerCase() !== s.label.toLowerCase() && (done || active) && (
                  <span className="block text-[13px] text-ink-3">{msg}</span>
                )}
              </span>
            </motion.li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="mt-6 rounded-[7px] border border-pen/30 bg-pen-wash px-4 py-3 text-[14px] text-pen-text">
          {error}
        </p>
      )}
    </div>
  );
}
