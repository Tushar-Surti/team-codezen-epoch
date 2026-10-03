"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ImageUp } from "lucide-react";
import { motion } from "motion/react";
import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Dropzone, Field, Input, Panel, PanelHeader, Select } from "@/components/ui";
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

const PAD = { l: 44, r: 16, t: 12, b: 26 };

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
              <line x1={PAD.l} x2={width - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === 0 ? undefined : "2 3"} />
              <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="tc fill-ink-3 text-[11px]">{v * 100}%</text>
            </g>
          ))}
          {duration > 0 &&
            [0, 0.25, 0.5, 0.75, 1].map((f) => (
              <text key={f} x={x(f * 99)} y={y(0) + 18} textAnchor="middle" className="tc fill-ink-3 text-[11px]">{fmtTime(f * duration)}</text>
            ))}
          {predicted && <path d={ln(predicted) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />}
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
    <div className="flex flex-col gap-1">
      <p className="text-[12.5px] text-ink-3">{label}</p>
      <p className="flex items-baseline gap-2">
        <span className="tnum text-[26px] leading-none font-[600] tracking-[-0.02em] text-actual">{fmt(actual)}</span>
        <span className="text-[12px] text-ink-3">actual</span>
      </p>
      <p className="text-[12.5px] text-ink-2">
        Predicted <strong className="tnum font-[600] text-ink">{fmt(predicted)}</strong>
      </p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-3">
      <span className="tc grid size-[22px] place-items-center rounded-full border border-line-strong text-[11px] font-[500] text-ink-2">{n}</span>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-[13.5px] leading-[22px] font-[600]">{title}</p>
        {children}
      </div>
    </div>
  );
}

export default function RetentionImportPage() {
  const { data: list } = useQuery({ queryKey: ["analyses"], queryFn: api.list });
  const [analysisId, setAnalysisId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [yTop, setYTop] = useState("100");

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
      <PageHeader
        title="Studio check"
        description={
          <>
            Already published? Drop in the <strong className="font-[600] text-ink">audience retention</strong> screenshot from YouTube
            Studio. Retent AI reads the real curve off the image and lays its prediction over it, so you can see how close it got on your
            own channel. No channel login needed.
          </>
        }
      />

      <div className="grid items-start gap-6 px-8 py-6 compact:px-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Panel className="flex flex-col gap-6 lg:sticky lg:top-6" aria-label="Setup">
          <Step n={1} title="Which video is it?">
            <Field label={<span className="sr-only">Video</span>} help="Analyze the video first (script, YouTube link or rough cut), then pick it here.">
              <Select
                value={analysisId}
                onChange={(e) => {
                  setAnalysisId(e.target.value);
                  run.reset();
                }}
              >
                <option value="">Just read the screenshot (no comparison)</option>
                {list?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </Select>
            </Field>
          </Step>

          <Step n={2} title="The Studio screenshot">
            <Dropzone accept="image/*" onFile={pick} label="Studio screenshot" className="min-h-[150px] gap-1 p-4">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Your screenshot" className="max-h-[140px] rounded-chip object-contain" />
              ) : (
                <>
                  <ImageUp size={22} strokeWidth={1.6} className="mb-1 text-ink-3" aria-hidden />
                  <span className="text-[13.5px] font-[600]">Drop the screenshot or click to choose</span>
                  <span className="text-[12px] text-ink-3">Studio → the video → Analytics → Engagement → Audience retention</span>
                </>
              )}
            </Dropzone>
          </Step>

          <Step n={3} title="Top line of the chart">
            <Field label={<span className="sr-only">Top of the chart, in percent</span>} help="Usually 100%. If Studio’s chart tops out at 120%, enter 120.">
              <div className="relative w-28">
                <Input
                  value={yTop}
                  onChange={(e) => setYTop(e.target.value.replace(/[^0-9.]/g, ""))}
                  inputMode="decimal"
                  className="tnum pr-8"
                />
                <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-ink-3">
                  %
                </span>
              </div>
            </Field>
          </Step>

          <div className="flex flex-col gap-2 border-t border-line pt-5">
            <Button size="lg" block onClick={() => run.mutate()} disabled={!file} loading={run.isPending}>
              {analysisId ? "Compare with the prediction" : "Read the curve"}
            </Button>
            {run.error && (
              <p role="alert" className="text-[13px] text-drop-text">
                {(run.error as Error).message}
              </p>
            )}
          </div>
        </Panel>

        <section aria-label="Result" className="flex min-w-0 flex-col gap-4">
          {!r ? (
            <Panel padded={false} className="grid min-h-[380px] place-items-center p-8 text-center">
              <div className="flex max-w-md flex-col items-center gap-2">
                <span className="mb-1 grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
                  <ImageUp size={20} strokeWidth={1.6} aria-hidden />
                </span>
                <p className="text-[16px] font-[600]">The check analysts ask for first</p>
                <p className="text-[13.5px] leading-relaxed text-ink-2">
                  YouTube’s public data only shows <em>relative</em> interest. A Studio screenshot carries the real share of viewers still
                  watching, the number creators live by.
                </p>
              </div>
            </Panel>
          ) : (
            <>
              <Panel aria-labelledby="studio-chart">
                <PanelHeader
                  id="studio-chart"
                  title={c ? c.title : "Retention read from the screenshot"}
                  actions={
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className="h-[2px] w-4 bg-actual" />
                        Actual (YouTube Studio)
                      </span>
                      {c && (
                        <span className="flex items-center gap-1.5">
                          <span className="h-[2px] w-4 bg-ink" />
                          Retent AI prediction
                        </span>
                      )}
                    </>
                  }
                />
                <div className="h-[300px]">
                  <RetentionChart actual={r.actual} predicted={c?.predicted ?? null} duration={c?.duration ?? 0} />
                </div>
              </Panel>

              {c && (
                <Panel padded={false} className="grid sm:grid-cols-2 xl:grid-cols-4" aria-label="Prediction against actual">
                  <div className="flex flex-col gap-1 border-b border-line p-(--pad-panel) sm:border-r xl:border-b-0">
                    <p className="text-[12.5px] text-ink-3">Average gap</p>
                    <p className="tnum text-[26px] leading-none font-[600] tracking-[-0.02em]">{c.mae_pts.toFixed(1)} pts</p>
                    <p className="tnum text-[12.5px] text-ink-2">
                      Shape match {c.shape >= 0 ? "+" : "−"}
                      {Math.abs(c.shape).toFixed(2)}
                    </p>
                  </div>
                  <div className="border-b border-line p-(--pad-panel) xl:border-r xl:border-b-0">
                    <Stat label="Intro retention (0:30)" actual={c.intro_actual} predicted={c.intro_pred} fmt={pct} />
                  </div>
                  <div className="border-b border-line p-(--pad-panel) sm:border-r sm:border-b-0">
                    <Stat label="Average percentage viewed" actual={c.apv_actual} predicted={c.apv_pred} fmt={pct} />
                  </div>
                  <div className="p-(--pad-panel)">
                    <Stat label="Average view duration" actual={c.apv_actual * c.duration} predicted={c.apv_pred * c.duration} fmt={fmtTime} />
                  </div>
                </Panel>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel aria-labelledby="studio-reading">
                  <PanelHeader id="studio-reading" title="Check the reading" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${API_URL}${r.overlay_url}`}
                    alt="Screenshot with the digitized curve drawn in red"
                    className="w-full rounded-control border border-line"
                  />
                  <p className="mt-2 text-[12px] text-ink-3">
                    The red line should sit on Studio’s blue line. Coverage <span className="tnum">{Math.round(r.coverage * 100)}%</span>.
                    {r.warnings.length > 0 && <span className="text-drop-text"> {r.warnings.join("; ")}.</span>}
                  </p>
                </Panel>
                <Panel aria-labelledby="studio-meaning">
                  <PanelHeader id="studio-meaning" title="What this means" />
                  <ul className="flex list-disc flex-col gap-2 pl-5 text-[13.5px] leading-relaxed text-ink-2 marker:text-ink-3">
                    <li>This is your real audience retention: the share of viewers still watching at each moment.</li>
                    <li>
                      Retent AI learned the curve’s <em>shape</em> from public videos; its absolute level is a prior until it sees real
                      Studio curves like this one.
                    </li>
                    <li>Every screenshot you check is saved as a calibration point, so the level gets more accurate for creators like you.</li>
                  </ul>
                </Panel>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
