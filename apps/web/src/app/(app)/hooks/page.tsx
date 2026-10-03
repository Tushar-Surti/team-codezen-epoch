"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Copy, Sparkles, Zap } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Badge, Button, Field, Panel, Select } from "@/components/ui";
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
      <PageHeader
        title="Hook Lab"
        description="The first 30 seconds decide most of the curve. A language model pitches opening lines in your own voice; the retention model re-simulates the video with each one and ranks them by the viewers they keep."
      />

      <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-8 py-6 compact:px-6">
        <Panel className="flex flex-wrap items-end gap-3">
          <Field label="Script" className="min-w-[280px] flex-1">
            <Select
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                run.reset();
              }}
            >
              {list?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={() => run.mutate()} disabled={!id} loading={run.isPending}>
            {!run.isPending && <Sparkles size={15} aria-hidden />}
            {run.isPending ? "Writing and simulating…" : result ? "Pitch 5 more" : "Pitch 5 hooks"}
          </Button>
        </Panel>
        {run.error && (
          <p role="alert" className="rounded-control border border-drop/30 bg-drop-wash px-4 py-3 text-[13.5px] text-drop-text">
            {(run.error as Error).message}
          </p>
        )}

        {!result && !run.isPending && (
          <Panel className="flex flex-col items-center gap-2 py-12 text-center">
            <span className="mb-1 grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
              <Zap size={19} aria-hidden />
            </span>
            <p className="text-[15px] font-[600]">Pick a script and pitch five openings</p>
            <p className="max-w-[52ch] text-[13.5px] text-ink-2">
              Each one is added at 0:00 and the whole video is re-simulated, so the ranking reflects viewers kept, not how catchy the
              line sounds.
            </p>
          </Panel>
        )}

        {result && (
          <section className="flex flex-col gap-3" aria-label="Ranked hooks">
            <div className="rounded-panel border border-dashed border-line-strong px-4 py-3">
              <p className="text-[12.5px] text-ink-3">
                Your current opening · <span className="tnum">{pct(result.current_intro_retention)}</span> still watching at 0:30
              </p>
              <p className="mt-1 font-script text-[14px] text-ink-2">“{result.current_opening}”</p>
            </div>

            <LayoutGroup>
              <ol className="flex flex-col gap-2.5">
                <AnimatePresence>
                  {result.hooks.map((h, i) => {
                    const gain = h.delta.intro_retention;
                    return (
                      <motion.li
                        key={h.text}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: i * 0.07, ease: EASE }}
                        className={clsx(
                          "grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-4 rounded-panel border bg-surface px-4 py-4",
                          i === 0 ? "border-accent/50 shadow-[0_0_0_3px_var(--accent-wash)]" : "border-line",
                        )}
                      >
                        <span className={clsx("tc pt-0.5 text-[20px] leading-none font-[600]", i === 0 ? "text-ink" : "text-ink-3")}>{i + 1}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge size="sm">{h.angle}</Badge>
                            {i === 0 && (
                              <Badge tone="ok" size="sm">
                                Keeps the most viewers
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 font-script text-[15px] leading-[1.55] text-ink">“{h.text}”</p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="h-[5px] max-w-[320px] min-w-[120px] flex-1 overflow-hidden rounded-full bg-surface-2">
                              <motion.span
                                className="block h-full rounded-full bg-rev-blue"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(3, (Math.max(0, gain) / Math.max(best, 0.001)) * 100)}%` }}
                                transition={{ duration: 0.9, delay: 0.25 + i * 0.07, ease: EASE }}
                              />
                            </span>
                            <span className={clsx("tnum text-[13px] font-[600]", gain > 0 ? "text-good" : "text-ink-2")}>
                              {gain >= 0 ? "+" : "−"}
                              {Math.abs(gain * 100).toFixed(1)} pts intro
                            </span>
                            {h.delta.viewers_at_payoff != null && (
                              <span className="tnum text-[12.5px] text-ink-3">
                                {h.delta.viewers_at_payoff >= 0 ? "+" : "−"}
                                {Math.abs(Math.round(h.delta.viewers_at_payoff))} at the payoff
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard?.writeText(h.text);
                            setCopied(i);
                            setTimeout(() => setCopied(null), 1400);
                          }}
                          aria-label={`Copy hook ${i + 1}`}
                        >
                          {copied === i ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                          {copied === i ? "Copied" : "Copy"}
                        </Button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            </LayoutGroup>
            <p className="text-[12px] text-ink-3">
              Written by {result.provenance.provider === "claude" ? "Claude" : "Groq"} ({result.provenance.model}); ranked by the Retent
              AI model. Gains are model estimates for this script with the hook added at 0:00.
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
