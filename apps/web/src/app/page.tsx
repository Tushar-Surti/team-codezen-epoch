"use client";

import { useGSAP } from "@gsap/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clapperboard, EyeOff, FileDiff, FlaskConical, Languages, PenLine, Zap } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { ScrollStory } from "@/components/landing/ScrollStory";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { BrandMark } from "@/components/shell/BrandMark";
import { Badge, Button, ThemeCycleButton } from "@/components/ui";
import { api } from "@/lib/api";
import { evalApi } from "@/lib/eval";
import { fmtTime } from "@/lib/format";
import { SplitText, gsap, prefersReducedMotion } from "@/lib/gsap";

const SAMPLE = "sample-hinglish-tech";

/** The hero's proof: the first lines of the real sample script with its flagged drops in the margin. */
function ScriptExcerpt() {
  const { data: a } = useQuery({ queryKey: ["analysis", SAMPLE], queryFn: () => api.get(SAMPLE) });
  if (!a) return <div className="hero-page h-[372px] rounded-panel border border-line bg-surface" />;
  const flagOf = new Map<string, { title: string; severity: number; lead: boolean }>();
  for (const f of a.flags) {
    f.evidence.sentence_ids.forEach((id, i) => {
      const prev = flagOf.get(id);
      if (!prev || f.severity > prev.severity) flagOf.set(id, { title: f.title, severity: f.severity, lead: i === 0 && !prev });
    });
  }
  const top = a.flags[0];
  return (
    <figure className="hero-page relative overflow-hidden rounded-panel border border-line bg-surface shadow-overlay">
      <figcaption className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <span className="panel-title">White draft</span>
        <Badge tone="warn" size="sm">
          Sample script
        </Badge>
      </figcaption>
      <ol className="py-3">
        {a.sentences.slice(0, 7).map((s) => {
          const f = flagOf.get(s.id);
          return (
            <li key={s.id} className="hero-line grid grid-cols-[48px_minmax(0,1fr)] items-baseline gap-3 px-4 py-[3px] sm:grid-cols-[48px_minmax(0,1fr)_150px]">
              <span className="tc text-right text-[11px] text-ink-3">{fmtTime(s.start)}</span>
              <span className="relative font-script text-[13px] leading-[1.6] text-ink">
                {f && (
                  <span
                    aria-hidden
                    className="absolute top-[4px] bottom-[4px] left-[-9px] w-[2px] rounded-full"
                    style={{ background: `var(--sev-${f.severity})` }}
                  />
                )}
                {s.text}
              </span>
              <span className="text-[11.5px] leading-[1.25] font-[500] text-drop-text max-sm:hidden">{f?.lead ? f.title : ""}</span>
            </li>
          );
        })}
      </ol>
      {top && (
        <div className="flex items-center justify-between gap-3 border-t border-line bg-drop-wash px-5 py-3">
          <span className="text-[13px] font-[600] text-drop-text">Biggest drop: {top.title}</span>
          <span className="tnum shrink-0 text-[12.5px] text-ink-2">
            <strong className="font-[600] text-drop-text">{Math.round(top.viewers_lost)}</strong> / 1,000 viewers
          </span>
        </div>
      )}
    </figure>
  );
}

function Proof() {
  const { data: r } = useQuery({ queryKey: ["eval"], queryFn: evalApi.summary, retry: false });
  if (!r) return null;
  const m = r.summary.overall.model.spearman.mean;
  const p = r.summary.overall.position.spearman.mean;
  const stats = [
    { k: "Public videos tested", v: String(r.n_videos), s: `from ${r.n_channels} channels, English and Hindi` },
    { k: "Beats “position only”", v: `${Math.round(r.summary.wins.position * 100)}%`, s: "of held-out videos" },
    { k: "Shape match, Retent AI", v: `${m >= 0 ? "+" : "−"}${Math.abs(m).toFixed(2)}`, s: "rank correlation with YouTube’s curve" },
    { k: "Shape match, position only", v: `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(2)}`, s: "the baseline to beat" },
  ];
  return (
    <section className="border-y border-line bg-surface" aria-labelledby="proof">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-10">
        <div className="flex flex-col gap-4">
          <p className="eyebrow">Accuracy, shown openly</p>
          <h2 id="proof" className="text-[34px] leading-[1.1] font-[600] tracking-[-0.025em]">
            Tested blind, on channels it never saw.
          </h2>
          <p className="max-w-[52ch] text-[16px] leading-relaxed text-ink-2">
            We predict from the transcript alone, then compare against YouTube’s public “Most replayed” curve. Every channel is held out
            from training, and every number is computed. We publish where it’s weak too.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button href="/lab" variant="secondary" size="lg">
              <FlaskConical size={16} aria-hidden /> See the accuracy report
            </Button>
            <Button href="/blind" variant="ghost" size="lg">
              <EyeOff size={16} aria-hidden /> Run a blind test
            </Button>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-px self-center overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2">
          {stats.map((x, i) => (
            <div key={x.k} className="flex flex-col gap-1 bg-surface p-5">
              <dt className="text-[13px] text-ink-3">{x.k}</dt>
              <dd className={`tnum text-[40px] leading-none font-[600] tracking-[-0.03em] ${i < 2 ? "text-ink" : "text-ink-2"}`}>{x.v}</dd>
              <dd className="text-[12.5px] text-ink-3">{x.s}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const INSIDE = [
  { icon: PenLine, t: "Drops, with the evidence", d: "Late hooks, title promises paid off too late, repeats, detours, early sponsor reads, wrap-ups said too soon." },
  { icon: Languages, t: "Fixes in your voice", d: "Rewrites in English, Hindi or Hinglish, each one re-simulated so you see the viewers it keeps." },
  { icon: Zap, t: "Hook Lab", d: "Five openings pitched and ranked by the model on intro retention." },
  { icon: FileDiff, t: "Revision drafts", d: "Blue and Pink drafts like a real shooting script, with every changed line marked." },
  { icon: Clapperboard, t: "Hand-off to your editor", d: "DaVinci Resolve markers, the revised script and YouTube chapters." },
  { icon: EyeOff, t: "Honest accuracy", d: "Blind tests against YouTube’s real curves, baselines and failure cases included." },
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
      gsap.from(split.words, { yPercent: 40, autoAlpha: 0, duration: 0.8, stagger: 0.045, ease: "expo.out" });
      gsap.from(".hero-sub, .hero-cta", { autoAlpha: 0, y: 10, duration: 0.6, delay: 0.35, stagger: 0.07 });
      gsap.from(".hero-page", { autoAlpha: 0, y: 18, duration: 0.9, delay: 0.2, ease: "expo.out" });
      return () => split.revert();
    },
    { scope: hero },
  );

  return (
    <div className="min-h-dvh bg-canvas">
      <SmoothScroll />
      <nav className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md" aria-label="Site">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-6 lg:px-10">
          <Link href="/" className="flex items-center gap-2.5 rounded-control text-[15px] font-[600] tracking-[-0.01em]">
            <BrandMark />
            Retent AI
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button href="/lab" variant="ghost" className="max-sm:hidden">
              Accuracy
            </Button>
            <Button href="/blind" variant="ghost" className="max-sm:hidden">
              Blind test
            </Button>
            <ThemeCycleButton />
            <Button href="/projects" className="ml-2">
              Open the app
            </Button>
          </div>
        </div>
      </nav>

      <header
        ref={hero}
        className="mx-auto grid max-w-[1200px] items-center gap-12 px-6 pt-16 pb-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:px-10 lg:pt-24 lg:pb-28"
      >
        <div className="flex flex-col gap-6">
          <p className="hero-sub eyebrow">For YouTube creators · English, Hindi and Hinglish</p>
          <h1 className="hero-title text-[clamp(40px,5.6vw,68px)] leading-[1.02] font-[600] tracking-[-0.035em]">
            Predict the drop. Fix the video. Keep them watching.
          </h1>
          <p className="hero-sub max-w-[50ch] text-[18px] leading-relaxed text-ink-2">
            Retent AI reads your script before you shoot, predicts where viewers will leave, marks the lines that cause it, and rewrites
            the fix in your voice.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button href="/new" size="lg" className="hero-cta">
              Analyze a script <ArrowRight size={17} aria-hidden />
            </Button>
            <Button href={`/a/${SAMPLE}`} variant="secondary" size="lg" className="hero-cta">
              Open the sample
            </Button>
          </div>
        </div>
        <ScriptExcerpt />
      </header>

      {sample && <ScrollStory analysis={sample} sim={sim ?? null} />}

      <Proof />

      <section className="mx-auto max-w-[1200px] px-6 py-20 lg:px-10" aria-labelledby="inside">
        <div className="flex flex-col gap-3">
          <p className="eyebrow">What you get</p>
          <h2 id="inside" className="text-[34px] leading-[1.1] font-[600] tracking-[-0.025em]">
            Everything between the script and the upload
          </h2>
        </div>
        <dl className="mt-10 grid gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {INSIDE.map(({ icon: Icon, t, d }) => (
            <div key={t} className="flex flex-col gap-3 bg-surface p-6">
              <span className="grid size-9 place-items-center rounded-control border border-line bg-surface-2 text-ink-2">
                <Icon size={17} strokeWidth={1.7} aria-hidden />
              </span>
              <dt className="text-[16px] font-[600] tracking-[-0.01em]">{t}</dt>
              <dd className="text-[14.5px] leading-relaxed text-ink-2">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-line bg-surface" aria-labelledby="cta">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-6 py-16 lg:px-10">
          <div className="flex flex-col gap-2">
            <h2 id="cta" className="text-[30px] leading-[1.1] font-[600] tracking-[-0.025em]">
              Find the drop before you publish.
            </h2>
            <p className="text-[15px] text-ink-2">Paste a script, drop a rough cut or link a published video.</p>
          </div>
          <Button href="/new" size="lg">
            Analyze a script <ArrowRight size={17} aria-hidden />
          </Button>
        </div>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-6 py-5 text-[12.5px] text-ink-3 lg:px-10">
            <span className="flex items-center gap-2">
              <BrandMark size="sm" /> Retent AI
            </span>
            <span>Every accuracy number on this site is computed by the evaluation pipeline.</span>
          </div>
        </footer>
      </section>
    </div>
  );
}
