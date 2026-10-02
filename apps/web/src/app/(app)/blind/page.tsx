"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Eye, EyeOff, Play, RotateCcw } from "lucide-react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useMemo, useState } from "react";

import { InterestChart } from "@/components/lab/InterestChart";
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
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-rule px-8 pt-7 pb-5">
        <h1 className="text-[26px] leading-tight font-[650] wdth-wide">Blind test</h1>
        <p className="mt-1 max-w-[78ch] text-[14px] text-ink-2">
          Pick a real public video. Retent AI predicts where attention rises and falls <em>from the transcript alone</em>,
          using a model trained without this video’s channel. Then we reveal YouTube’s own “Most replayed” curve.
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Video picker */}
        <aside className="flex min-h-0 flex-col border-r border-rule" aria-label="Videos">
          <div className="flex flex-wrap gap-1 border-b border-rule px-4 py-3">
            {["all", ...Object.keys(summary?.cells ?? {})].map((c) => (
              <button
                key={c}
                onClick={() => setCell(c)}
                className={clsx(
                  "rounded-full px-2.5 py-1 text-[12px] font-[560] transition-colors duration-150",
                  cell === c ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-sunk",
                )}
              >
                {c === "all" ? `All ${summary?.n_videos ?? ""}` : `${CELL_LABEL[c] ?? c} ${summary?.cells[c]}`}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {error && <li className="p-4 text-[13px] text-pen-text">{(error as Error).message}</li>}
            {videos.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => choose(v.id)}
                  className={clsx(
                    "flex w-full gap-3 border-b border-rule px-4 py-3 text-left transition-colors duration-150",
                    picked === v.id ? "bg-paper-sunk" : "hover:bg-paper-sunk/60",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`}
                    alt=""
                    className="h-[50px] w-[88px] shrink-0 rounded-[4px] bg-paper-sunk object-cover"
                    loading="lazy"
                  />
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-[13px] leading-snug font-[580] text-ink">{v.title}</span>
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
        <section className="flex min-h-0 flex-col overflow-y-auto px-8 py-6" aria-label="Blind test">
          {!video ? (
            <div className="grid flex-1 place-items-center text-center">
              <div className="max-w-sm">
                <EyeOff className="mx-auto mb-3 text-ink-3" aria-hidden />
                <p className="text-[16px] font-[620]">Pick any video on the left.</p>
                <p className="mt-1 text-[14px] text-ink-2">
                  Every one is from a channel the model never trained on, so the prediction is genuinely blind.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-[19px] leading-tight font-[640]">{video.title}</h2>
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
                    <button
                      onClick={() => setStep("predicted")}
                      className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-4 py-2 text-[14px] font-[620] text-paper transition-colors duration-200 hover:bg-cover"
                    >
                      <Play size={15} aria-hidden /> Predict blind
                    </button>
                  )}
                  {step === "predicted" && (
                    <button
                      onClick={() => setStep("revealed")}
                      className="inline-flex items-center gap-2 rounded-[8px] px-4 py-2 text-[14px] font-[620] text-paper transition-[filter] duration-200 hover:brightness-110"
                      style={{ background: "var(--actual)" }}
                    >
                      <Eye size={15} aria-hidden /> Reveal YouTube’s curve
                    </button>
                  )}
                  {step === "revealed" && (
                    <button
                      onClick={() => setStep("pick")}
                      className="inline-flex items-center gap-2 rounded-[8px] border border-rule-strong px-4 py-2 text-[14px] font-[600] text-ink hover:border-ink/40"
                    >
                      <RotateCcw size={15} aria-hidden /> Run again
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-5 text-[12.5px] text-ink-3">
                <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-ink" />Retent AI, blind</span>
                <span className={clsx("flex items-center gap-1.5 transition-opacity duration-500", step === "revealed" ? "opacity-100" : "opacity-30")}>
                  <span className="h-[2px] w-4" style={{ background: "var(--actual)" }} />YouTube “Most replayed”
                </span>
              </div>
              <div className="mt-2 h-[clamp(260px,42vh,420px)] rounded-[6px] border border-rule bg-paper-raised">
                <InterestChart
                  key={video.id}
                  model={video.series!.model}
                  actual={video.series!.actual}
                  duration={video.duration}
                  predicted={step !== "pick"}
                  revealed={step === "revealed"}
                />
              </div>

              {step === "revealed" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-5 grid gap-4 sm:grid-cols-3"
                >
                  <div className="rounded-[7px] border border-rule bg-paper-raised p-4">
                    <p className="text-[13px] text-ink-2">Shape match (rank correlation)</p>
                    <p className="tnum mt-1 text-[30px] leading-none font-[640] wdth-wide">
                      <CountUp value={video.metrics.model.spearman} />
                    </p>
                    <p className="tnum mt-1.5 text-[12.5px] text-ink-3">
                      position-only baseline {video.metrics.position.spearman >= 0 ? "+" : ""}
                      {video.metrics.position.spearman.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-[7px] border border-rule bg-paper-raised p-4">
                    <p className="text-[13px] text-ink-2">Biggest moments found</p>
                    <p className="tnum mt-1 text-[30px] leading-none font-[640] wdth-wide">
                      <CountUp value={video.metrics.model.peaks_found * 10} digits={0} signed={false} />
                      <span className="text-[18px] text-ink-3"> of 10</span>
                    </p>
                    <p className="mt-1.5 text-[12.5px] text-ink-3">top-10 replayed moments, within ±1%</p>
                  </div>
                  <div className="rounded-[7px] border border-rule bg-paper-raised p-4">
                    <p className="text-[13px] text-ink-2">Quietest stretches found</p>
                    <p className="tnum mt-1 text-[30px] leading-none font-[640] wdth-wide">
                      <CountUp value={video.metrics.model.dips_found * 10} digits={0} signed={false} />
                      <span className="text-[18px] text-ink-3"> of 10</span>
                    </p>
                    <p className="mt-1.5 text-[12.5px] text-ink-3">the 10 least-replayed moments, within ±1%</p>
                  </div>
                </motion.div>
              )}
              <p className="mt-5 max-w-[80ch] text-[12.5px] text-ink-3">
                “Most replayed” shows relative interest within a video, rewatches included. It is not the share of viewers
                still watching. That’s why both curves are drawn on a 0–1 relative scale.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
