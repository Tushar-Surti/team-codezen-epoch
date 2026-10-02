"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { InterestChart } from "@/components/lab/InterestChart";
import { API_URL } from "@/lib/api";
import { CELL_LABEL, FEATURE_LABEL, METHOD_LABEL, evalApi, type EvalVideo, type Interval } from "@/lib/eval";

const METRICS = [
  { key: "spearman", label: "Shape match", hint: "rank correlation with YouTube's curve", domain: [-0.1, 0.4], fmt: (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(3)}` },
  { key: "peaks_found", label: "Peaks found", hint: "of the 10 most replayed moments", domain: [0, 0.6], fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
  { key: "dips_found", label: "Dips found", hint: "of the 10 least replayed moments", domain: [0, 0.6], fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
] as const;
const METHODS = ["model", "position", "rules_v0", "random"] as const;

function IntervalBar({ iv, domain, strong }: { iv: Interval; domain: readonly [number, number]; strong: boolean }) {
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - domain[0]) / (domain[1] - domain[0])) * 100))}%`;
  return (
    <div className="relative mt-1.5 h-3 w-full" aria-hidden>
      <span className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-rule" />
      <span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ left: pos(iv.lo), width: `calc(${pos(iv.hi)} - ${pos(iv.lo)})`, background: strong ? "var(--ink)" : "var(--rule-strong)" }} />
      <span className="absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper-raised" style={{ left: pos(iv.mean), background: strong ? "var(--ink)" : "var(--ink-3)" }} />
    </div>
  );
}

function Gallery({ ids, label, videos }: { ids: string[]; label: string; videos: EvalVideo[] }) {
  const qs = useQueries({ queries: ids.map((id) => ({ queryKey: ["eval-video", id], queryFn: () => evalApi.video(id) })) });
  return (
    <>
      {qs.map((q, i) => {
        const v = q.data ?? videos.find((x) => x.id === ids[i]);
        if (!v) return null;
        return (
          <figure key={ids[i]} className="rounded-[7px] border border-rule bg-paper-raised p-3">
            <figcaption className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12.5px] font-[600] text-ink" title={v.title}>{v.title}</span>
              <span className="tnum shrink-0 text-[12px] text-ink-2">{v.metrics.model.spearman >= 0 ? "+" : "−"}{Math.abs(v.metrics.model.spearman).toFixed(2)}</span>
            </figcaption>
            <p className="truncate text-[11.5px] text-ink-3">{label} · {v.channel} · {CELL_LABEL[v.cell] ?? v.cell}</p>
            <div className="mt-2 h-[96px]">
              {v.series ? <InterestChart model={v.series.model} actual={v.series.actual} duration={v.duration} compact /> : null}
            </div>
          </figure>
        );
      })}
    </>
  );
}

type StudioSummary = { n: number; mean_mae_pts?: number; mean_shape?: number; checks: { id: string; title: string; mae_pts: number; shape: number }[] };

export default function LabPage() {
  const { data: r, error } = useQuery({ queryKey: ["eval"], queryFn: evalApi.summary });
  const { data: studio } = useQuery({
    queryKey: ["studio-summary"],
    queryFn: () => fetch(`${API_URL}/api/retention/summary`).then((x) => x.json() as Promise<StudioSummary>),
  });

  const gallery = useMemo(() => {
    if (!r) return null;
    const sorted = [...r.videos].sort((a, b) => b.metrics.model.spearman - a.metrics.model.spearman);
    const mid = Math.floor(sorted.length / 2);
    return {
      best: sorted.slice(0, 2).map((v) => v.id),
      typical: sorted.slice(mid - 1, mid + 1).map((v) => v.id),
      worst: sorted.slice(-2).map((v) => v.id),
    };
  }, [r]);

  if (error) {
    return <div className="p-8 text-[14px] text-pen-text">{(error as Error).message}</div>;
  }
  if (!r || !gallery) return <div className="p-8 text-[14px] text-ink-3">Loading the evaluation…</div>;
  const s = r.summary;

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-rule px-8 pt-7 pb-5">
        <h1 className="text-[26px] leading-tight font-[650] wdth-wide">How accurate is it?</h1>
        <p className="mt-1 max-w-[82ch] text-[14px] text-ink-2">
          Tested on <strong className="font-[620] text-ink">{r.n_videos} public videos from {r.n_channels} channels</strong>, each one
          scored by a model that never saw its channel (5-fold split by channel). Every number here is computed by the
          training run <span className="tnum">{r.version}</span>; nothing is typed in by hand.
        </p>
      </header>

      <div className="space-y-10 px-8 py-7">
        <section aria-labelledby="results">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="results" className="text-[17px] font-[640]">Against simple baselines</h2>
            <p className="text-[13px] text-ink-2">
              Retent AI beats <strong className="font-[620] text-ink">position only on {Math.round(s.wins.position * 100)}%</strong> of videos and
              random on {Math.round(s.wins.random * 100)}%. Bars show 95% confidence intervals.
            </p>
          </div>
          <div className="mt-3 overflow-x-auto rounded-[7px] border border-rule bg-paper-raised">
            <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-rule text-[12.5px] text-ink-3">
                  <th className="px-4 py-2.5 font-[560]">Method</th>
                  {METRICS.map((m) => (
                    <th key={m.key} className="px-4 py-2.5 font-[560]">
                      {m.label} <span className="font-[450]">· {m.hint}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METHODS.map((name) => (
                  <tr key={name} className={name === "model" ? "border-b border-rule bg-rev-blue-paper/40" : "border-b border-rule last:border-b-0"}>
                    <td className="px-4 py-3">
                      <span className={name === "model" ? "font-[640] text-ink" : "text-ink-2"}>{METHOD_LABEL[name]}</span>
                      <span className="block text-[11.5px] text-ink-3">
                        {name === "model" && "position prior + what the script adds"}
                        {name === "position" && "people always watch the start"}
                        {name === "rules_v0" && "hand-weighted rules, before training"}
                        {name === "random" && "the floor"}
                      </span>
                    </td>
                    {METRICS.map((m) => {
                      const iv = s.overall[name][m.key];
                      return (
                        <td key={m.key} className="px-4 py-3 align-top">
                          <span className={`tnum ${name === "model" ? "font-[640]" : "text-ink-2"}`}>{m.fmt(iv.mean)}</span>
                          <span className="tnum ml-1.5 text-[11.5px] text-ink-3">[{m.fmt(iv.lo)}, {m.fmt(iv.hi)}]</span>
                          <IntervalBar iv={iv} domain={m.domain} strong={name === "model"} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {s.llm_head_to_head && (
          <section aria-labelledby="llm" className="rounded-[8px] border border-ink/25 bg-paper-raised p-5">
            <h2 id="llm" className="text-[17px] font-[640]">Why not just ask an AI?</h2>
            <p className="mt-1 max-w-[86ch] text-[14px] text-ink-2">
              We gave a large language model ({s.llm_head_to_head.model_name}) the same transcript and asked it directly where
              viewers would be most and least interested. Same {s.llm_head_to_head.n} held-out videos, same scoring.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {(["model", "llm", "position"] as const).map((k) => {
                const iv = s.llm_head_to_head![k].spearman;
                const label = k === "model" ? "Retent AI model" : k === "llm" ? "AI alone, zero-shot" : "Position only";
                return (
                  <div key={k} className={k === "model" ? "border-t-2 border-ink pt-3" : "border-t border-rule-strong pt-3"}>
                    <p className="text-[13px] text-ink-3">{label}</p>
                    <p className={`tnum mt-1 text-[30px] leading-none font-[650] wdth-wide ${k === "model" ? "" : "text-ink-2"}`}>
                      {iv.mean >= 0 ? "+" : "−"}{Math.abs(iv.mean).toFixed(3)}
                    </p>
                    <p className="tnum mt-1 text-[12px] text-ink-3">
                      shape match · 95% CI [{iv.lo >= 0 ? "+" : "−"}{Math.abs(iv.lo).toFixed(2)}, {iv.hi >= 0 ? "+" : "−"}{Math.abs(iv.hi).toFixed(2)}]
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-[14px] text-ink-2">
              Retent AI beats the AI alone on <strong className="font-[650] text-ink">{Math.round(s.llm_head_to_head.model_beats_llm * 100)}%</strong> of
              these videos. Language models are good at reading a script; predicting where real viewers rewatch or tune out
              needs a model trained on what viewers actually did.
            </p>
          </section>
        )}

        {studio && studio.n > 0 && (
          <section aria-labelledby="studio" className="rounded-[8px] border border-rule bg-paper-raised p-5">
            <h2 id="studio" className="text-[17px] font-[640]">Checked against real YouTube Studio retention</h2>
            <p className="mt-1 max-w-[86ch] text-[14px] text-ink-2">
              Real absolute retention from Studio screenshots, each compared with the prediction for that video (see Studio check).
            </p>
            <div className="mt-3 flex flex-wrap gap-8">
              <p><span className="tnum text-[28px] font-[650] wdth-wide">{studio.n}</span> <span className="text-[13px] text-ink-3">videos checked</span></p>
              <p><span className="tnum text-[28px] font-[650] wdth-wide">{studio.mean_mae_pts?.toFixed(1)} pts</span> <span className="text-[13px] text-ink-3">average gap</span></p>
              <p><span className="tnum text-[28px] font-[650] wdth-wide">{(studio.mean_shape ?? 0) >= 0 ? "+" : "−"}{Math.abs(studio.mean_shape ?? 0).toFixed(2)}</span> <span className="text-[13px] text-ink-3">shape match</span></p>
            </div>
          </section>
        )}

        <div className="grid gap-10 lg:grid-cols-2">
          <section aria-labelledby="cells">
            <h2 id="cells" className="text-[17px] font-[640]">By category and language</h2>
            <table className="mt-3 w-full border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-rule-strong text-[12.5px] text-ink-3">
                  <th className="py-2 font-[560]">Category</th>
                  <th className="py-2 text-right font-[560]">Videos</th>
                  <th className="py-2 text-right font-[560]">Retent AI</th>
                  <th className="py-2 text-right font-[560]">Position only</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(s.by_cell).map(([cell, v]) => (
                  <tr key={cell} className="border-b border-rule">
                    <td className="py-2.5">{CELL_LABEL[cell] ?? cell}</td>
                    <td className="tnum py-2.5 text-right text-ink-2">{v.n}</td>
                    <td className="tnum py-2.5 text-right font-[600]">{v.model >= 0 ? "+" : "−"}{Math.abs(v.model).toFixed(2)}</td>
                    <td className="tnum py-2.5 text-right text-ink-2">{v.position >= 0 ? "+" : "−"}{Math.abs(v.position).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12px] text-ink-3">Shape match per category. Cells with few videos swing a lot; read them as early signals.</p>
          </section>

          <section aria-labelledby="signals">
            <h2 id="signals" className="text-[17px] font-[640]">What the model listens to</h2>
            <ol className="mt-3 space-y-1.5">
              {r.top_features.map((f, i) => (
                <li key={f} className="flex items-baseline gap-3 text-[14px]">
                  <span className="tnum w-5 text-right text-[12px] text-ink-3">{i + 1}</span>
                  <span>{FEATURE_LABEL[f] ?? f}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[12px] text-ink-3">
              Ranked by how much each signal improves predictions on top of the position prior (LightGBM gain).
            </p>
          </section>
        </div>

        <section aria-labelledby="gallery">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="gallery" className="text-[17px] font-[640]">Best, typical and worst cases</h2>
            <p className="flex items-center gap-4 text-[12.5px] text-ink-3">
              <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-ink" />Retent AI, blind</span>
              <span className="flex items-center gap-1.5"><span className="h-[2px] w-4" style={{ background: "var(--actual)" }} />YouTube “Most replayed”</span>
              <Link href="/blind" className="font-[600] text-ink underline">Try any video in the blind test</Link>
            </p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Gallery ids={gallery.best} label="Best" videos={r.videos} />
            <Gallery ids={gallery.typical} label="Typical" videos={r.videos} />
            <Gallery ids={gallery.worst} label="Worst" videos={r.videos} />
          </div>
        </section>

        <section aria-labelledby="limits" className="max-w-[86ch] rounded-[7px] border border-rule bg-paper-raised p-5">
          <h2 id="limits" className="text-[15px] font-[640]">What these numbers do and don’t say</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] text-ink-2">
            <li>“Most replayed” is YouTube’s public measure of <em>relative</em> interest within a video, rewatches included. It trains the curve’s <em>shape</em>; it is not the share of viewers still watching.</li>
            <li>The absolute retention level in the workspace is an uncalibrated prior until it’s fitted on real YouTube Studio curves.</li>
            <li>This is an early dataset ({r.n_videos} videos with transcripts). Confidence intervals still overlap; the evaluation re-runs automatically as more transcripts arrive.</li>
            <li>Splits are by channel, so a creator’s style can’t leak from training into testing.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
