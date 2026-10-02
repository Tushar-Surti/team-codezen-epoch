"use client";

import clsx from "clsx";
import { Download, Zap } from "lucide-react";
import Link from "next/link";

import type { Analysis } from "@/lib/contract.gen";
import { CATEGORY_LABEL, LANGUAGE_LABEL, MODE_LABEL, fmtTime } from "@/lib/format";
import { revision } from "@/lib/revisions";
import { useWorkspace } from "@/lib/workspace-store";

export function ProjectBar({ analysis, onExport }: { analysis: Analysis; onExport: () => void }) {
  const { drafts, activeDraft, setActiveDraft, newRevision } = useWorkspace();
  const meta = analysis.meta;
  return (
    <header className="flex min-h-[60px] flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule bg-paper px-6 py-2.5">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[18px] leading-tight font-[640] text-ink" title={meta.title}>
          {meta.title}
        </h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-3">
          <span>{CATEGORY_LABEL[meta.category]}</span>
          <span aria-hidden>·</span>
          <span>{LANGUAGE_LABEL[meta.language]}</span>
          <span aria-hidden>·</span>
          <span>{MODE_LABEL[meta.input_mode]}</span>
          <span aria-hidden>·</span>
          <span className="tnum">{fmtTime(analysis.metrics.duration_seconds)}</span>
          {meta.channel && (
            <>
              <span aria-hidden>·</span>
              <span>{meta.channel}</span>
            </>
          )}
          {analysis.synthetic && (
            <span
              className="ml-1 rounded-full border border-rule-strong px-2 py-[1px] text-[11px] text-ink-2"
              title="Development data: real engine output from the rules-only v0 model, not yet the trained model."
            >
              Development data · {analysis.model.version}
            </span>
          )}
        </p>
      </div>

      <div role="tablist" aria-label="Drafts" className="flex items-center gap-1">
        {drafts.map((d) => {
          const r = revision(d.key);
          const active = d.key === activeDraft;
          return (
            <button
              key={d.key}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveDraft(d.key)}
              className={clsx(
                "relative flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-[13px] font-[580] transition-colors duration-200",
                active ? "bg-paper-sunk text-ink" : "text-ink-2 hover:bg-paper-sunk/60",
              )}
            >
              <span
                aria-hidden
                className="h-3.5 w-3 rounded-[2px] border border-ink/15"
                style={{ background: d.key === "white" ? "var(--paper-raised)" : r.paper }}
              />
              {r.name}
              {d.key !== "white" && <span className="tnum text-[11.5px] font-[500] text-ink-3">{d.fixIds.length}</span>}
            </button>
          );
        })}
        {drafts.length > 1 && drafts.length < 5 && (
          <button
            onClick={() => newRevision()}
            className="rounded-[6px] px-2.5 py-1.5 text-[12.5px] text-ink-3 transition-colors duration-200 hover:bg-paper-sunk/60 hover:text-ink"
          >
            New revision
          </button>
        )}
      </div>

      <Link
        href={`/hooks?a=${analysis.id}`}
        className="inline-flex items-center gap-2 rounded-[6px] border border-rule-strong bg-paper-raised px-3 py-1.5 text-[13px] font-[580] text-ink transition-colors duration-200 hover:border-ink/40"
      >
        <Zap size={15} aria-hidden /> Hook Lab
      </Link>
      <button
        onClick={onExport}
        className="inline-flex items-center gap-2 rounded-[6px] border border-rule-strong bg-paper-raised px-3 py-1.5 text-[13px] font-[580] text-ink transition-colors duration-200 hover:border-ink/40"
      >
        <Download size={15} aria-hidden /> Export
      </button>
    </header>
  );
}
