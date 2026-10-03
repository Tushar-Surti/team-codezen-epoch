"use client";

import clsx from "clsx";
import { ChevronRight, Download, Plus, Scissors, Zap } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, useRef } from "react";

import { Badge, Button } from "@/components/ui";
import type { Analysis } from "@/lib/contract.gen";
import { CATEGORY_LABEL, LANGUAGE_LABEL, MODE_LABEL, fmtTime } from "@/lib/format";
import { REVISIONS, revision } from "@/lib/revisions";
import { useWorkspace } from "@/lib/workspace-store";

function DraftTabs() {
  const { drafts, activeDraft, setActiveDraft, newRevision } = useWorkspace();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent, i: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + drafts.length) % drafts.length;
    setActiveDraft(drafts[next].key);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex items-center gap-1.5">
      <div
        role="tablist"
        aria-label="Drafts"
        className="inline-flex gap-0.5 rounded-[calc(var(--r-control)+2px)] border border-line-strong bg-surface p-0.5"
      >
        {drafts.map((d, i) => {
          const r = revision(d.key);
          const active = d.key === activeDraft;
          return (
            <button
              key={d.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveDraft(d.key)}
              onKeyDown={(e) => onKey(e, i)}
              className={clsx(
                "inline-flex h-[calc(var(--h-control)-6px)] items-center gap-2 rounded-control px-2.5 text-[13px] font-[500] transition-[background-color,color,box-shadow] duration-150",
                active ? "bg-(--seg-on-bg) text-(--seg-on-fg) shadow-(--seg-on-ring)" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <span
                aria-hidden
                className="size-2.5 rounded-[2px] border border-current/25"
                style={{ background: d.key === "white" ? "var(--surface)" : r.ink }}
              />
              {r.name}
              {d.key !== "white" && (
                <span className="tc text-[11px] opacity-70" aria-label={`${d.fixIds.length} fixes`}>
                  {d.fixIds.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {drafts.length > 1 && drafts.length < REVISIONS.length && (
        <Button variant="ghost" size="sm" onClick={() => newRevision()} title="Start the next revision from this one">
          <Plus size={14} aria-hidden /> Revision
        </Button>
      )}
    </div>
  );
}

export function ProjectBar({ analysis, onExport }: { analysis: Analysis; onExport: () => void }) {
  const meta = analysis.meta;
  const facts = [
    CATEGORY_LABEL[meta.category],
    LANGUAGE_LABEL[meta.language],
    MODE_LABEL[meta.input_mode],
    meta.channel,
  ].filter(Boolean);

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-line bg-surface px-6 py-2.5">
      <div className="min-w-0 flex-[1_1_320px]">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12px] text-ink-3">
          <Link href="/projects" className="hover:text-ink hover:underline">
            Projects
          </Link>
          <ChevronRight size={12} aria-hidden />
        </nav>
        <h1 className="truncate text-[16px] leading-snug font-[600] tracking-[-0.01em] text-ink" title={meta.title}>
          {meta.title}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
          {facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
          <span className="tc">{fmtTime(analysis.metrics.duration_seconds)}</span>
          {analysis.synthetic && (
            <Badge
              tone="warn"
              size="sm"
              title="Real engine output from the rules-only v0 model, not yet the trained model."
            >
              Development data · {analysis.model.version}
            </Badge>
          )}
        </div>
      </div>

      <DraftTabs />

      <div className="flex flex-wrap items-center gap-1.5">
        <Button href={`/hooks?a=${analysis.id}`} variant="ghost">
          <Zap size={15} aria-hidden /> Hook Lab
        </Button>
        <Button href={`/shorts?a=${analysis.id}`} variant="ghost">
          <Scissors size={15} aria-hidden /> Shorts
        </Button>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <Button variant="secondary" onClick={onExport}>
          <Download size={15} aria-hidden /> Export
        </Button>
      </div>
    </header>
  );
}
