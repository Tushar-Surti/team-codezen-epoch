"use client";

import clsx from "clsx";
import { scaleLinear } from "d3-scale";
import { area, curveMonotoneX } from "d3-shape";

import type { Analysis } from "@/lib/contract.gen";
import { fmtTime } from "@/lib/format";
import { SEVERITY_COLOR } from "@/lib/revisions";
import { useSize } from "@/lib/useSize";
import { useWorkspace } from "@/lib/workspace-store";

import { timeScale } from "./geometry";

const LANE_H = 30;

function LaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute top-0 left-0 flex h-full w-[46px] items-center text-[10.5px] leading-[1.15] text-ink-3">
      {children}
    </span>
  );
}

/** Registered lanes: everything shares the curve's time axis, so a mark sits under the moment it explains. */
export function Lanes({ analysis }: { analysis: Analysis }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const { selectedFlagId, selectFlag, playhead, setPlayhead } = useWorkspace();
  const duration = analysis.metrics.duration_seconds;
  const x = timeScale(width, duration);
  const byTime = [...analysis.flags].sort((a, b) => a.start - b.start);
  const tabStop = byTime.some((f) => f.id === selectedFlagId) ? selectedFlagId : byTime[0]?.id;
  const promise = analysis.promises[0];
  const pace = analysis.pacing.find((p) => p.key === "info_rate");
  const cuts = analysis.pacing.find((p) => p.key === "cut_rate");
  const silence = analysis.pacing.find((p) => p.key === "silence");
  const maxCuts = cuts ? Math.max(1, ...cuts.values) : 1;
  const sections = analysis.sections.filter((s) => s.kind === "chapter").length
    ? analysis.sections.filter((s) => s.kind === "chapter")
    : analysis.sections;

  const paceY = scaleLinear().domain([0, 100]).range([LANE_H - 4, 4]);
  const pacePath = pace
    ? area<number>()
        .x((_, i) => x(((i + 0.5) / 100) * duration))
        .y0(LANE_H - 4)
        .y1((v) => paceY(Math.min(100, v)))
        .curve(curveMonotoneX)(pace.values) ?? ""
    : "";

  return (
    <div ref={ref} className="relative select-none" role="group" aria-label="Timeline lanes">
      {width > 0 && (
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {/* Drop risks */}
          <div
            className="relative"
            style={{ height: LANE_H + 6 }}
            role="toolbar"
            aria-label="Drop risks in time order. Left and right arrows move between them."
            onKeyDown={(e) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(e.key)) return;
              e.preventDefault();
              if (e.key === "Escape") return selectFlag(null);
              const i = byTime.findIndex((f) => f.id === (document.activeElement as HTMLElement)?.dataset.flag);
              const j = e.key === "Home" ? 0 : e.key === "End" ? byTime.length - 1
                : Math.min(byTime.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)));
              const f = byTime[j];
              (e.currentTarget.querySelector(`[data-flag="${f.id}"]`) as HTMLElement | null)?.focus();
              selectFlag(f.id);
              setPlayhead(f.start);
            }}
          >
            <LaneLabel>Drop risks</LaneLabel>
            {byTime.map((f) => {
              const h = 6 + f.severity * 4;
              const active = selectedFlagId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  data-flag={f.id}
                  tabIndex={f.id === tabStop ? 0 : -1}
                  aria-pressed={active}
                  aria-label={`${fmtTime(f.start)}: ${f.title}, severity ${f.severity} of 5`}
                  onClick={() => {
                    selectFlag(active ? null : f.id);
                    setPlayhead(f.start);
                  }}
                  className="group absolute bottom-[6px] cursor-pointer rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  style={{ left: x(f.start), width: Math.max(10, x(f.end) - x(f.start)), height: LANE_H - 2 }}
                >
                  <span
                    className={clsx(
                      "absolute bottom-0 left-0 w-full rounded-t-[2px] transition-[outline,transform] duration-200",
                      active ? "outline-2 outline-offset-2 outline-accent" : "group-hover:-translate-y-0.5",
                    )}
                    style={{ height: h, background: SEVERITY_COLOR[f.severity] }}
                  />
                </button>
              );
            })}
          </div>

          {/* Promise ledger */}
          <div className="relative" style={{ height: LANE_H }}>
            <LaneLabel>Promise</LaneLabel>
            {promise && (
              <>
                <span
                  className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-full"
                  title="Promise debt: the title's question is open"
                  style={{
                    left: x(0),
                    width: Math.max(0, x(promise.paid_off ?? duration) - x(0)),
                    background:
                      promise.status === "paid"
                        ? "var(--line-strong)"
                        : `linear-gradient(90deg, var(--line-strong), var(--drop))`,
                  }}
                />
                {promise.first_touch != null && (
                  <span className="absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink-2" style={{ left: x(promise.first_touch) }} title={`First touched at ${fmtTime(promise.first_touch)}`} />
                )}
                {promise.paid_off != null && (
                  <>
                    <span
                      className="absolute top-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink"
                      style={{ left: x(promise.paid_off) }}
                    />
                    <span
                      className="absolute top-1/2 -translate-y-1/2 tc rounded-chip bg-surface px-1 text-[10.5px] font-[500] whitespace-nowrap text-ink-2"
                      style={
                        x(promise.paid_off) > width - 120
                          ? { right: width - x(promise.paid_off) + 10 }
                          : { left: x(promise.paid_off) + 10 }
                      }
                    >
                      paid off {fmtTime(promise.paid_off)}
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          {/* Open loops */}
          {analysis.loops.length > 0 && (
            <div className="relative" style={{ height: LANE_H }}>
              <LaneLabel>Loops</LaneLabel>
              <svg className="absolute inset-0" width={width} height={LANE_H} aria-hidden>
                {analysis.loops.map((l) => {
                  const x1 = x(l.opened_at);
                  const x2 = x(l.closed_at ?? duration);
                  const open = l.status === "unclosed";
                  return (
                    <path
                      key={l.id}
                      d={`M${x1},${LANE_H - 4} C${x1},${2} ${x2},${2} ${x2},${LANE_H - 4}`}
                      fill="none"
                      stroke={open ? "var(--drop)" : "var(--ink-2)"}
                      strokeWidth={1.5}
                      strokeDasharray={open ? "3 4" : undefined}
                    />
                  );
                })}
              </svg>
            </div>
          )}

          {/* Sections / chapters */}
          {sections.length > 0 && (
            <div className="relative" style={{ height: LANE_H - 4 }}>
              <LaneLabel>{sections[0].kind === "chapter" ? "Chapters" : "Sections"}</LaneLabel>
              {sections.map((s, i) => (
                <span
                  key={s.id}
                  className={clsx("absolute top-1 bottom-1 truncate rounded-chip px-1.5 text-[11px] leading-[18px] text-ink-2", i % 2 ? "bg-surface-2" : "bg-surface-2/50")}
                  style={{ left: x(s.start) + 1, width: Math.max(2, x(s.end) - x(s.start) - 2) }}
                  title={s.title}
                >
                  {s.title}
                </span>
              ))}
            </div>
          )}

          {/* Rough-cut lanes: shot cuts per minute and silence, measured from the video */}
          {cuts && (
            <div className="relative" style={{ height: LANE_H }}>
              <LaneLabel>Shot cuts</LaneLabel>
              <svg className="absolute inset-0" width={width} height={LANE_H} aria-hidden>
                {cuts.values.map((v, i) => {
                  const x0 = x((i / cuts.values.length) * duration);
                  const w = Math.max(1, x(((i + 1) / cuts.values.length) * duration) - x0 - 1);
                  const h = (v / maxCuts) * (LANE_H - 6);
                  return <rect key={i} x={x0} y={LANE_H - 3 - h} width={w} height={h} rx={1} fill="var(--ink-2)" opacity={v ? 0.75 : 0} />;
                })}
              </svg>
            </div>
          )}
          {silence && silence.values.some((v) => v > 0) && (
            <div className="relative" style={{ height: LANE_H - 8 }}>
              <LaneLabel>Silence</LaneLabel>
              <svg className="absolute inset-0" width={width} height={LANE_H - 8} aria-hidden>
                {silence.values.map((v, i) =>
                  v > 0 ? (
                    <rect key={i} x={x((i / silence.values.length) * duration)} y={4}
                      width={Math.max(2, x(((i + 1) / silence.values.length) * duration) - x((i / silence.values.length) * duration))}
                      height={LANE_H - 16} rx={2} fill="var(--drop)" opacity={Math.min(0.85, 0.2 + v / 100)} />
                  ) : null,
                )}
              </svg>
            </div>
          )}

          {/* New information */}
          {pace && (
            <div className="relative" style={{ height: LANE_H }}>
              <LaneLabel>New info</LaneLabel>
              <svg className="absolute inset-0" width={width} height={LANE_H} aria-hidden>
                <path d={pacePath} fill="var(--ink)" opacity={0.14} />
              </svg>
            </div>
          )}
        </div>
      )}
      {/* Playhead through the lanes */}
      {width > 0 && playhead > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 w-[1.5px] bg-accent"
          style={{ left: x(Math.min(playhead, duration)) }}
        />
      )}
    </div>
  );
}
