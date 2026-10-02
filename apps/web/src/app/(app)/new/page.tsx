"use client";

import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, Film, Link2, ScrollText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { StageProgress } from "@/components/intake/StageProgress";
import { API_URL, api } from "@/lib/api";
import type { StageEvent } from "@/lib/contract.gen";
import { LANGUAGE_LABEL, fmtTime } from "@/lib/format";
import { detectLanguage, estimateSeconds, wordCount } from "@/lib/lang";

type Sample = { id: string; label: string; note: string; title: string; category: string; thumbnail_text?: string; script: string };

const CATEGORIES = [
  { key: "tech", label: "Tech review" },
  { key: "education", label: "Education" },
  { key: "vlog", label: "Vlog" },
] as const;
const ENGINES = [
  { key: "auto", label: "Auto", hint: "Claude for depth, Groq when speed matters" },
  { key: "deep", label: "Deep", hint: "Claude writes every fix" },
  { key: "fast", label: "Fast", hint: "Groq, seconds not minutes" },
] as const;

function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: readonly { key: T; label: string; hint?: string }[]; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[7px] border border-rule-strong bg-paper-raised p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          title={o.hint}
          onClick={() => onChange(o.key)}
          className={clsx(
            "rounded-[5px] px-3 py-1.5 text-[13.5px] font-[560] transition-colors duration-150",
            value === o.key ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-sunk",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function NewAnalysisPage() {
  const router = useRouter();
  const { data: samples } = useQuery({
    queryKey: ["samples"],
    queryFn: () => fetch(`${API_URL}/api/samples`).then((r) => r.json() as Promise<Sample[]>),
  });
  const [mode, setMode] = useState<"script" | "url" | "video">("script");
  const [script, setScript] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [thumb, setThumb] = useState("");
  const [category, setCategory] = useState<"tech" | "education" | "vlog">("tech");
  const [engine, setEngine] = useState<"auto" | "deep" | "fast">("auto");
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

  if (running || events.length) {
    return (
      <div className="grid h-full place-items-center overflow-y-auto px-6 py-10">
        <div className="w-full">
          <p className="mx-auto mb-2 max-w-[560px] truncate text-[13px] text-ink-3">{mode === "url" ? url : title}</p>
          {uploadPct !== null && (
            <div className="mx-auto mb-6 max-w-[560px]">
              <p className="tnum mb-1.5 text-[13px] text-ink-2">Uploading {file?.name} · {Math.round(uploadPct * 100)}%</p>
              <div className="h-[5px] rounded-full bg-paper-sunk">
                <div className="h-full rounded-full bg-ink transition-[width] duration-200" style={{ width: `${uploadPct * 100}%` }} />
              </div>
            </div>
          )}
          <StageProgress events={events} error={error} mode={mode === "url" ? "url" : mode === "video" ? "video" : "script"} />
          {error && (
            <div className="mx-auto mt-4 max-w-[560px]">
              <button onClick={() => { setEvents([]); setRunning(false); }} className="text-[14px] font-[600] text-ink underline">
                Back to the script
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-rule px-8 pt-8 pb-5">
        <h1 className="text-[26px] leading-tight font-[650] wdth-wide">Find the drop before you publish</h1>
        <p className="mt-1 max-w-[70ch] text-[14px] text-ink-2">
          Paste the script you’re about to shoot, or the transcript of your rough cut. Retent AI predicts where viewers leave, why, and what to change.
        </p>
      </header>
      <div className="grid flex-1 grid-cols-1 gap-8 px-8 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Source" className="flex min-h-[420px] flex-col">
          <div role="tablist" aria-label="Source type" className="mb-3 flex gap-1">
            {[
              { k: "script", label: "Script or transcript", icon: ScrollText },
              { k: "url", label: "Published video", icon: Link2 },
              { k: "video", label: "Rough cut", icon: Film },
            ].map(({ k, label, icon: Icon }) => (
              <button
                key={k}
                role="tab"
                aria-selected={mode === k}
                onClick={() => setMode(k as typeof mode)}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-[6px] px-3 py-1.5 text-[13.5px] font-[560] transition-colors duration-150",
                  mode === k ? "bg-paper-sunk text-ink" : "text-ink-2 hover:bg-paper-sunk/60",
                )}
              >
                <Icon size={15} aria-hidden /> {label}
              </button>
            ))}
          </div>
          {mode === "script" ? (
            <div className="relative flex flex-1 flex-col rounded-[3px] border border-rule bg-paper-raised shadow-[0_10px_30px_-18px_rgb(23_23_26/0.25)]">
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={"Hello doston! Aaj hum dekhne wale hain…\n\nPaste the full script. One line per sentence works best; Hindi, Hinglish and English are all fine."}
                aria-label="Script"
                className="min-h-[360px] flex-1 resize-none bg-transparent px-8 py-6 font-script text-[15px] leading-[1.6] text-ink outline-none placeholder:text-ink-3"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-2 text-[12.5px] text-ink-3">
                <span className="tnum">
                  {words.toLocaleString("en-IN")} words · {LANGUAGE_LABEL[lang]} · about {fmtTime(secs)} spoken
                  {words > 0 && !inScope && (
                    <span className="ml-2 text-pen-text">{secs < 300 ? "under 5 min: results are indicative" : "over 15 min: results are indicative"}</span>
                  )}
                </span>
                {samples?.[0] && (
                  <button
                    type="button"
                    onClick={() => {
                      const s = samples[0];
                      setScript(s.script);
                      setTitle(s.title);
                      setThumb(s.thumbnail_text ?? "");
                      setCategory(s.category as typeof category);
                    }}
                    className="font-[600] text-ink underline-offset-2 hover:underline"
                  >
                    Load the sample script
                  </button>
                )}
              </div>
            </div>
          ) : mode === "url" ? (
            <div className="flex flex-1 flex-col justify-center rounded-[6px] border border-rule bg-paper-raised p-8">
              <label className="block">
                <span className="mb-2 block text-[16px] font-[620]">Paste a public YouTube link</span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canRun && run()}
                  placeholder="https://www.youtube.com/watch?v=…"
                  className="w-full rounded-[8px] border border-rule-strong bg-paper px-4 py-3 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-ink focus:shadow-[0_0_0_3px_var(--rev-blue-paper)]"
                />
              </label>
              <p className="mt-3 max-w-[64ch] text-[14px] text-ink-2">
                Retent AI fetches the video, gets the transcript (YouTube captions, or Whisper when they’re blocked), predicts
                the curve blind, and, when YouTube shows a “Most replayed” curve for the video, lets you reveal it next to the prediction.
              </p>
              <p className="mt-2 text-[12.5px] text-ink-3">Works best on 5–15 minute videos. About 20–40 seconds per video.</p>
            </div>
          ) : (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) setFile(f);
              }}
              className={clsx(
                "flex flex-1 cursor-pointer flex-col items-center justify-center rounded-[8px] border-2 border-dashed p-10 text-center transition-colors duration-150",
                dragging ? "border-ink bg-paper-sunk" : "border-rule-strong bg-paper-raised hover:border-ink/40",
              )}
            >
              <input
                type="file"
                accept="video/*,audio/*,.mkv"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Film size={30} strokeWidth={1.5} className="text-ink-3" aria-hidden />
              {file ? (
                <>
                  <p className="mt-3 text-[16px] font-[620]">{file.name}</p>
                  <p className="tnum mt-1 text-[13px] text-ink-3">{(file.size / 1e6).toFixed(1)} MB · click or drop to change</p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-[16px] font-[620]">Drop your rough cut here, or click to choose</p>
                  <p className="mt-1 text-[13px] text-ink-3">MP4, MOV, MKV or WebM (or MP3/M4A audio), up to 25 minutes</p>
                </>
              )}
              <p className="mt-5 max-w-[60ch] text-[13.5px] text-ink-2">
                Before you publish: Retent AI transcribes the cut with Whisper, measures shot cuts and silences from the video
                itself, predicts the retention curve and flags slow intros, static shots, dead air, repeats and late payoffs, with
                timestamps you can jump to in your editor.
              </p>
              <p className="mt-2 text-[12px] text-ink-3">The file stays on this machine; only the extracted audio is sent for transcription.</p>
            </label>
          )}
        </section>

        <aside aria-label="Details" className="space-y-6">
          {mode !== "url" && (<>
          <label className="block">
            <span className="mb-1.5 block text-[13.5px] font-[600]">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The title you plan to publish with"
              className="w-full rounded-[7px] border border-rule-strong bg-paper-raised px-3 py-2 text-[14.5px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-ink focus:shadow-[0_0_0_3px_var(--rev-blue-paper)]"
            />
            <span className="mt-1 block text-[12px] text-ink-3">We track whether the video pays off what the title promises.</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13.5px] font-[600]">
              Thumbnail text <span className="font-[450] text-ink-3">optional</span>
            </span>
            <input
              value={thumb}
              onChange={(e) => setThumb(e.target.value)}
              placeholder="BEST CAMERA? ₹20K"
              className="w-full rounded-[7px] border border-rule-strong bg-paper-raised px-3 py-2 text-[14.5px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-ink focus:shadow-[0_0_0_3px_var(--rev-blue-paper)]"
            />
          </label>
          </>)}
          <div>
            <span className="mb-1.5 block text-[13.5px] font-[600]">Category</span>
            <Segmented label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
          </div>
          <div>
            <span className="mb-1.5 block text-[13.5px] font-[600]">Engine</span>
            <Segmented label="Engine" value={engine} onChange={setEngine} options={ENGINES} />
            <span className="mt-1 block text-[12px] text-ink-3">{ENGINES.find((e) => e.key === engine)?.hint}</span>
          </div>
          <button
            type="button"
            disabled={!canRun}
            onClick={run}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-ink px-5 py-3 text-[15px] font-[620] text-paper transition-[background,opacity] duration-200 hover:bg-cover disabled:cursor-not-allowed disabled:opacity-35"
          >
            Predict the drop
            <ArrowRight size={17} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
          </button>
          {!canRun && mode === "url" && url.length > 0 && (
            <p className="text-[12.5px] text-ink-3">That doesn’t look like a YouTube video link yet.</p>
          )}
          {!canRun && mode === "script" && (
            <p className="text-[12.5px] text-ink-3">
              {title.trim().length <= 3 ? "Add the title first. " : ""}
              {words < 120 ? "Paste at least a couple of minutes of script." : ""}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
