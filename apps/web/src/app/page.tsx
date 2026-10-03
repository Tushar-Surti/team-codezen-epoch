"use client";

import { useGSAP } from "@gsap/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { ScrollStory } from "@/components/landing/ScrollStory";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { api } from "@/lib/api";
import { evalApi } from "@/lib/eval";
import { fmtTime } from "@/lib/format";
import { SplitText, gsap, prefersReducedMotion } from "@/lib/gsap";

const SAMPLE = "sample-hinglish-tech";

function ScriptExcerpt() {
  const { data: a } = useQuery({ queryKey: ["analysis", SAMPLE], queryFn: () => api.get(SAMPLE) });
  if (!a) return <div className="h-[360px] rounded-[3px] border border-rule bg-paper-raised" />;
  const flagged = new Map<string, string>();
  for (const f of a.flags) f.evidence.sentence_ids.forEach((id, i) => i === 0 && !flagged.has(id) && flagged.set(id, f.title));
  const marked = new Set(a.flags.flatMap((f) => f.evidence.sentence_ids));
  return (
    <figure className="hero-page relative rounded-[3px] border border-rule bg-paper-raised py-5 shadow-[0_30px_70px_-34px_rgb(23_23_26/0.4)]">
      <p className="px-6 pb-3 text-[11.5px] tracking-[0.08em] text-ink-3 font-script">WHITE DRAFT · SAMPLE SCRIPT</p>
      <ol>
        {a.sentences.slice(0, 7).map((s) => (
          <li key={s.id} className="hero-line grid grid-cols-[44px_minmax(0,1fr)_150px] items-baseline gap-2 px-4 py-[3px]">
            <span className="tnum text-right text-[11px] text-ink-3">{fmtTime(s.start)}</span>
            <span className="relative font-script text-[13.5px] leading-[1.55] text-ink">
              {marked.has(s.id) && <span aria-hidden className="absolute top-[3px] bottom-[3px] left-[-8px] w-[2px] rounded-full bg-pen" />}
              {s.text}
            </span>
            <span className="text-[11.5px] leading-[1.2] font-[600] text-pen-text wdth-condensed">{flagged.get(s.id) ?? ""}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function Proof() {
  const { data: r } = useQuery({ queryKey: ["eval"], queryFn: evalApi.summary, retry: false });
  if (!r) return null;
  const m = r.summary.overall.model.spearman.mean;
  const p = r.summary.overall.position.spearman.mean;
  return (
    <section className="border-y border-rule bg-paper-raised" aria-labelledby="proof">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:px-10">
        <div>
          <h2 id="proof" className="text-[32px] leading-[1.1] font-[650] wdth-wide">Tested blind, on channels it never saw.</h2>
          <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">
            We predict from the transcript alone, then compare against YouTube’s public “Most replayed” curve. Every
            channel is held out from training, and every number is computed. We publish where it’s weak too.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/lab" className="inline-flex items-center gap-2 rounded-[8px] border border-rule-strong px-4 py-2.5 text-[14.5px] font-[600] hover:border-ink/40">
              See the full accuracy report <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/blind" className="inline-flex items-center gap-2 rounded-[8px] px-4 py-2.5 text-[14.5px] font-[600] text-paper" style={{ background: "var(--actual)" }}>
              <EyeOff size={16} aria-hidden /> Run a blind test
            </Link>
          </div>
        </div>
        <dl className="grid grid-cols-2 content-start gap-x-8 gap-y-6 self-center">
          <div className="border-t border-ink pt-3">
            <dt className="text-[13px] text-ink-3">Public videos tested</dt>
            <dd className="tnum mt-1 text-[38px] leading-none font-[650] wdth-wide">{r.n_videos}</dd>
            <dd className="mt-1 text-[12.5px] text-ink-3">from {r.n_channels} channels, English and Hindi</dd>
          </div>
          <div className="border-t border-ink pt-3">
            <dt className="text-[13px] text-ink-3">Beats “position only”</dt>
            <dd className="tnum mt-1 text-[38px] leading-none font-[650] wdth-wide">{Math.round(r.summary.wins.position * 100)}%</dd>
            <dd className="mt-1 text-[12.5px] text-ink-3">of held-out videos</dd>
          </div>
          <div className="border-t border-rule-strong pt-3">
            <dt className="text-[13px] text-ink-3">Shape match, Retent AI</dt>
            <dd className="tnum mt-1 text-[24px] leading-none font-[640]">{m >= 0 ? "+" : "−"}{Math.abs(m).toFixed(2)}</dd>
          </div>
          <div className="border-t border-rule-strong pt-3">
            <dt className="text-[13px] text-ink-3">Shape match, position only</dt>
            <dd className="tnum mt-1 text-[24px] leading-none font-[640] text-ink-2">{p >= 0 ? "+" : "−"}{Math.abs(p).toFixed(2)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

const INSIDE = [
  ["Red-pen flags", "Late hooks, title promises paid off too late, repeats, detours, early sponsor reads, wrap-ups said too soon."],
  ["Fixes in your voice", "Rewrites in English, Hindi or Hinglish, each one re-simulated so you see the viewers it keeps."],
  ["Hook Lab", "Five openings pitched, ranked by the model on intro retention."],
  ["Revision drafts", "Blue and Pink drafts like a real shooting script, with every changed line marked."],
  ["Hand-off to your editor", "DaVinci Resolve markers, the revised script, YouTube chapters."],
  ["Honest accuracy", "Blind tests against YouTube’s real curves, baselines and failure cases included."],
];

export default function Landing() {
  const { data: sample } = useQuery({ queryKey: ["analysis", SAMPLE], queryFn: () => api.get(SAMPLE), retry: false });
  const fixIds = sample?.fixes.slice(0, 3).map((f) => f.id) ?? [];
  const { data: sim } = useQuery({
    queryKey: ["sim", SAMPLE, fixIds.join(",")],
    queryFn: () => api.simulate(SAMPLE, fixIds),
    enabled: fixIds.length > 0,
    retry: false,
  });
  const hero = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const split = new SplitText(".hero-title", { type: "words" });
      gsap.from(split.words, { yPercent: 60, autoAlpha: 0, duration: 0.9, stagger: 0.06, ease: "expo.out" });
      gsap.from(".hero-sub, .hero-cta", { autoAlpha: 0, y: 12, duration: 0.7, delay: 0.45, stagger: 0.08 });
      gsap.from(".hero-page", { autoAlpha: 0, y: 24, rotate: -1.2, duration: 1.1, delay: 0.25, ease: "expo.out" });
      return () => split.revert();
    },
    { scope: hero },
  );

  return (
    <div className="min-h-dvh bg-paper">
      <SmoothScroll />
      <nav className="sticky top-0 z-30 border-b border-rule/70 bg-paper/85 backdrop-blur-[6px]" aria-label="Site">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-6 px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-2 text-[16px] font-[650]">
            <span className="flex size-7 items-center justify-center rounded-[6px] bg-cover text-[13px] text-cover-ink wdth-condensed">
              <span>R<span className="text-brass-bright">.</span></span>
            </span>
            Retent AI
          </Link>
          <div className="ml-auto flex items-center gap-5 text-[14px]">
            <Link href="/lab" className="text-ink-2 hover:text-ink">Accuracy</Link>
            <Link href="/blind" className="text-ink-2 hover:text-ink">Blind test</Link>
            <Link href="/projects" className="rounded-[7px] bg-ink px-3.5 py-1.5 font-[600] text-paper hover:bg-primary-hover">Open the app</Link>
          </div>
        </div>
      </nav>

      <header ref={hero} className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 pt-16 pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:px-10 lg:pt-24">
        <div>
          <h1 className="hero-title text-[clamp(42px,6vw,76px)] leading-[0.98] font-[680] tracking-[-0.02em] wdth-wide">
            Predict the drop. Fix the video. Keep them watching.
          </h1>
          <p className="hero-sub mt-6 max-w-[50ch] text-[18px] leading-relaxed text-ink-2">
            Retent AI reads your script before you shoot, predicts where viewers will leave, circles the lines that cause it,
            and rewrites the fix in your voice. English, Hindi and Hinglish.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/new" className="hero-cta group inline-flex items-center gap-2 rounded-[9px] bg-ink px-5 py-3 text-[15.5px] font-[620] text-paper hover:bg-primary-hover">
              Analyze a script
              <ArrowRight size={17} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link href={`/a/${SAMPLE}`} className="hero-cta inline-flex items-center gap-2 rounded-[9px] border border-rule-strong px-5 py-3 text-[15.5px] font-[600] hover:border-ink/40">
              Open the sample
            </Link>
          </div>
        </div>
        <ScriptExcerpt />
      </header>

      {sample && <ScrollStory analysis={sample} sim={sim ?? null} />}

      <Proof />

      <section className="mx-auto max-w-[1240px] px-6 py-20 lg:px-10" aria-labelledby="inside">
        <h2 id="inside" className="text-[32px] leading-[1.1] font-[650] wdth-wide">What’s in the edit room</h2>
        <dl className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {INSIDE.map(([t, d]) => (
            <div key={t} className="border-t border-rule-strong pt-4">
              <dt className="text-[17px] font-[640]">{t}</dt>
              <dd className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="bg-cover text-cover-ink">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-6 px-6 py-14 lg:px-10">
          <p className="max-w-[28ch] text-[30px] leading-[1.1] font-[650] wdth-wide">Find the drop before you publish.</p>
          <Link href="/new" className="inline-flex items-center gap-2 rounded-[9px] bg-brass-bright px-5 py-3 text-[15.5px] font-[650] text-cover hover:brightness-105">
            Analyze a script <ArrowRight size={17} aria-hidden />
          </Link>
        </div>
      </footer>
    </div>
  );
}
