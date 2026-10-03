"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Eye, EyeOff, Play, RotateCcw } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { InterestChart } from "@/components/lab/InterestChart";
import { PageHeader } from "@/components/shell/PageHeader";
import { ConfidenceCard } from "@/components/trust/ConfidenceCard";
import { WhyDiffer } from "@/components/trust/WhyDiffer";
import { Button, Panel } from "@/components/ui";
import { CELL_LABEL, evalApi } from "@/lib/eval";
import { fmtTime } from "@/lib/format";

type Step = "pick" | "predicted" | "revealed";

function CountUp({ value, digits = 2, signed = true }: { value: number; digits?: number; signed?: boolean }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${signed && v >= 0 ? "+" : ""}${v.toFixed(digits)}`);
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

export default function BlindTestPage() {
  const { data: summary, error } = useQuery({ queryKey: ["eval"], queryFn: evalApi.summary });
  const [cell, setCell] = useState<string>("all");
  const [picked, setPicked] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [showLlm, setShowLlm] = useState(false);
  const { data: video } = useQuery({
    queryKey: ["eval-video", picked],
    queryFn: () => evalApi.video(picked!),
    enabled: !!picked,
  });

  const videos = useMemo(
    () => (summary?.videos ?? []).filter((v) => cell === "all" || v.cell === cell).sort((a, b) => a.title.localeCompare(b.title)),
    [summary, cell],
  );

  const choose = (id: string) => {
    setPicked(id);
    setStep("pick");
    setShowLlm(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Blind test"
        description={
          <>
            Pick a real public video. Retent AI predicts where attention rises and falls <em>from the transcript alone</em>, using a model
            trained without this video’s channel. Then we reveal YouTube’s own “Most replayed” curve.
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Video picker */}
        <aside className="flex min-h-0 flex-col border-line bg-surface max-lg:border-b lg:border-r" aria-label="Videos">
          <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-3" role="group" aria-label="Filter by category">
            {["all", ...Object.keys(summary?.cells ?? {})].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cell === c}
                onClick={() => setCell(c)}
                className={clsx(
                  "h-6 rounded-chip border px-2 text-[12px] font-[500] transition-colors duration-150",
                  cell === c ? "border-transparent bg-primary text-primary-fg" : "border-line text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {c === "all" ? `All ${summary?.n_videos ?? ""}` : `${CELL_LABEL[c] ?? c} ${summary?.cells[c]}`}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {error && <li className="p-4 text-[13px] text-drop-text">{(error as Error).message}</li>}
            {videos.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => choose(v.id)}
                  aria-current={picked === v.id ? "true" : undefined}
                  className={clsx(
                    "relative flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors duration-150",
                    picked === v.id ? "bg-accent-wash" : "hover:bg-surface-2/60",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`}
                    alt=""
                    className="h-[50px] w-[88px] shrink-0 rounded-chip bg-surface-2 object-cover"
                    loading="lazy"
                  />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-[13px] leading-snug font-[500] text-ink">{v.title}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                      {v.channel} · {CELL_LABEL[v.cell] ?? v.cell} · {fmtTime(v.duration)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Stage */}
        <section className="flex min-h-0 flex-col overflow-y-auto px-8 py-6 compact:px-6" aria-label="Blind test">
          {!video ? (
            <div className="grid flex-1 place-items-center text-center">
              <div className="flex max-w-sm flex-col items-center gap-2">
                <span className="mb-1 grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
                  <EyeOff size={19} aria-hidden />
                </span>
                <p className="text-[16px] font-[600]">Pick any video on the left</p>
                <p className="text-[13.5px] text-ink-2">
                  Every one is from a channel the model never trained on, so the prediction is genuinely blind.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-[18px] leading-tight font-[600] tracking-[-0.01em]">{video.title}</h2>
                  <p className="mt-1 text-[13px] text-ink-3">
                    {video.channel} · {CELL_LABEL[video.cell] ?? video.cell} · {fmtTime(video.duration)} ·{" "}
                    {video.text_kind === "asr" ? "transcribed with Whisper" : "YouTube captions"} ·{" "}
                    <a className="underline" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">
                      watch on YouTube
                    </a>
                  </p>
                </div>
                <div className="flex gap-2">
                  {step === "pick" && (
                    <Button onClick={() => setStep("predicted")}>
                      <Play size={15} aria-hidden /> Predict blind
                    </Button>
                  )}
                  {step === "predicted" && (
                    <button
                      type="button"
                      onClick={() => setStep("revealed")}
                      className="inline-flex h-(--h-control) items-center gap-2 rounded-control bg-actual px-(--px-control) text-(length:--fs-control) text-primary-fg [font-weight:var(--fw-control)] transition-[filter] duration-150 hover:brightness-110"
                    >
                      <Eye size={15} aria-hidden /> Reveal YouTube’s curve
                    </button>
                  )}
                  {step === "revealed" && (
                    <Button variant="secondary" onClick={() => setStep("pick")}>
                      <RotateCcw size={15} aria-hidden /> Run again
                    </Button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-5 text-[12.5px] text-ink-3">
                <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 rounded-full bg-ink" />Retent AI, blind</span>
                <span className={clsx("flex items-center gap-1.5 transition-opacity duration-500", step === "revealed" ? "opacity-100" : "opacity-30")}>
                  <span className="h-[2px] w-4 rounded-full bg-actual" />YouTube “Most replayed”
                </span>
                {step === "revealed" && video.series?.llm && (
                  <button
                    type="button"
                    onClick={() => setShowLlm((v) => !v)}
                    aria-pressed={showLlm}
                    className={clsx("ml-auto flex h-(--h-control-sm) items-center gap-1.5 rounded-control border px-2.5 text-[12px] font-[500] transition-colors",
                      showLlm ? "border-rev-gold text-ink" : "border-line-strong text-ink-2 hover:border-ink-3")}
                  >
                    <span className="h-[2px] w-4" style={{ background: "var(--rev-gold)" }} />
                    {showLlm ? "Hide" : "Compare with"} AI alone
                    {showLlm && video.metrics.llm && (
                      <span className="tnum text-ink-3">({video.metrics.llm.spearman >= 0 ? "+" : "−"}{Math.abs(video.metrics.llm.spearman).toFixed(2)})</span>
                    )}
                  </button>
                )}
              </div>
              <Panel padded={false} className="mt-2 h-[clamp(260px,42vh,420px)] px-2 pt-2">
                <InterestChart
                  key={video.id}
                  model={video.series!.model}
                  actual={video.series!.actual}
                  duration={video.duration}
                  predicted={step !== "pick"}
                  revealed={step === "revealed"}
                  llm={showLlm ? video.series!.llm ?? null : null}
                />
              </Panel>

              {step !== "revealed" && video.confidence && (
                <div className="mt-4 max-w-[760px]">
                  <ConfidenceCard
                    title="Before the reveal: how much to trust this prediction"
                    level={video.confidence.level}
                    evidence={video.confidence.evidence_text}
                    disclaimer={video.confidence.level === "low"
                      ? "Low confidence: the model is often wrong on videos like this one. Expect the curves to differ."
                      : null}
                  />
                </div>
              )}

              {step === "revealed" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-5 grid gap-4 sm:grid-cols-3"
                >
                  <div className="rounded-panel border border-line bg-surface p-4">
                    <p className="text-[13px] text-ink-2">Shape match (rank correlation)</p>
                    <p className="tnum mt-1 text-[30px] leading-none font-[600]">
                      <CountUp value={video.metrics.model.spearman} />
                    </p>
                    <p className="tnum mt-1.5 text-[12.5px] text-ink-3">
                      position-only baseline {video.metrics.position.spearman >= 0 ? "+" : ""}
                      {video.metrics.position.spearman.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-panel border border-line bg-surface p-4">
                    <p className="text-[13px] text-ink-2">Biggest moments found</p>
                    <p className="tnum mt-1 text-[30px] leading-none font-[600]">
                      <CountUp value={video.metrics.model.peaks_found * 10} digits={0} signed={false} />
                      <span className="text-[18px] text-ink-3"> of 10</span>
                    </p>
                    <p className="mt-1.5 text-[12.5px] text-ink-3">top-10 replayed moments, within ±1%</p>
                  </div>
                  <div className="rounded-panel border border-line bg-surface p-4">
                    <p className="text-[13px] text-ink-2">Quietest stretches found</p>
                    <p className="tnum mt-1 text-[30px] leading-none font-[600]">
                      <CountUp value={video.metrics.model.dips_found * 10} digits={0} signed={false} />
                      <span className="text-[18px] text-ink-3"> of 10</span>
                    </p>
                    <p className="mt-1.5 text-[12.5px] text-ink-3">the 10 least-replayed moments, within ±1%</p>
                  </div>
                </motion.div>
              )}
              {step === "revealed" && video.explain && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.5, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]"
                >
                  <WhyDiffer explain={video.explain} />
                  {video.confidence && (
                    <ConfidenceCard
                      title="What we said before the reveal"
                      level={video.confidence.level}
                      evidence={video.confidence.evidence_text}
                    />
                  )}
                </motion.div>
              )}
              <p className="mt-5 max-w-[80ch] text-[12.5px] text-ink-3">
                “Most replayed” shows relative interest within a video, rewatches included. It is not the share of viewers
                still watching. Both curves are drawn on a relative scale: each is stretched between its own 5th and 95th
                percentile, so one extreme moment (usually the opening) can’t flatten the rest. The scores compare ranks,
                so they don’t depend on this scaling.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
