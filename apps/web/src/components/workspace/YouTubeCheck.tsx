"use client";

import { Eye } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";

import { InterestChart } from "@/components/lab/InterestChart";
import type { ActualCurve } from "@/lib/api";
import type { Analysis } from "@/lib/contract.gen";
import { overlap, resampleHeat, spearman } from "@/lib/score";

/** Live blind check for a published video: our predicted interest against YouTube's "Most replayed". */
export function YouTubeCheck({ analysis, actual }: { analysis: Analysis; actual: ActualCurve }) {
  const [revealed, setRevealed] = useState(false);
  const model = useMemo(() => analysis.curve.bins.map((b) => b.interest), [analysis]);
  const heat = useMemo(() => resampleHeat(actual.points, analysis.metrics.duration_seconds), [actual, analysis]);
  const score = useMemo(
    () => ({ rho: spearman(model, heat), peaks: overlap(model, heat), dips: overlap(model, heat, 10, true) }),
    [model, heat],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <p className="flex items-center gap-5 text-[12px] text-ink-3">
          <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-ink" />Predicted interest, from the transcript</span>
          <span className={`flex items-center gap-1.5 transition-opacity duration-500 ${revealed ? "" : "opacity-30"}`}>
            <span className="h-[2px] w-4" style={{ background: "var(--actual)" }} />YouTube “Most replayed”
          </span>
        </p>
        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="inline-flex items-center gap-2 rounded-[7px] px-3 py-1.5 text-[13px] font-[620] text-paper hover:brightness-110"
            style={{ background: "var(--actual)" }}
          >
            <Eye size={14} aria-hidden /> Reveal YouTube’s curve
          </button>
        ) : (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 0.4 }}
            className="tnum flex gap-4 text-[13px] text-ink-2"
          >
            <span>Shape match <strong className="font-[650] text-ink">{score.rho >= 0 ? "+" : "−"}{Math.abs(score.rho).toFixed(2)}</strong></span>
            <span>Peaks <strong className="font-[650] text-ink">{Math.round(score.peaks * 10)}/10</strong></span>
            <span>Quiet stretches <strong className="font-[650] text-ink">{Math.round(score.dips * 10)}/10</strong></span>
          </motion.p>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <InterestChart model={model} actual={heat} duration={analysis.metrics.duration_seconds} revealed={revealed} />
      </div>
    </div>
  );
}
