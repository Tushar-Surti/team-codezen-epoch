"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Copy, Download, Film, Link2, Loader2, Scissors } from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { API_URL, api } from "@/lib/api";
import { fmtTime } from "@/lib/format";

type Clip = {
  id: string;
  start: number;
  end: number;
  duration: number;
  score: number;
  text: string;
  title: string;
  hook_text: string;
  why: string;
  description: string;
};
type ShortsResult = {
  analysis_id: string;
  source: "most_replayed" | "model";
  full_video_url: string | null;
  video_id: string | null;
  can_render: boolean;
  channel: string | null;
  title: string;
  provenance: { provider: string; model: string } | null;
  clips: Clip[];
};

const EASE = [0.16, 1, 0.3, 1] as const;

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
  return res.json();
}

function ShortCard({ clip, result, index }: { clip: Clip; result: ShortsResult; index: number }) {
  const [copied, setCopied] = useState(false);
  const render = useMutation({
    mutationFn: () =>
      post<{ url: string; file: string }>("/api/shorts/render", {
        analysis_id: result.analysis_id,
        start: clip.start,
        end: clip.end,
        hook_text: clip.hook_text,
      }),
  });
  const videoUrl = render.data ? `${API_URL}${render.data.url}` : null;
  // hq720 is widescreen without letterbox bars; mqdefault is the always-present fallback.
  const poster = result.video_id ? `https://i.ytimg.com/vi/${result.video_id}/hq720.jpg` : null;
  const fallback = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (result.video_id && !img.src.includes("mqdefault")) img.src = `https://i.ytimg.com/vi/${result.video_id}/mqdefault.jpg`;
  };

  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: EASE }}
      className="flex w-[300px] shrink-0 flex-col"
    >
      {/* 9:16 phone frame */}
      <div className="relative aspect-[9/16] overflow-hidden rounded-[22px] border-[6px] border-cover bg-cover shadow-[0_24px_50px_-26px_rgb(23_23_26/0.55)]">
        {videoUrl ? (
          <video src={videoUrl} controls autoPlay playsInline className="h-full w-full object-cover" />
        ) : (
          <>
            {poster && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={poster} onError={fallback} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover blur-xl" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={poster} onError={fallback} alt="" className="absolute top-1/2 left-0 w-full -translate-y-1/2" />
              </>
            )}
            <div className="absolute inset-x-0 top-[12%] flex flex-col items-center px-5">
              <span className="rounded-[8px] bg-paper/95 px-3 py-1.5 text-center text-[17px] leading-tight font-[800] text-ink uppercase">
                {clip.hook_text}
              </span>
              <span className="mt-2 h-[3px] w-10 rounded-full bg-pen" />
            </div>
            <div className="absolute inset-x-3 bottom-4 rounded-[12px] bg-cover/92 px-3 py-2.5 text-cover-ink">
              <p className="text-[13px] font-[750]">
                <span className="text-brass-bright">▶</span> Watch the <span className="text-brass-bright">full video</span>
              </p>
              <p className="truncate text-[11px] text-cover-ink-2">{result.title}</p>
            </div>
            {render.isPending && (
              <div className="absolute inset-0 grid place-items-center bg-ink/55 text-paper">
                <span className="flex items-center gap-2 text-[13px] font-[600]">
                  <Loader2 size={16} className="animate-spin" aria-hidden /> Cutting and rendering…
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
        <span className="tnum">
          {fmtTime(clip.start)}–{fmtTime(clip.end)} · {Math.round(clip.duration)}s
        </span>
        <span className="font-[560] text-ink-2">Short {index + 1}</span>
      </div>
      <h3 className="mt-1 text-[15px] leading-snug font-[640]">{clip.title}</h3>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{clip.why}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {result.can_render && !videoUrl && (
          <button
            onClick={() => render.mutate()}
            disabled={render.isPending}
            className="inline-flex items-center gap-1.5 rounded-[7px] bg-ink px-3 py-1.5 text-[13px] font-[620] text-paper hover:bg-primary-hover disabled:opacity-50"
          >
            <Scissors size={14} aria-hidden /> Render Short
          </button>
        )}
        {videoUrl && (
          <a
            href={videoUrl}
            download={render.data?.file}
            className="inline-flex items-center gap-1.5 rounded-[7px] bg-ink px-3 py-1.5 text-[13px] font-[620] text-paper hover:bg-primary-hover"
          >
            <Download size={14} aria-hidden /> Download MP4
          </a>
        )}
        <button
          onClick={() => {
            navigator.clipboard?.writeText(`${clip.title}\n\n${clip.description}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="inline-flex items-center gap-1.5 rounded-[7px] border border-rule-strong px-3 py-1.5 text-[13px] font-[580] hover:border-ink/40"
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copied" : "Copy title + description"}
        </button>
      </div>
      {render.error && <p className="mt-2 text-[12.5px] text-pen-text">{(render.error as Error).message}</p>}
    </motion.li>
  );
}

function ShortsFinder() {
  const params = useSearchParams();
  const { data: list } = useQuery({ queryKey: ["analyses"], queryFn: api.list });
  const [id, setId] = useState(params.get("a") ?? "");
  useEffect(() => {
    if (!id && list?.length) setId((list.find((x) => x.input_mode === "url") ?? list[0]).id);
  }, [list, id]);

  const qc = useQueryClient();
  const find = useMutation({
    mutationFn: (analysisId?: string) => post<ShortsResult>("/api/shorts", { analysis_id: analysisId ?? id, n: 4 }),
  });

  // Paste a YouTube link: analyze it (same pipeline as New → Published video), then find Shorts.
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<"tech" | "education" | "vlog">("vlog");
  const [stage, setStage] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const urlOk = /(youtu\.be\/|youtube\.com\/(watch\?v=|shorts\/|live\/|embed\/))[A-Za-z0-9_-]{11}/.test(url);
  async function fromLink() {
    setLinkError(null);
    find.reset();
    setStage("Opening the video on YouTube");
    try {
      const job = await api.analyze({ title: "", category, source_url: url.trim(), engine: "auto" });
      api.events(
        job.job_id,
        (ev) => setStage(ev.message),
        async (err) => {
          if (err) {
            setStage(null);
            setLinkError(err);
            return;
          }
          setStage("Finding the best moments");
          await qc.invalidateQueries({ queryKey: ["analyses"] });
          setId(job.analysis_id);
          find.mutate(job.analysis_id, { onSettled: () => setStage(null) });
        },
      );
    } catch (e) {
      setStage(null);
      setLinkError((e as Error).message);
    }
  }
  const r = find.data;
  const dur = r ? Math.max(...r.clips.map((c) => c.end), 1) : 1;
  const selected = list?.find((x) => x.id === id);

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-rule px-8 pt-7 pb-5">
        <h1 className="text-[26px] leading-tight font-[650] wdth-wide">Shorts Finder</h1>
        <p className="mt-1 max-w-[80ch] text-[14px] text-ink-2">
          Turn one long video into 3–4 Shorts or Reels. Retent AI picks the stretches viewers replay most (YouTube’s own
          “Most replayed” curve when the video has one), writes the title and on-screen hook, renders a vertical cut, and ends
          every Short with a “Watch the full video” card that sends viewers back to the long video.
        </p>
      </header>

      <div className="px-8 py-6">
        <div className="max-w-[980px] rounded-[8px] border border-rule bg-paper-raised p-4">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-[13.5px] font-[620]">
              <Link2 size={15} aria-hidden /> Paste a YouTube link
            </span>
            <div className="flex flex-wrap gap-3">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && urlOk && !stage && fromLink()}
                placeholder="https://www.youtube.com/watch?v=…"
                className="min-w-[320px] flex-1 rounded-[7px] border border-rule-strong bg-paper px-3 py-2 text-[14.5px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-ink focus:shadow-[0_0_0_3px_var(--rev-blue-paper)]"
              />
              <div role="radiogroup" aria-label="Category" className="inline-flex rounded-[7px] border border-rule-strong bg-paper p-0.5">
                {(["tech", "education", "vlog"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={category === c}
                    onClick={() => setCategory(c)}
                    className={clsx("rounded-[5px] px-3 py-1.5 text-[13px] font-[560] capitalize transition-colors",
                      category === c ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-sunk")}
                  >
                    {c === "tech" ? "Tech review" : c}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={fromLink}
                disabled={!urlOk || !!stage}
                className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-5 py-2 text-[14.5px] font-[620] text-paper hover:bg-primary-hover disabled:opacity-40"
              >
                {stage ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Film size={16} aria-hidden />}
                Make Shorts
              </button>
            </div>
          </label>
          {stage && <p className="mt-2 text-[13px] text-ink-2" aria-live="polite">{stage}…</p>}
          {linkError && <p className="mt-2 text-[13px] text-pen-text">{linkError}</p>}
          {!stage && !linkError && (
            <p className="mt-2 text-[12.5px] text-ink-3">About 30–60 seconds: fetch, transcribe, predict, then pick the Shorts.</p>
          )}
        </div>

        <p className="mt-5 mb-2 text-[12.5px] font-[600] text-ink-3">Or pick a video you’ve already analyzed</p>
        <div className="flex max-w-[980px] flex-wrap items-end gap-3">
          <label className="min-w-[320px] flex-1">
            <span className="mb-1.5 block text-[13.5px] font-[600]">Video</span>
            <select
              value={id}
              onChange={(e) => {
                setId(e.target.value);
                find.reset();
              }}
              className="w-full rounded-[7px] border border-rule-strong bg-paper-raised px-3 py-2 text-[14px] outline-none focus:border-ink"
            >
              {list?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.input_mode === "url" ? "▶ " : ""}
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => find.mutate(undefined)}
            disabled={!id || find.isPending}
            className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-5 py-2.5 text-[14.5px] font-[620] text-paper hover:bg-primary-hover disabled:opacity-40"
          >
            {find.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Film size={16} aria-hidden />}
            {find.isPending ? "Finding the best moments…" : "Find Shorts"}
          </button>
        </div>
        {selected && selected.input_mode !== "url" && (
          <p className="mt-2 text-[12.5px] text-ink-3">
            This is a script, so Retent AI suggests which moments to film as Shorts. Analyze a published YouTube video to render them.
          </p>
        )}
        {find.error && <p className="mt-3 text-[13.5px] text-pen-text">{(find.error as Error).message}</p>}

        {r && (
          <section className="mt-7" aria-label="Suggested Shorts">
            <div className="max-w-[980px]">
              <p className="text-[13px] text-ink-2">
                {r.source === "most_replayed"
                  ? "Picked from YouTube’s real “Most replayed” curve for this video."
                  : "Picked from Retent AI’s predicted interest (no “Most replayed” curve for this video)."}{" "}
                Clips skip the opening, asks, sponsor reads and wrap-ups, and start and end on full sentences.
              </p>
              {/* Where each Short sits in the full video */}
              <div className="relative mt-3 h-8 rounded-[5px] bg-paper-sunk" aria-hidden>
                {r.clips.map((c, i) => (
                  <span
                    key={c.id}
                    className="absolute top-1 bottom-1 grid place-items-center rounded-[3px] text-[11px] font-[650] text-paper"
                    style={{ left: `${(c.start / dur) * 100}%`, width: `${Math.max(2.5, ((c.end - c.start) / dur) * 100)}%`, background: "var(--rev-blue)" }}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
            </div>

            <ol className="mt-6 flex gap-6 overflow-x-auto pb-4">
              {r.clips.map((c, i) => (
                <ShortCard key={c.id} clip={c} result={r} index={i} />
              ))}
            </ol>

            {r.can_render && (
              <div className="mt-4 max-w-[86ch] rounded-[8px] border border-rule bg-paper-raised p-4 text-[13.5px] text-ink-2">
                <p className="font-[620] text-ink">Make “Watch the full video” clickable on YouTube</p>
                <p className="mt-1">
                  After uploading a Short, open it in YouTube Studio → Details → <strong className="font-[620] text-ink">Related video</strong>,
                  and choose the full video. YouTube then shows a tappable link on the Short that opens it. The description already
                  contains the link for Instagram Reels and other platforms.
                </p>
              </div>
            )}
            <p className="mt-3 text-[12px] text-ink-3">
              {r.provenance ? `Titles and hooks written by ${r.provenance.provider === "claude" ? "Claude" : "Groq"} (${r.provenance.model}).` : "Titles and hooks from the rules engine (no language model available right now)."}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

export default function ShortsPage() {
  return (
    <Suspense fallback={null}>
      <ShortsFinder />
    </Suspense>
  );
}
