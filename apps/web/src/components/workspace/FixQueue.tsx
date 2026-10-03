"use client";

import clsx from "clsx";
import { Check, CornerDownRight, Loader2, Plus } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";

import type { Analysis, EditOp, Fix, Flag, Provenance } from "@/lib/contract.gen";
import { fmtTime } from "@/lib/format";
import { REVISIONS, SEVERITY_COLOR, revision } from "@/lib/revisions";
import { useWorkspace } from "@/lib/workspace-store";

const EASE = [0.16, 1, 0.3, 1] as const;

function SeverityMark({ level }: { level: number }) {
  return (
    <span className="flex h-[18px] items-end gap-[2px]" aria-label={`Severity ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="w-[4px] rounded-t-[1.5px]"
          style={{ height: 4 + i * 2.6, background: i <= level ? SEVERITY_COLOR[level] : "var(--rule)" }}
        />
      ))}
    </span>
  );
}

function ProvenanceBadge({ p }: { p: Provenance }) {
  const label = p.provider === "rules" ? "Rules engine" : p.provider === "claude" ? "Claude" : p.provider === "groq" ? "Groq" : "Local model";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rule px-2 py-[1px] text-[11px] text-ink-3" title={`${p.model}${p.prompt_version ? ` · prompt ${p.prompt_version}` : ""}`}>
      <span className="size-1.5 rounded-full bg-ink-3" /> {label}
    </span>
  );
}

function gainLine(fix: Fix): { text: string; good: boolean } {
  const d = fix.delta;
  if (!d) return { text: "Gain not simulated", good: false };
  const parts: string[] = [];
  if (d.viewers_at_payoff != null && Math.abs(d.viewers_at_payoff) >= 1) parts.push(`${d.viewers_at_payoff > 0 ? "+" : "−"}${Math.abs(Math.round(d.viewers_at_payoff))} at payoff`);
  if (Math.abs(d.intro_retention) >= 0.002) parts.push(`${d.intro_retention > 0 ? "+" : "−"}${Math.abs(d.intro_retention * 100).toFixed(1)} pts intro`);
  if (Math.abs(d.avd_seconds) >= 1) parts.push(`${d.avd_seconds > 0 ? "+" : "−"}${Math.abs(Math.round(d.avd_seconds))}s AVD`);
  const good = (d.viewers_at_payoff ?? 0) > 1 || d.intro_retention > 0.002 || d.watch_time_per_1000 > 5;
  return { text: parts.length ? parts.join(" · ") : "No measurable gain", good };
}

function OpLine({ op, analysis }: { op: EditOp; analysis: Analysis }) {
  const sents = op.sentence_ids.map((id) => analysis.sentences.find((s) => s.id === id)).filter(Boolean);
  const first = sents[0];
  const after = op.after_sentence_id ? analysis.sentences.find((s) => s.id === op.after_sentence_id) : null;
  const where = op.after_sentence_id === "" ? "to the very start" : after ? `after ${fmtTime(after.end)}` : "";
  const verb: Record<string, string> = {
    cut: `Cut ${sents.length} ${sents.length === 1 ? "line" : "lines"}${first ? ` from ${fmtTime(first.start)}` : ""}`,
    trim: `Trim ${sents.length} weakest ${sents.length === 1 ? "line" : "lines"}`,
    move: `Move ${sents.length === 1 ? "the line" : `${sents.length} lines`} at ${first ? fmtTime(first.start) : "?"} ${where}`,
    insert: `Add a line ${where}`,
    rewrite: `Rewrite the line at ${first ? fmtTime(first.start) : "?"}`,
    interrupt: "Add a pattern interrupt",
    rechapter: "Re-chapter",
  };
  return (
    <li className="flex gap-2 text-[13px] text-ink-2">
      <CornerDownRight size={14} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
      <span>
        {verb[op.op]}
        {op.new_text && <span className="mt-1 block font-script text-[13.5px] leading-snug text-ink">“{op.new_text}”</span>}
        {!op.new_text && op.note && <span className="mt-0.5 block text-[12.5px] text-ink-3">{op.note}</span>}
      </span>
    </li>
  );
}

function Inspector({ flag, fix, analysis }: { flag: Flag; fix: Fix | undefined; analysis: Analysis }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
      className="overflow-hidden"
    >
      <div className="space-y-4 pt-3">
        <section>
          <h4 className="mb-1.5 text-[12.5px] font-[620] text-ink-2">Evidence · {fmtTime(flag.evidence.start)}–{fmtTime(flag.evidence.end)}</h4>
          <blockquote className="relative pl-3 font-script text-[13.5px] leading-[1.55] text-ink">
            <span aria-hidden className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-pen" />
            {flag.evidence.quote}
          </blockquote>
          {flag.evidence.related_quote && flag.evidence.related_start != null && (
            <blockquote className="relative mt-2 pl-3 font-script text-[13px] leading-[1.5] text-ink-2">
              <span aria-hidden className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-ink-3" />
              <span className="mb-0.5 block font-ui text-[11.5px] text-ink-3">First said at {fmtTime(flag.evidence.related_start)}</span>
              {flag.evidence.related_quote}
            </blockquote>
          )}
        </section>
        {flag.signals.length > 0 && (
          <section>
            <h4 className="mb-2 text-[12.5px] font-[620] text-ink-2">Why the model flags it</h4>
            <ul className="space-y-1.5">
              {flag.signals.map((s) => (
                <li key={s.family + s.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[13px]">
                  <span className="text-ink-2">
                    {s.label}
                    {s.value && <span className="tnum ml-1.5 text-ink-3">{s.value}</span>}
                  </span>
                  <span className="tnum text-[12px] text-ink-3">{Math.round(s.share * 100)}%</span>
                  <span className="col-span-2 mt-0.5 h-[4px] rounded-full bg-paper-sunk">
                    <span className="block h-full rounded-full bg-ink-2" style={{ width: `${Math.max(4, s.share * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {flag.norm && (
          <p className="text-[13px] text-ink-2">
            {flag.norm.label} <span className="font-[620] text-ink">{flag.norm.value}</span>
            <span className="text-ink-3"> · {flag.norm.n} videos</span>
          </p>
        )}
        {fix && (
          <section>
            <h4 className="mb-1.5 text-[12.5px] font-[620] text-ink-2">The fix</h4>
            <p className="mb-2 text-[13px] text-ink-2">{fix.rationale}</p>
            <ul className="space-y-2">{fix.ops.map((op, i) => <OpLine key={i} op={op} analysis={analysis} />)}</ul>
          </section>
        )}
        <div className="flex items-center justify-between pb-1">
          <ProvenanceBadge p={fix?.provenance ?? flag.provenance} />
          <span className="tnum text-[11.5px] text-ink-3">confidence {Math.round(flag.confidence * 100)}%</span>
        </div>
      </div>
    </motion.div>
  );
}

export function FixQueue({ analysis }: { analysis: Analysis }) {
  const { selectedFlagId, selectFlag, setPlayhead, drafts, activeDraft, toggleFix } = useWorkspace();
  const working = drafts.find((d) => d.key === activeDraft && d.key !== "white") ?? null;
  const nextKey = working?.key ?? REVISIONS[Math.min(REVISIONS.length - 1, drafts.length)].key;
  const target = revision(nextKey);
  const fixesByFlag = new Map(analysis.fixes.map((f) => [f.flag_id, f]));

  if (!analysis.flags.length) {
    return (
      <div className="rounded-[6px] border border-rule bg-paper-raised p-5 text-[14px] text-ink-2">
        <p className="font-[600] text-ink">No drop risks above the noise.</p>
        <p className="mt-1">The script holds attention evenly. Check the curve for the intro, then tighten wherever pace dips.</p>
      </div>
    );
  }

  return (
    <LayoutGroup>
      <ol className="space-y-2.5">
        {analysis.flags.map((flag, idx) => {
          const fix = fixesByFlag.get(flag.id);
          const selected = selectedFlagId === flag.id;
          const applied = !!fix && !!working?.fixIds.includes(fix.id);
          const gain = fix ? gainLine(fix) : null;
          return (
            <motion.li
              layout
              transition={{ duration: 0.32, ease: EASE }}
              key={flag.id}
              className={clsx(
                "rounded-[7px] border bg-paper-raised px-4 py-3 transition-[border-color,box-shadow] duration-200",
                selected ? "border-ink/40 shadow-[0_8px_26px_-14px_rgb(23_23_26/0.35)]" : "border-rule hover:border-rule-strong",
              )}
              style={applied ? { background: `color-mix(in oklab, ${target.paper} 55%, var(--paper-raised))` } : undefined}
            >
              <button
                type="button"
                aria-expanded={selected}
                onClick={() => {
                  selectFlag(selected ? null : flag.id);
                  setPlayhead(flag.start);
                }}
                className="flex w-full items-start gap-3 text-left"
              >
                <SeverityMark level={flag.severity} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-[1.25] font-[620] text-ink">
                    {idx === 0 && flag.viewers_lost >= 5 && <span className="mr-1.5 text-pen-text">Biggest drop.</span>}
                    {flag.title}
                  </span>
                  <span className={clsx("mt-1 block text-[13px] leading-snug text-ink-2", !selected && "line-clamp-2")}>{flag.detail}</span>
                </span>
                <span className="tnum shrink-0 text-right">
                  <span className="block text-[17px] leading-none font-[640] text-pen-text">{Math.round(flag.viewers_lost)}</span>
                  <span className="block text-[10.5px] text-ink-3">per 1,000</span>
                </span>
              </button>

              <AnimatePresence initial={false}>{selected && <Inspector flag={flag} fix={fix} analysis={analysis} />}</AnimatePresence>

              {fix && (
                <div className="mt-3 flex items-center gap-3 border-t border-rule pt-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-[580] text-ink">{fix.title}</span>
                    <span className={clsx("tnum block text-[12px]", gain?.good ? "text-ink-2" : "text-ink-3")}>{gain?.text}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleFix(fix.id)}
                    aria-pressed={applied}
                    className={clsx(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[13px] font-[600] transition-[background,color,box-shadow] duration-200",
                      applied ? "bg-paper text-ink ring-1 ring-ink/25 hover:ring-ink/45" : "bg-ink text-paper hover:bg-primary-hover",
                    )}
                  >
                    {applied ? <Check size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
                    {applied ? `In ${target.name}` : `Apply to ${target.name}`}
                  </button>
                </div>
              )}
            </motion.li>
          );
        })}
      </ol>
      {working?.status === "simulating" && (
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-3">
          <Loader2 size={14} className="animate-spin" aria-hidden /> Re-simulating the {target.name} draft…
        </p>
      )}
    </LayoutGroup>
  );
}
