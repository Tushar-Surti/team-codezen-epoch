"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, Film, Link2, Scissors } from "lucide-react";
import { motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Field, Input, Panel, Segmented, Select, Spinner, buttonClass } from "@/components/ui";
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
type Category = "tech" | "education" | "vlog";

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

/** The phone preview mirrors the rendered video, so its colours match shorts_render.py, not the app theme. */
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
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: EASE }}
      className="flex w-[280px] shrink-0 flex-col"
    >
      <div className="relative aspect-[9/16] overflow-hidden rounded-[24px] border-[6px] border-[#111214] bg-[#111214] shadow-overlay">
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
              <span className="rounded-[8px] bg-[#f7f8f5]/95 px-3 py-1.5 text-center [font-family:Arial,sans-serif] text-[16px] leading-tight font-[800] text-[#17171a] uppercase">
                {clip.hook_text}
              </span>
              <span className="mt-2 h-[3px] w-10 rounded-full bg-[#d7261e]" />
            </div>
            <div className="absolute inset-x-3 bottom-4 rounded-[12px] bg-[#1b2440]/95 px-3 py-2.5 text-[#eef0f6]">
              <p className="text-[13px] font-[700]">
                <span className="text-[#d7b25a]">▶</span> Watch the <span className="text-[#d7b25a]">full video</span>
              </p>
              <p className="truncate text-[11px] text-[#aab3ca]">{result.title}</p>
            </div>
            {render.isPending && (
              <div className="absolute inset-0 grid place-items-center bg-black/55 text-white">
                <span className="flex items-center gap-2 text-[13px] font-[600]">
                  <Spinner /> Cutting and rendering…
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px] text-ink-3">
        <span className="tc">
          {fmtTime(clip.start)}–{fmtTime(clip.end)} · {Math.round(clip.duration)}s
        </span>
        <span className="font-[500] text-ink-2">Short {index + 1}</span>
      </div>
      <h3 className="mt-1 text-[14.5px] leading-snug font-[600]">{clip.title}</h3>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{clip.why}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {result.can_render && !videoUrl && (
          <Button size="sm" onClick={() => render.mutate()} loading={render.isPending}>
            {!render.isPending && <Scissors size={14} aria-hidden />} Render Short
          </Button>
        )}
        {videoUrl && (
          <a href={videoUrl} download={render.data?.file} className={buttonClass({ size: "sm" })}>
            <Download size={14} aria-hidden /> Download MP4
          </a>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            navigator.clipboard?.writeText(`${clip.title}\n\n${clip.description}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copied" : "Copy title + description"}
        </Button>
      </div>
      {render.error && (
        <p role="alert" className="mt-2 text-[12.5px] text-drop-text">
          {(render.error as Error).message}
        </p>
      )}
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
  const [category, setCategory] = useState<Category>("vlog");
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
      <PageHeader
        title="Shorts Finder"
        description="Turn one long video into 3–4 Shorts or Reels. Retent AI picks the stretches viewers replay most (YouTube’s own “Most replayed” curve when the video has one), writes the title and on-screen hook, renders a vertical cut, and ends every Short with a “Watch the full video” card."
      />

      <div className="flex flex-col gap-5 px-8 py-6 compact:px-6">
        <div className="grid max-w-[1080px] gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Panel className="flex flex-col gap-3" aria-labelledby="shorts-link">
            <h2 id="shorts-link" className="flex items-center gap-2 text-[13.5px] font-[600]">
              <Link2 size={15} aria-hidden /> From a YouTube link
            </h2>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && urlOk && !stage && fromLink()}
              placeholder="https://www.youtube.com/watch?v=…"
              inputMode="url"
              aria-label="YouTube link"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented<Category>
                label="Category"
                value={category}
                onChange={setCategory}
                options={[
                  { value: "tech", label: "Tech review" },
                  { value: "education", label: "Education" },
                  { value: "vlog", label: "Vlog" },
                ]}
              />
              <Button onClick={fromLink} disabled={!urlOk} loading={!!stage}>
                {!stage && <Film size={15} aria-hidden />} Make Shorts
              </Button>
            </div>
            <p className="min-h-[18px] text-[12.5px]" aria-live="polite">
              {stage ? (
                <span className="text-ink-2">{stage}…</span>
              ) : linkError ? (
                <span className="text-drop-text">{linkError}</span>
              ) : (
                <span className="text-ink-3">About 30–60 seconds: fetch, transcribe, predict, then pick the Shorts.</span>
              )}
            </p>
          </Panel>

          <Panel className="flex flex-col gap-3" aria-labelledby="shorts-existing">
            <h2 id="shorts-existing" className="text-[13.5px] font-[600]">
              From a video you’ve analyzed
            </h2>
            <Field label={<span className="sr-only">Video</span>}>
              <Select
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  find.reset();
                }}
              >
                {list?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.input_mode === "url" ? "▶ " : ""}
                    {a.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="secondary" onClick={() => find.mutate(undefined)} disabled={!id} loading={find.isPending && !stage}>
              {find.isPending && !stage ? "Finding the best moments…" : "Find Shorts"}
            </Button>
            {selected && selected.input_mode !== "url" && (
              <p className="text-[12px] text-ink-3">
                This is a script, so Retent AI suggests which moments to film as Shorts. Analyze a published video to render them.
              </p>
            )}
          </Panel>
        </div>
        {find.error && (
          <p role="alert" className="max-w-[1080px] rounded-control border border-drop/30 bg-drop-wash px-4 py-3 text-[13.5px] text-drop-text">
            {(find.error as Error).message}
          </p>
        )}

        {r && (
          <section className="flex flex-col gap-5" aria-label="Suggested Shorts">
            <Panel className="max-w-[1080px]">
              <p className="text-[13px] text-ink-2">
                {r.source === "most_replayed"
                  ? "Picked from YouTube’s real “Most replayed” curve for this video."
                  : "Picked from Retent AI’s predicted interest (no “Most replayed” curve for this video)."}{" "}
                Clips skip the opening, asks, sponsor reads and wrap-ups, and start and end on full sentences.
              </p>
              {/* Where each Short sits in the full video */}
              <div className="relative mt-3 h-7 rounded-control bg-surface-2" aria-hidden>
                {r.clips.map((c, i) => (
                  <span
                    key={c.id}
                    className="tc absolute top-1 bottom-1 grid place-items-center rounded-[3px] bg-rev-blue text-[11px] font-[600] text-primary-fg"
                    style={{ left: `${(c.start / dur) * 100}%`, width: `${Math.max(2.5, ((c.end - c.start) / dur) * 100)}%` }}
                  >
                    {i + 1}
                  </span>
                ))}
              </div>
            </Panel>

            <ol className="flex gap-6 overflow-x-auto pb-4">
              {r.clips.map((c, i) => (
                <ShortCard key={c.id} clip={c} result={r} index={i} />
              ))}
            </ol>

            {r.can_render && (
              <Panel className="max-w-[86ch] text-[13.5px] text-ink-2">
                <p className="font-[600] text-ink">Make “Watch the full video” clickable on YouTube</p>
                <p className="mt-1">
                  After uploading a Short, open it in YouTube Studio → Details →{" "}
                  <strong className="font-[600] text-ink">Related video</strong>, and choose the full video. YouTube then shows a
                  tappable link on the Short that opens it. The description already contains the link for Instagram Reels and other
                  platforms.
                </p>
              </Panel>
            )}
            <p className="text-[12px] text-ink-3">
              {r.provenance
                ? `Titles and hooks written by ${r.provenance.provider === "claude" ? "Claude" : "Groq"} (${r.provenance.model}).`
                : "Titles and hooks from the rules engine (no language model available right now)."}
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
