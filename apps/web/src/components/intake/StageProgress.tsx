"use client";

import clsx from "clsx";
import { AlertTriangle, Check } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { Panel, Spinner } from "@/components/ui";
import type { StageEvent } from "@/lib/contract.gen";
import { fmtTime } from "@/lib/format";

const SCRIPT_STAGES: { key: StageEvent["stage"]; label: string }[] = [
  { key: "ingest", label: "Reading the script" },
  { key: "segment", label: "Timing every line" },
  { key: "read", label: "Finding hooks, promises and loops" },
  { key: "predict", label: "Predicting the retention curve" },
  { key: "explain", label: "Explaining each drop" },
  { key: "fix", label: "Writing and simulating fixes" },
];
const VIDEO_STAGES: { key: StageEvent["stage"]; label: string }[] = [
  { key: "ingest", label: "Reading the rough cut" },
  { key: "transcribe", label: "Transcribing the audio" },
  { key: "segment", label: "Measuring shot cuts and silences" },
  ...SCRIPT_STAGES.slice(2),
];
const URL_STAGES: { key: StageEvent["stage"]; label: string }[] = [
  { key: "ingest", label: "Opening the video on YouTube" },
  { key: "transcribe", label: "Getting the transcript" },
  ...SCRIPT_STAGES.slice(2),
];

function useElapsed(running: boolean) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return (now - start) / 1000;
}

/** The analysis arrives stage by stage: a progress bar, then a checklist of what's done and what's running. */
export function StageProgress({
  events,
  error,
  mode = "script",
  subject,
}: {
  events: StageEvent[];
  error: string | null;
  mode?: "script" | "url" | "video";
  /** What's being analyzed: the title or link. */
  subject?: string;
}) {
  const STAGES = mode === "url" ? URL_STAGES : mode === "video" ? VIDEO_STAGES : SCRIPT_STAGES;
  const reached = Math.max(-1, ...events.map((e) => STAGES.findIndex((s) => s.key === e.stage)));
  const latest = events.at(-1);
  const progress = Math.max(0.03, Math.min(1, latest?.progress ?? 0.03));
  const finished = progress >= 1 || events.some((e) => e.stage === STAGES.at(-1)?.key && e.status === "done");
  const elapsed = useElapsed(!error && !finished);

  return (
    <Panel padded={false} className="mx-auto w-full max-w-[580px]" aria-labelledby="stage-title">
      <div className="flex flex-col gap-3 border-b border-line px-6 pt-5 pb-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="eyebrow" id="stage-title">
            {error ? "Analysis stopped" : finished ? "Analysis ready" : "Analyzing"}
          </p>
          <p className="tc text-[12px] text-ink-3" aria-label={`Elapsed ${fmtTime(elapsed)}`}>
            {fmtTime(elapsed)}
          </p>
        </div>
        {subject && (
          <p className="truncate text-[16px] font-[600] text-ink" title={subject}>
            {subject}
          </p>
        )}
        <div
          role="progressbar"
          aria-label="Analysis progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-1 overflow-hidden rounded-full bg-surface-2"
        >
          <div
            className={clsx("h-full rounded-full transition-[width] duration-700 ease-out", error ? "bg-drop" : "bg-primary")}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <ol className="flex flex-col px-6 py-5" aria-live="polite">
        {STAGES.map((s, i) => {
          const done = i < reached || (i === reached && events.some((e) => e.stage === s.key && e.status === "done"));
          const active = i === reached && !done && !error;
          const failed = i === reached && !done && !!error;
          const msg = [...events].reverse().find((e) => e.stage === s.key)?.message;
          const last = i === STAGES.length - 1;
          return (
            <motion.li
              key={s.key}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3"
            >
              <span className="flex flex-col items-center">
                <span
                  className={clsx(
                    "grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-200",
                    done && "bg-primary text-primary-fg",
                    active && "text-accent",
                    failed && "bg-drop-wash text-drop",
                    !done && !active && !failed && "border border-line-strong",
                  )}
                >
                  {done ? (
                    <Check size={12} strokeWidth={3} aria-hidden />
                  ) : active ? (
                    <Spinner />
                  ) : failed ? (
                    <AlertTriangle size={11} strokeWidth={2.5} aria-hidden />
                  ) : null}
                </span>
                {!last && <span aria-hidden className={clsx("my-1 w-px flex-1", done ? "bg-primary/50" : "bg-line")} />}
              </span>
              <span className={clsx("flex min-h-5 flex-col", !last && "pb-4")}>
                <span className={clsx("text-[14px] leading-5", done || active || failed ? "font-[500] text-ink" : "text-ink-3")}>
                  {s.label}
                  <span className="sr-only">{done ? " (done)" : active ? " (running)" : failed ? " (failed)" : ""}</span>
                </span>
                {msg && msg.toLowerCase() !== s.label.toLowerCase() && (done || active) && (
                  <span className="mt-0.5 text-[12.5px] text-ink-3">{msg}</span>
                )}
              </span>
            </motion.li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="mx-6 mb-5 rounded-control border border-drop/30 bg-drop-wash px-4 py-3 text-[13.5px] text-drop-text">
          {error}
        </p>
      )}
    </Panel>
  );
}
