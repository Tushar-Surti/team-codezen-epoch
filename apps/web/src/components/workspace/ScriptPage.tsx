"use client";

import clsx from "clsx";
import { useEffect, useMemo, useRef } from "react";

import type { Analysis, Flag, Sentence, Simulation } from "@/lib/contract.gen";
import { fmtTime } from "@/lib/format";
import { revision, type RevisionKey } from "@/lib/revisions";
import { useWorkspace } from "@/lib/workspace-store";

type Line =
  | { kind: "line"; s: Sentence; change: null | "added" | "rewritten" | "moved"; movedFrom?: number; flags: Flag[]; flagStart: Flag[] }
  | { kind: "omitted"; ids: string[]; start: number; end: number; count: number };

function lisIds(seq: readonly (readonly [string, number])[]): Set<string> {
  const tails: number[] = [];
  const tailIdx: number[] = [];
  const prev: number[] = new Array(seq.length).fill(-1);
  seq.forEach(([, v], i) => {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = v;
    tailIdx[lo] = i;
    prev[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  });
  const keep = new Set<string>();
  for (let i = tailIdx[tails.length - 1] ?? -1; i >= 0; i = prev[i]) keep.add(seq[i][0]);
  return keep;
}

function buildLines(analysis: Analysis, sim: Simulation | null): Line[] {
  const byId = new Map(analysis.sentences.map((s) => [s.id, s]));
  const flagsBySentence = new Map<string, Flag[]>();
  const flagStarts = new Map<string, Flag[]>();
  for (const f of analysis.flags) {
    f.evidence.sentence_ids.forEach((id, i) => {
      flagsBySentence.set(id, [...(flagsBySentence.get(id) ?? []), f]);
      if (i === 0) flagStarts.set(id, [...(flagStarts.get(id) ?? []), f]);
    });
  }
  if (!sim) {
    return analysis.sentences.map((s) => ({
      kind: "line", s, change: null, flags: flagsBySentence.get(s.id) ?? [], flagStart: flagStarts.get(s.id) ?? [],
    }));
  }
  const kept = new Set(sim.sentences.map((s) => s.id));
  const originalIndex = new Map(analysis.sentences.map((s, i) => [s.id, i]));
  // Omitted runs attach after the nearest earlier original line that survived.
  const omittedAfter = new Map<string, string[]>();
  let anchor = "__start";
  for (const s of analysis.sentences) {
    if (kept.has(s.id)) anchor = s.id;
    else omittedAfter.set(anchor, [...(omittedAfter.get(anchor) ?? []), s.id]);
  }
  const out: Line[] = [];
  const pushOmitted = (key: string) => {
    const ids = omittedAfter.get(key);
    if (!ids?.length) return;
    const first = byId.get(ids[0])!, last = byId.get(ids[ids.length - 1])!;
    out.push({ kind: "omitted", ids, start: first.start, end: last.end, count: ids.length });
  };
  pushOmitted("__start");
  // Lines outside the longest increasing run of original positions are the ones that moved.
  const stay = lisIds(sim.sentences.filter((s) => originalIndex.has(s.id)).map((s) => [s.id, originalIndex.get(s.id)!] as const));
  for (const s of sim.sentences) {
    const orig = byId.get(s.id);
    let change: "added" | "rewritten" | "moved" | null = null;
    if (!orig) change = "added";
    else if (orig.text !== s.text) change = "rewritten";
    else if (!stay.has(s.id)) change = "moved";
    out.push({ kind: "line", s, change, movedFrom: change === "moved" ? orig?.start : undefined, flags: [], flagStart: [] });
    pushOmitted(s.id);
  }
  return out;
}

export function ScriptPage({ analysis, sim, draftKey }: { analysis: Analysis; sim: Simulation | null; draftKey: RevisionKey | null }) {
  const { selectedFlagId, selectFlag, playhead, setPlayhead } = useWorkspace();
  const lines = useMemo(() => buildLines(analysis, sim), [analysis, sim]);
  const rev = draftKey ? revision(draftKey) : null;
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = analysis.flags.find((f) => f.id === selectedFlagId) ?? null;

  useEffect(() => {
    if (!selected || sim) return;
    const el = containerRef.current?.querySelector(`[data-sid="${selected.evidence.sentence_ids[0]}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected, sim]);

  const playheadId = useMemo(() => {
    const src = sim ? sim.sentences : analysis.sentences;
    let id = src[0]?.id;
    for (const s of src) if (s.start <= playhead) id = s.id;
    return id;
  }, [playhead, sim, analysis]);

  return (
    <div ref={containerRef} className="mx-auto w-full max-w-[880px]">
      <header className="flex items-baseline justify-between px-2 pb-3">
        <h2 className="text-[13px] font-[600] tracking-[0.02em] text-ink-2 wdth-condensed">
          {rev ? `${rev.name.toUpperCase()} REVISION` : "WHITE DRAFT"}
          <span className="ml-2 font-[450] text-ink-3">
            {analysis.sentences[0]?.timing === "estimated" ? "timing estimated from speaking rate" : "timing from the video"}
          </span>
        </h2>
        {rev && (
          <span className="flex items-center gap-2 text-[12px] text-ink-3">
            <span className="inline-block h-3 w-5 rounded-[2px]" style={{ background: rev.paper }} /> changed lines
            <span className="font-script text-[15px] text-ink">*</span>
          </span>
        )}
      </header>
      <ol className="relative rounded-[3px] border border-rule bg-paper-raised py-6 shadow-[0_1px_0_var(--rule),0_10px_30px_-18px_rgb(23_23_26/0.25)]">
        {lines.map((l, i) => {
          if (l.kind === "omitted") {
            return (
              <li key={`om-${i}`} className="grid grid-cols-[60px_minmax(0,1fr)_200px_22px] items-baseline px-2 py-1.5" style={{ background: rev?.paper }}>
                <span className="tnum pr-3 text-right text-[11px] text-ink-3">{fmtTime(l.start)}</span>
                <span className="font-script text-[14px] tracking-[0.08em] text-ink-2">
                  OMITTED <span className="tracking-normal text-ink-3">· {l.count} {l.count === 1 ? "line" : "lines"}, was {fmtTime(l.start)}–{fmtTime(l.end)}</span>
                </span>
                <span />
                <span className="font-script text-[15px]" style={{ color: rev?.ink }}>*</span>
              </li>
            );
          }
          const { s, flags, flagStart, change } = l;
          const isSel = !!selected && flags.some((f) => f.id === selected.id);
          const flagged = flags.length > 0;
          const lead = flagStart[0];
          return (
            <li
              key={s.id}
              data-sid={s.id}
              className={clsx(
                "group relative grid cursor-pointer grid-cols-[60px_minmax(0,1fr)_200px_22px] items-baseline px-2 py-[3px] transition-colors duration-200",
                isSel && "bg-pen-wash",
                !isSel && !change && "hover:bg-paper-sunk/70",
              )}
              style={change && rev ? { background: rev.paper } : undefined}
              onClick={() => {
                setPlayhead(s.start);
                if (flagged) selectFlag(flags[0].id);
              }}
            >
              <span className="tnum relative pr-3 text-right text-[11px] text-ink-3">
                {playheadId === s.id && playhead > 0 && <span aria-hidden className="absolute top-[3px] left-1 h-3 w-[3px] rounded-full bg-brass" />}
                {fmtTime(s.start)}
              </span>
              <span className={clsx("font-script text-[15px] leading-[1.6] text-ink", flagged && !sim && "relative")}>
                {flagged && !sim && (
                  <span aria-hidden className="absolute top-[3px] bottom-[3px] left-[-9px] w-[2px] rounded-full bg-pen" />
                )}
                {s.text}
                {change === "moved" && l.movedFrom != null && (
                  <span className="ml-2 font-ui text-[11px] text-ink-3">moved from {fmtTime(l.movedFrom)}</span>
                )}
                {change === "added" && <span className="ml-2 font-ui text-[11px] text-ink-3">added</span>}
              </span>
              <span className="pl-4">
                {lead && !sim && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectFlag(lead.id === selectedFlagId ? null : lead.id);
                      setPlayhead(lead.start);
                    }}
                    className="block text-left text-[12.5px] leading-[1.25] font-[580] text-pen-text wdth-condensed hover:underline"
                  >
                    {lead.title}
                  </button>
                )}
              </span>
              <span className="font-script text-[15px]" style={{ color: rev?.ink }}>{change ? "*" : ""}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
