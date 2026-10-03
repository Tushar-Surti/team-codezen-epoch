"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ImageUp, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { useState } from "react";

import { API_URL, api } from "@/lib/api";
import { fmtTime } from "@/lib/format";
import { useSize } from "@/lib/useSize";

type Comparison = {
  analysis_id: string;
  title: string;
  duration: number;
  predicted: number[];
  mae_pts: number;
  shape: number;
  intro_actual: number;
  intro_pred: number;
  apv_actual: number;
  apv_pred: number;
};
type ImportResult = { id: string; actual: number[]; coverage: number; warnings: string[]; overlay_url: string; comparison: Comparison | null };

const PAD = { l: 48, r: 16, t: 12, b: 26 };

function RetentionChart({ actual, predicted, duration }: { actual: number[]; predicted: number[] | null; duration: number }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const x = scaleLinear().domain([0, 99]).range([PAD.l, Math.max(PAD.l + 10, width - PAD.r)]);
  const y = scaleLinear().domain([0, 1]).range([Math.max(PAD.t + 10, height - PAD.b), PAD.t]);
  const ln = line<number>().x((_, i) => x(i)).y((v) => y(Math.min(1.2, v))).curve(curveMonotoneX);
  return (
    <div ref={ref} className="h-full w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Actual retention from YouTube Studio against Retent AI's prediction">
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--rule)" />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="fill-ink-3 text-[11px]">{v * 100}%</text>
            </g>
          ))}
          {duration > 0 &&
            [0, 0.25, 0.5, 0.75, 1].map((f) => (
              <text key={f} x={x(f * 99)} y={y(0) + 18} textAnchor="middle" className="tnum fill-ink-3 text-[11px]">{fmtTime(f * duration)}</text>
            ))}
          {predicted && <path d={ln(predicted) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={2.2} strokeLinecap="round" />}
          <motion.path
            d={ln(actual) ?? ""}
            fill="none"
            stroke="var(--actual)"
            strokeWidth={2.4}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
      )}
    </div>
  );
}

function Stat({ label, actual, predicted, fmt }: { label: string; actual: number; predicted: number; fmt: (v: number) => string }) {
  return (
    <div className="border-t border-rule-strong pt-3">
      <p className="text-[13px] text-ink-3">{label}</p>
      <p className="mt-1 flex items-baseline gap-3">
        <span className="tnum text-[26px] leading-none font-[650] wdth-wide" style={{ color: "var(--actual)" }}>{fmt(actual)}</span>
        <span className="text-[12.5px] text-ink-3">actual</span>
      </p>
      <p className="tnum mt-1 text-[13px] text-ink-2">
        Retent AI predicted <strong className="font-[620] text-ink">{fmt(predicted)}</strong>
      </p>
    </div>
  );
}

export default function RetentionImportPage() {
  const { data: list } = useQuery({ queryKey: ["analyses"], queryFn: api.list });
  const [analysisId, setAnalysisId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [yTop, setYTop] = useState("100");
  const [dragging, setDragging] = useState(false);

  const run = useMutation({
    mutationFn: async (): Promise<ImportResult> => {
      const form = new FormData();
      form.append("image", file!);
      if (analysisId) form.append("analysis_id", analysisId);
      form.append("y_top", String(Number(yTop) / 100 || 1));
      const res = await fetch(`${API_URL}/api/retention/import`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
      return res.json();
    },
  });
  const r = run.data;
  const pick = (f: File | null) => {
    setFile(f);
    run.reset();
    setPreview(f ? URL.createObjectURL(f) : null);
  };
  const c = r?.comparison ?? null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-rule px-8 pt-7 pb-5">
        <h1 className="text-[26px] leading-tight font-[650] wdth-wide">Real retention check</h1>
        <p className="mt-1 max-w-[82ch] text-[14px] text-ink-2">
          Already published? Drop in the <strong className="font-[620] text-ink">audience retention</strong> screenshot from YouTube
          Studio. Retent AI reads the real curve off the image and lays its own prediction over it, so you can see how close it got on
          your own channel. No channel login needed.
        </p>
      </header>

      <div className="grid gap-8 px-8 py-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-[13.5px] font-[600]">1 · Which video is it?</span>
            <select
              value={analysisId}
              onChange={(e) => {
                setAnalysisId(e.target.value);
                run.reset();
              }}
              className="w-full rounded-[7px] border border-rule-strong bg-paper-raised px-3 py-2 text-[14px] outline-none focus:border-ink"
            >
              <option value="">Just read the screenshot (no comparison)</option>
              {list?.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
            <span className="mt-1 block text-[12px] text-ink-3">Analyze the video first (script, YouTube link or rough cut), then pick it here.</span>
          </label>

          <div>
            <span className="mb-1.5 block text-[13.5px] font-[600]">2 · The Studio screenshot</span>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0] ?? null);
              }}
              className={clsx(
                "flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed p-4 text-center transition-colors",
                dragging ? "border-ink bg-paper-sunk" : "border-rule-strong bg-paper-raised hover:border-ink/40",
              )}
            >
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Your screenshot" className="max-h-[140px] rounded-[4px] object-contain" />
              ) : (
                <>
                  <ImageUp size={26} strokeWidth={1.5} className="text-ink-3" aria-hidden />
                  <span className="mt-2 text-[14px] font-[600]">Drop the screenshot or click to choose</span>
                  <span className="mt-0.5 text-[12px] text-ink-3">Studio → the video → Analytics → Engagement → Audience retention</span>
                </>
              )}
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[13.5px] font-[600]">Top line of the chart</span>
            <div className="flex items-center gap-2">
              <input
                value={yTop}
                onChange={(e) => setYTop(e.target.value.replace(/[^0-9.]/g, ""))}
                className="tnum w-24 rounded-[7px] border border-rule-strong bg-paper-raised px-3 py-1.5 text-[14px] outline-none focus:border-ink"
                inputMode="decimal"
              />
              <span className="text-[13px] text-ink-2">%</span>
            </div>
            <span className="mt-1 block text-[12px] text-ink-3">Usually 100%. If Studio’s chart tops out at 120%, enter 120.</span>
          </label>

          <button
            onClick={() => run.mutate()}
            disabled={!file || run.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-ink px-5 py-3 text-[15px] font-[620] text-paper hover:bg-primary-hover disabled:opacity-40"
          >
            {run.isPending && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {analysisId ? "Compare with the prediction" : "Read the curve"}
          </button>
          {run.error && <p className="text-[13px] text-pen-text">{(run.error as Error).message}</p>}
        </aside>

        <section aria-label="Result" className="min-w-0">
          {!r ? (
            <div className="grid h-full min-h-[360px] place-items-center rounded-[8px] border border-rule bg-paper-raised p-8 text-center">
              <div className="max-w-md">
                <p className="text-[16px] font-[620]">This is the check analytics people ask for first.</p>
                <p className="mt-1 text-[14px] text-ink-2">
                  YouTube’s public data only shows <em>relative</em> interest. A Studio screenshot carries the real share of viewers still
                  watching, the number creators live by.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[17px] font-[640]">{c ? c.title : "Retention read from the screenshot"}</h2>
                  <p className="flex items-center gap-4 text-[12.5px] text-ink-3">
                    <span className="flex items-center gap-1.5"><span className="h-[2px] w-4" style={{ background: "var(--actual)" }} />Actual (YouTube Studio)</span>
                    {c && <span className="flex items-center gap-1.5"><span className="h-[2px] w-4 bg-ink" />Retent AI prediction</span>}
                  </p>
                </div>
                <div className="mt-2 h-[300px] rounded-[7px] border border-rule bg-paper-raised">
                  <RetentionChart actual={r.actual} predicted={c?.predicted ?? null} duration={c?.duration ?? 0} />
                </div>
              </div>

              {c && (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="border-t-2 border-ink pt-3">
                    <p className="text-[13px] text-ink-3">Average gap</p>
                    <p className="tnum mt-1 text-[26px] leading-none font-[650] wdth-wide">{c.mae_pts.toFixed(1)} pts</p>
                    <p className="tnum mt-1 text-[13px] text-ink-2">shape match {c.shape >= 0 ? "+" : "−"}{Math.abs(c.shape).toFixed(2)}</p>
                  </div>
                  <Stat label="Intro retention (0:30)" actual={c.intro_actual} predicted={c.intro_pred} fmt={pct} />
                  <Stat label="Average percentage viewed" actual={c.apv_actual} predicted={c.apv_pred} fmt={pct} />
                  <Stat label="Average view duration" actual={c.apv_actual * c.duration} predicted={c.apv_pred * c.duration} fmt={fmtTime} />
                </div>
              )}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <figure>
                  <figcaption className="mb-1.5 text-[13px] font-[600]">Check the reading</figcaption>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${API_URL}${r.overlay_url}`} alt="Screenshot with the digitized curve drawn in red" className="w-full rounded-[6px] border border-rule" />
                  <p className="mt-1.5 text-[12px] text-ink-3">
                    The red line should sit on Studio’s blue line. Coverage {Math.round(r.coverage * 100)}%.
                    {r.warnings.length > 0 && <span className="text-pen-text"> {r.warnings.join("; ")}.</span>}
                  </p>
                </figure>
                <div className="text-[13.5px] text-ink-2">
                  <p className="font-[620] text-ink">What this means</p>
                  <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                    <li>This is your real audience retention: the share of viewers still watching at each moment.</li>
                    <li>Retent AI learned the curve’s <em>shape</em> from public videos; its absolute level is a prior until it sees real Studio curves like this one.</li>
                    <li>Every screenshot you check is saved as a calibration point, so the level gets more accurate for creators like you.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
