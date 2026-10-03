"use client";

import { ArrowRight, Download, Film, Link2, ScrollText } from "lucide-react";
import { useState } from "react";

import { Badge, Button, Field, Input, Panel, PanelHeader, Segmented, Tabs, Textarea, ThemeToggle } from "@/components/ui";

const SWATCHES = [
  ["canvas", "Canvas"],
  ["surface", "Surface"],
  ["surface-2", "Surface 2"],
  ["line", "Line"],
  ["line-strong", "Line strong"],
  ["ink", "Ink"],
  ["ink-2", "Ink 2"],
  ["ink-3", "Ink 3"],
  ["primary", "Primary"],
  ["accent", "Accent"],
  ["drop", "Drop"],
  ["good", "Good"],
  ["warn", "Warn"],
  ["actual", "Actual curve"],
  ["rev-blue", "Blue draft"],
  ["rev-pink", "Pink draft"],
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 className="panel-title">{title}</h2>
      {children}
    </section>
  );
}

/** Living reference for the design tokens and shared components, in whichever theme is active. */
export default function KitPage() {
  const [category, setCategory] = useState<"tech" | "education" | "vlog">("tech");
  const [source, setSource] = useState<"script" | "url" | "video">("script");

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-10 px-6 py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="panel-title">Retent AI</p>
            <h1 className="text-[28px] leading-tight font-[600] tracking-[-0.02em]">Design kit</h1>
            <p className="max-w-[60ch] text-ink-2">
              Tokens and shared components. Light is Instrument (IBM Plex); dark is Edit Bay (Geist). Switch the theme to compare.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <Section title="Color">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {SWATCHES.map(([token, name]) => (
              <li key={token} className="flex flex-col gap-1.5">
                <span className="h-12 rounded-control border border-line" style={{ background: `var(--${token})` }} />
                <span className="text-[12px] font-[500]">{name}</span>
                <span className="tc text-[11px] text-ink-3">--{token}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-ink-3">Severity</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className="h-5 w-10 rounded-chip" style={{ background: `var(--sev-${n})` }} title={`Severity ${n}`} />
            ))}
          </div>
        </Section>

        <Section title="Type">
          <div className="flex flex-col gap-3">
            <p className="text-[34px] leading-[1.1] font-[600] tracking-[-0.025em]">Your hook lands at 0:45. Viewers start leaving at 0:20.</p>
            <p className="max-w-[62ch] text-[15px] leading-relaxed text-ink-2">
              Retent AI reads your script before you shoot, predicts where viewers will leave, circles the lines that cause it and
              rewrites the fix in your voice.
            </p>
            <p className="text-[18px]">नमस्ते दोस्तों, कैसे हो आप सब? स्वागत है आपका हमारे चैनल पर।</p>
            <p className="font-script text-[14px] text-ink-2">Hello doston, kaise ho aap sab? Aaj ka video bahut special hai.</p>
            <p className="tc text-[13px] text-ink-3">00:00:27:12 · 02:20 · 06:03</p>
            <p className="tnum text-[24px] font-[600] tracking-[-0.02em]">69.3% · 3:19 · 466 / 1,000 · +8.8 pts</p>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button>
              Predict the drop <ArrowRight size={16} aria-hidden />
            </Button>
            <Button variant="secondary">Open the sample</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Discard Blue draft</Button>
            <Button variant="secondary" icon aria-label="Export markers">
              <Download size={16} aria-hidden />
            </Button>
            <Button disabled>Disabled</Button>
            <Button loading>Simulating</Button>
            <Button href="/projects" variant="secondary">
              Link button
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="sm" variant="secondary">
              Copy chapters
            </Button>
            <Button size="lg">
              Analyze a script <ArrowRight size={17} aria-hidden />
            </Button>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <Tabs
                label="Source type"
                value={source}
                onChange={setSource}
                items={[
                  { value: "script", label: "Script", icon: <ScrollText size={15} aria-hidden /> },
                  { value: "url", label: "Published video", icon: <Link2 size={15} aria-hidden /> },
                  { value: "video", label: "Rough cut", icon: <Film size={15} aria-hidden /> },
                ]}
              />
              <Field label="Title" help="We check whether the video pays off what the title promises.">
                <Input defaultValue="₹20,000 mein sabse best camera phone kaunsa hai?" />
              </Field>
              <Field label="Thumbnail text" optional>
                <Input placeholder="BEST CAMERA? ₹20K" />
              </Field>
            </div>
            <div className="flex flex-col gap-4">
              <Field label="YouTube link" error="That doesn’t look like a YouTube video link yet.">
                <Input defaultValue="https://youtube.com/watch?v=abc" />
              </Field>
              <Field label="Notes for the editor" optional>
                <Textarea placeholder="Anything the fix should keep." />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-[600]">Category</span>
                <Segmented
                  label="Category"
                  value={category}
                  onChange={setCategory}
                  options={[
                    { value: "tech", label: "Tech review" },
                    { value: "education", label: "Education" },
                    { value: "vlog", label: "Vlog" },
                  ]}
                />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Status and labels">
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <Badge key={n} severity={n}>
                Sev {n}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="warn">Development data</Badge>
            <Badge tone="warn">Uncalibrated</Badge>
            <Badge tone="ai">Written by Claude Opus 5.5</Badge>
            <Badge>Groq · fast</Badge>
            <Badge tone="ok">Fix applied · +68 viewers</Badge>
            <Badge tone="risk">Over 15 min: results are indicative</Badge>
          </div>
        </Section>

        <Section title="Panels">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px]">
            <Panel aria-labelledby="kit-curve">
              <PanelHeader id="kit-curve" title="Predicted retention" actions={<span>White draft</span>} />
              <div className="grid h-40 place-items-center rounded-control bg-surface-2 text-[12px] text-ink-3">Curve</div>
            </Panel>
            <Panel aria-labelledby="kit-fix" className="flex flex-col gap-3">
              <PanelHeader id="kit-fix" title="Biggest drop" className="mb-0" />
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="risk" severity={5}>
                  Severity 5 of 5
                </Badge>
                <Badge>Confidence 75%</Badge>
              </div>
              <p className="text-[16px] leading-snug font-[600]">No clear hook in the opening</p>
              <p className="text-[13px] text-ink-2">The first 0:27 never says what the viewer gets or why to stay.</p>
              <Button block>Apply to Blue draft</Button>
            </Panel>
          </div>
        </Section>
      </div>
    </div>
  );
}
