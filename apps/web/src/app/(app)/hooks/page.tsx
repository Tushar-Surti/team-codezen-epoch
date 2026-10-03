"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { API_URL, api } from "@/lib/api";
import { pct } from "@/lib/format";

type Hook = {
  angle: string;
  text: string;
  intro_retention: number;
  delta: { intro_retention: number; viewers_at_payoff: number | null; avd_seconds: number };
};
type HookResult = {
  analysis_id: string;
  current_opening: string;
  current_intro_retention: number;
  provenance: { provider: string; model: string };
  hooks: Hook[];
};

const EASE = [0.16, 1, 0.3, 1] as const;

function HookLab() {
  const params = useSearchParams();
  const { data: list } = useQuery({ queryKey: ["analyses"], queryFn: api.list });
  const [id, setId] = useState<string>(params.get("a") ?? "");
  const [copied, setCopied] = useState<number | null>(null);
  useEffect(() => {
    if (!id && list?.length) setId(list.find((x) => x.id === "sample-hinglish-tech")?.id ?? list[0].id);
  }, [list, id]);

  const run = useMutation({
    mutationFn: async (): Promise<HookResult> => {
      const res = await fetch(`${API_URL}/api/hooks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysis_id: id, n: 5 }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
      return res.json();
    },
  });
  const result = run.data;
  const best = result?.hooks[0]?.delta.intro_retention ?? 0.01;

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-rule px-8 pt-7 pb-5">
        <h1 className="text-[26px] leading-tight font-[650] wdth-wide">Hook Lab</h1>
        <p className="mt-1 max-w-[78ch] text-[14px] text-ink-2">
          The first 30 seconds decide most of the curve. A language model pitches opening lines in your own voice; the
          retention model re-simulates the video with each one and ranks them by the viewers they keep.
        </p>
      </header>

      <div className="mx-auto max-w-[980px] px-8 py-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[300px] flex-1">
            <span className="mb-1.5 block text-[13.5px] font-[600]">Script</span>
            <select
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                run.reset();
              }}
              className="w-full rounded-[7px] border border-rule-strong bg-paper-raised px-3 py-2 text-[14px] outline-none focus:border-ink"
            >
              {list?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => run.mutate()}
            disabled={!id || run.isPending}
            className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-5 py-2.5 text-[14.5px] font-[620] text-paper transition-colors duration-200 hover:bg-primary-hover disabled:opacity-40"
          >
            {run.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
            {run.isPending ? "Writing and simulating…" : result ? "Pitch 5 more" : "Pitch 5 hooks"}
          </button>
        </div>
        {run.error && <p className="mt-3 text-[13.5px] text-pen-text">{(run.error as Error).message}</p>}

        {result && (
          <section className="mt-7" aria-label="Ranked hooks">
            <div className="rounded-[7px] border border-dashed border-rule-strong px-4 py-3">
              <p className="text-[12.5px] text-ink-3">Your current opening · {pct(result.current_intro_retention)} still watching at 0:30</p>
              <p className="mt-1 font-script text-[14.5px] text-ink-2">“{result.current_opening}”</p>
            </div>

            <LayoutGroup>
              <ol className="mt-4 space-y-3">
                <AnimatePresence>
                  {result.hooks.map((h, i) => {
                    const gain = h.delta.intro_retention;
                    return (
                      <motion.li
                        key={h.text}
                        layout
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45, delay: i * 0.08, ease: EASE }}
                        className={clsx(
                          "grid grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-4 rounded-[8px] border bg-paper-raised px-4 py-4",
                          i === 0 ? "border-ink/35 shadow-[0_10px_28px_-16px_rgb(23_23_26/0.35)]" : "border-rule",
                        )}
                      >
                        <span className={clsx("tnum pt-0.5 text-[22px] leading-none font-[650] wdth-wide", i === 0 ? "text-ink" : "text-ink-3")}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="inline-block rounded-full bg-paper-sunk px-2 py-[2px] text-[11.5px] font-[560] text-ink-2">{h.angle}</span>
                          <p className="mt-2 font-script text-[15.5px] leading-[1.5] text-ink">“{h.text}”</p>
                          <div className="mt-3 flex items-center gap-3">
                            <span className="h-[6px] max-w-[320px] flex-1 rounded-full bg-paper-sunk">
                              <motion.span
                                className="block h-full rounded-full"
                                style={{ background: "var(--rev-blue)" }}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(3, (Math.max(0, gain) / Math.max(best, 0.001)) * 100)}%` }}
                                transition={{ duration: 0.9, delay: 0.25 + i * 0.08, ease: EASE }}
                              />
                            </span>
                            <span className="tnum text-[13px] font-[620] text-ink">
                              {gain >= 0 ? "+" : "−"}{Math.abs(gain * 100).toFixed(1)} pts intro
                            </span>
                            {h.delta.viewers_at_payoff != null && (
                              <span className="tnum text-[12.5px] text-ink-3">
                                {h.delta.viewers_at_payoff >= 0 ? "+" : "−"}{Math.abs(Math.round(h.delta.viewers_at_payoff))} at the payoff
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(h.text);
                            setCopied(i);
                            setTimeout(() => setCopied(null), 1400);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-[6px] border border-rule-strong px-2.5 py-1.5 text-[12.5px] font-[580] text-ink hover:border-ink/40"
                          aria-label={`Copy hook ${i + 1}`}
                        >
                          {copied === i ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                          {copied === i ? "Copied" : "Copy"}
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            </LayoutGroup>
            <p className="mt-4 text-[12px] text-ink-3">
              Written by {result.provenance.provider === "claude" ? "Claude" : "Groq"} ({result.provenance.model}); ranked by the
              Retent AI model. Gains are model estimates for this script with the hook added at 0:00.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

export default function HookLabPage() {
  return (
    <Suspense fallback={null}>
      <HookLab />
    </Suspense>
  );
}
