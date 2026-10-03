"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Film, Link2, ScrollText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { StageProgress } from "@/components/intake/StageProgress";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge, Button, Dropzone, Field, Input, Panel, Segmented, Tabs } from "@/components/ui";
import { API_URL, api } from "@/lib/api";
import type { StageEvent } from "@/lib/contract.gen";
import { LANGUAGE_LABEL, fmtTime } from "@/lib/format";
import { detectLanguage, estimateSeconds, wordCount } from "@/lib/lang";

type Sample = { id: string; label: string; note: string; title: string; category: string; thumbnail_text?: string; script: string };
type Mode = "script" | "url" | "video";
type Category = "tech" | "education" | "vlog";
type Engine = "auto" | "deep" | "fast";

const CATEGORIES = [
  { value: "tech", label: "Tech review" },
  { value: "education", label: "Education" },
  { value: "vlog", label: "Vlog" },
] as const;
const ENGINES = [
  { value: "auto", label: "Auto", hint: "Claude for depth, Groq when speed matters" },
  { value: "deep", label: "Deep", hint: "Claude writes every fix" },
  { value: "fast", label: "Fast", hint: "Groq, seconds not minutes" },
] as const;
const SOURCES = [
  { value: "script", label: "Script or transcript", icon: <ScrollText size={15} aria-hidden /> },
  { value: "url", label: "Published video", icon: <Link2 size={15} aria-hidden /> },
  { value: "video", label: "Rough cut", icon: <Film size={15} aria-hidden /> },
] as const;

export default function NewAnalysisPage() {
  const router = useRouter();
  const { data: samples } = useQuery({
    queryKey: ["samples"],
    queryFn: () => fetch(`${API_URL}/api/samples`).then((r) => r.json() as Promise<Sample[]>),
  });
  const [mode, setMode] = useState<Mode>("script");
  const [script, setScript] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [thumb, setThumb] = useState("");
  const [category, setCategory] = useState<Category>("tech");
  const [engine, setEngine] = useState<Engine>("auto");
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lang = useMemo(() => detectLanguage(script), [script]);
  const words = useMemo(() => wordCount(script), [script]);
  const secs = useMemo(() => estimateSeconds(script, lang), [script, lang]);
  const inScope = secs >= 300 && secs <= 900;
  const urlOk = /(youtu\.be\/|youtube\.com\/(watch\?v=|shorts\/|live\/|embed\/))[A-Za-z0-9_-]{11}/.test(url);
  const canRun =
    mode === "url" ? urlOk : mode === "video" ? !!file && title.trim().length > 3 : title.trim().length > 3 && words >= 120;

  async function run() {
    setError(null);
    setEvents([]);
    setRunning(true);
    try {
      let job;
      if (mode === "video" && file) {
        const form = new FormData();
        form.append("file", file);
        form.append("title", title.trim());
        form.append("category", category);
        form.append("engine", engine);
        if (thumb) form.append("thumbnail_text", thumb);
        setUploadPct(0);
        job = await api.upload(form, setUploadPct);
        setUploadPct(null);
      } else {
        job = mode === "url"
          ? await api.analyze({ title: "", category, source_url: url.trim(), engine })
          : await api.analyze({ title: title.trim(), category, script, thumbnail_text: thumb || null, engine });
      }
      // Show each stage long enough to read, even when the server finishes faster.
      let shown = Promise.resolve();
      const pace = (fn: () => void) => {
        shown = shown.then(() => new Promise((r) => setTimeout(() => { fn(); r(); }, 320)));
      };
      api.events(
        job.job_id,
        (ev) => pace(() => setEvents((prev) => [...prev, ev])),
        (err) =>
          pace(() => {
            if (err) {
              setError(err);
              setRunning(false);
            } else {
              setTimeout(() => router.push(`/a/${job.analysis_id}`), 600);
            }
          }),
      );
    } catch (e) {
      setError((e as Error).message);
      setRunning(false);
    }
  }

  function loadSample() {
    const s = samples?.[0];
    if (!s) return;
    setScript(s.script);
    setTitle(s.title);
    setThumb(s.thumbnail_text ?? "");
    setCategory(s.category as Category);
  }

  if (running || events.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-10">
        {uploadPct !== null && (
          <Panel className="w-full max-w-[580px]">
            <div className="mb-2 flex items-baseline justify-between gap-4 text-[13px]">
              <span className="truncate text-ink-2">Uploading {file?.name}</span>
              <span className="tc text-ink-3">{Math.round(uploadPct * 100)}%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${uploadPct * 100}%` }} />
            </div>
          </Panel>
        )}
        <StageProgress events={events} error={error} mode={mode} subject={mode === "url" ? url : title} />
        {error && (
          <Button
            variant="secondary"
            onClick={() => {
              setEvents([]);
              setRunning(false);
            }}
          >
            <ArrowLeft size={15} aria-hidden /> Back to the {mode === "url" ? "link" : mode === "video" ? "rough cut" : "script"}
          </Button>
        )}
      </div>
    );
  }

  const blocker =
    mode === "url"
      ? url.length > 0 && !urlOk
        ? "That doesn’t look like a YouTube video link yet."
        : !url
          ? "Paste a public YouTube link to continue."
          : null
      : title.trim().length <= 3
        ? "Add the title you plan to publish with."
        : mode === "script" && words < 120
          ? "Paste at least a couple of minutes of script."
          : mode === "video" && !file
            ? "Choose the rough cut to upload."
            : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader
        title="New analysis"
        description="Paste the script you’re about to shoot, the transcript of your rough cut, or a published video. Retent AI predicts where viewers leave, why, and what to change."
      />

      <div className="grid flex-1 grid-cols-1 items-start gap-6 px-8 py-6 compact:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Source" className="flex min-h-[480px] min-w-0 flex-col gap-4 self-stretch">
          <Tabs<Mode> label="Source type" value={mode} onChange={setMode} items={SOURCES} />

          {mode === "script" ? (
            <Panel padded={false} className="flex flex-1 flex-col overflow-hidden focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-wash)]">
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canRun) {
                    e.preventDefault();
                    run();
                  }
                }}
                placeholder={"Hello doston! Aaj hum dekhne wale hain…\n\nPaste the full script. One line per sentence works best; Hindi, Hinglish and English are all fine."}
                aria-label="Script"
                className="min-h-[380px] flex-1 resize-none bg-transparent px-7 py-6 font-script text-[14.5px] leading-[1.7] text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/50 px-4 py-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-3" aria-live="polite">
                  <span className="tc">{words.toLocaleString("en-IN")} words</span>
                  <span>{LANGUAGE_LABEL[lang]}</span>
                  <span>
                    about <span className="tc">{fmtTime(secs)}</span> spoken
                  </span>
                  {words > 0 && !inScope && (
                    <Badge tone="warn" className="h-5 text-[11px]">
                      {secs < 300 ? "Under 5 min: results are indicative" : "Over 15 min: results are indicative"}
                    </Badge>
                  )}
                </div>
                {samples?.[0] && (
                  <Button variant="ghost" size="sm" onClick={loadSample}>
                    Load the sample script
                  </Button>
                )}
              </div>
            </Panel>
          ) : mode === "url" ? (
            <Panel className="flex flex-1 flex-col justify-center gap-4 p-8">
              <Field label="Public YouTube link" help="Works best on 5–15 minute videos. About 20–40 seconds per video.">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canRun && run()}
                  placeholder="https://www.youtube.com/watch?v=…"
                  inputMode="url"
                  className="h-(--h-control-lg) text-[15px]"
                />
              </Field>
              <p className="max-w-[64ch] text-[13.5px] leading-relaxed text-ink-2">
                Retent AI fetches the video, gets the transcript (YouTube captions, or Whisper when they’re blocked) and predicts the
                curve blind. When YouTube shows a “Most replayed” curve for the video, you can reveal it next to the prediction.
              </p>
            </Panel>
          ) : (
            <Dropzone accept="video/*,audio/*,.mkv" onFile={setFile} label="Rough cut file" className="flex-1 gap-1 p-10">
              <span className="mb-2 grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
                <Film size={20} strokeWidth={1.6} aria-hidden />
              </span>
              {file ? (
                <>
                  <span className="text-[15px] font-[600]">{file.name}</span>
                  <span className="tc text-[12.5px] text-ink-3">{(file.size / 1e6).toFixed(1)} MB · click or drop to change</span>
                </>
              ) : (
                <>
                  <span className="text-[15px] font-[600]">Drop your rough cut here, or click to choose</span>
                  <span className="text-[12.5px] text-ink-3">MP4, MOV, MKV or WebM (or MP3/M4A audio), up to 25 minutes</span>
                </>
              )}
              <span className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-ink-2">
                Retent AI transcribes the cut with Whisper, measures shot cuts and silences from the video itself, predicts the
                retention curve and flags slow intros, static shots, dead air, repeats and late payoffs, with timestamps you can jump
                to in your editor.
              </span>
              <span className="mt-1 text-[12px] text-ink-3">The file stays on this machine; only the extracted audio is sent for transcription.</span>
            </Dropzone>
          )}
        </section>

        <Panel className="flex flex-col gap-5 lg:sticky lg:top-6" aria-label="Details">
          {mode !== "url" && (
            <>
              <Field label="Title" help="We check whether the video pays off what the title promises.">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The title you plan to publish with" />
              </Field>
              <Field label="Thumbnail text" optional>
                <Input value={thumb} onChange={(e) => setThumb(e.target.value)} placeholder="BEST CAMERA? ₹20K" />
              </Field>
            </>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-[600]">Category</span>
            <Segmented<Category> label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-[600]">Engine</span>
            <Segmented<Engine> label="Engine" value={engine} onChange={setEngine} options={ENGINES} />
            <span className="text-[12px] text-ink-3">{ENGINES.find((e) => e.value === engine)?.hint}</span>
          </div>

          <div className="flex flex-col gap-2 border-t border-line pt-5">
            <Button size="lg" block disabled={!canRun} onClick={run}>
              Predict the drop <ArrowRight size={17} aria-hidden />
            </Button>
            <p className="min-h-[18px] text-[12.5px] text-ink-3" aria-live="polite">
              {blocker ??
                (mode === "script" ? (
                  <>
                    Or press <kbd className="tc rounded-chip border border-line bg-surface-2 px-1 text-[11px]">Ctrl</kbd>{" "}
                    <kbd className="tc rounded-chip border border-line bg-surface-2 px-1 text-[11px]">Enter</kbd> in the script.
                  </>
                ) : null)}
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
