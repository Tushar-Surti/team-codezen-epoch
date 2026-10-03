"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowUpRight, Check, Database, Loader2, MonitorPlay as Youtube, ScanSearch } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { MomentChart, ShapeChart, VideoSpark } from "@/components/xray/charts";
import { api } from "@/lib/api";
import { CATEGORY_LABEL, fmtTime, signed } from "@/lib/format";
import { KIND_SHORT, type Pattern, type XRayReport, verdictColor, xrayApi } from "@/lib/xray";

const EASE = [0.16, 1, 0.3, 1] as const;

function compact(n: number | null | undefined): string {
  if (!n) return "";
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function fmtDate(d: string | null): string {
  if (!d || d.length !== 8) return "";
  return new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}

function habitValue(v: number | null, unit: string): string {
  if (v === null || v === undefined) return "—";
  if (unit === "s") return fmtTime(v);
  if (unit === "%") return `${Math.round(v)}%`;
  if (unit === "% in") return `${Math.round(v)}% in`;
  if (unit === "min") return `${v.toFixed(1)} min`;
  if (unit === "words/min") return `${Math.round(v)} wpm`;
  return String(v);
}

/** One dot per video that has this moment: filled when interest moved the same way as the pattern. */
function Consistency({ p }: { p: Pattern }) {
  const neg = p.effect_pts < 0;
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`${Math.round(p.consistency * p.videos)} of ${p.videos} videos`}>
      {p.per_video.map((v) => {
        const agrees = neg ? v.pts < 0 : v.pts > 0;
        return (
          <span
            key={v.id}
            title={`${signed(v.pts, 1)} pts`}
            className="h-[9px] w-[9px] rounded-full border-[1.5px]"
            style={{ borderColor: agrees ? verdictColor(p.verdict) : "var(--rule-strong)", background: agrees ? verdictColor(p.verdict) : "transparent" }}
          />
        );
      })}
    </span>
  );
}

function PatternCard({ p, index }: { p: Pattern; index: number }) {
  const badge =
    p.verdict === "hurts" ? { text: "Costs viewers", cls: "bg-pen-wash text-pen-text" }
    : p.verdict === "helps" ? { text: "Holds viewers", cls: "bg-rev-green-paper text-rev-green" }
    : { text: p.videos < 2 ? "Only in 1 video" : "No clear pattern", cls: "bg-paper-sunk text-ink-2" };
  const agree = Math.round(p.consistency * p.videos);
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: (index % 2) * 0.06, ease: EASE }}
      className={clsx("flex flex-col rounded-[8px] border bg-paper-raised p-4", p.verdict === "mixed" ? "border-rule" : "border-rule-strong")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-[640]">{p.label}</h3>
        <span className={clsx("rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-[620]", badge.cls)}>{badge.text}</span>
        {p.verdict !== "mixed" && (
          <span className="text-[11.5px] text-ink-3">{p.strength === "clear" ? "clear pattern" : "early sign"}</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-1">
        <p>
          <span className="tnum text-[28px] leading-none font-[650] wdth-wide" style={{ color: p.verdict === "mixed" ? "var(--ink)" : verdictColor(p.verdict) }}>
            {signed(p.effect_pts, 1)}
          </span>{" "}
          <span className="text-[12.5px] text-ink-3">pts</span>
        </p>
        <div className="pb-0.5 text-[12.5px] text-ink-2">
          <Consistency p={p} />
          <span className="ml-2 tnum">
            {p.verdict === "mixed" ? `in ${p.videos} of ${p.of_videos} videos` : `${agree} of ${p.videos} videos`}
          </span>
        </div>
        <p className="tnum pb-0.5 text-[12.5px] text-ink-3">
          Other channels: {p.typical_pts === null ? "—" : `${signed(p.typical_pts, 1)} pts`}
          {p.typical_videos > 0 && ` (${p.typical_videos} videos)`}
        </p>
      </div>
      <div className="mt-3">
        <MomentChart p={p} />
      </div>
      {p.examples[0] && (
        <p className="mt-2 line-clamp-2 font-script text-[12.5px] leading-snug text-ink-2">
          <span className="tnum mr-1.5 font-ui text-ink-3">{fmtTime(p.examples[0].start)}</span>“{p.examples[0].text}”
        </p>
      )}
    </motion.article>
  );
}

/** YouTube hands back the uncropped original (=s0, often 1MB+), which Google's image server can refuse to a
 * browser; ask for a small square instead, and fall back to the initial if it still won't load. */
function Avatar({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = url ? url.replace(/=s\d+[^/]*$/, "") + "=s176-c-k-c0x00ffffff-no-rj" : null;
  if (!src || failed) {
    return (
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-brass text-[22px] font-[700] text-brass-bright uppercase">
        {name.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-full border-2 border-brass bg-cover-2 object-cover"
    />
  );
}

function Report({ r }: { r: XRayReport }) {
  const verdictOf = Object.fromEntries(r.patterns.map((p) => [p.kind, p.verdict]));
  const colorOf = (k: keyof typeof KIND_SHORT) => verdictColor(verdictOf[k]);
  const withText = r.videos.filter((v) => v.has_transcript).length;
  const medianLen = [...r.videos].map((v) => v.duration).sort((a, b) => a - b)[Math.floor(r.videos.length / 2)] ?? 0;
  const dates = r.videos.map((v) => v.upload_date).filter(Boolean).sort() as string[];
  const shown = r.patterns.filter((p) => p.verdict !== "mixed");
  const quiet = r.patterns.filter((p) => p.verdict === "mixed");

  return (
    <div className="space-y-10">
      {/* Cover band */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="rounded-[10px] bg-cover px-6 py-5 text-cover-ink"
      >
        <div className="flex flex-wrap items-center gap-4">
          <Avatar url={r.channel.avatar} name={r.channel.channel} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] tracking-[0.08em] text-cover-ink-2 uppercase">Channel X-Ray</p>
            <h2 className="truncate text-[26px] leading-tight font-[680] wdth-wide">{r.channel.channel}</h2>
            <p className="text-[13px] text-cover-ink-2">
              {[r.channel.followers ? `${compact(r.channel.followers)} subscribers` : null, CATEGORY_LABEL[r.category] ?? r.category,
                dates.length ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <a
            href={r.channel.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[7px] border border-cover-3 px-3 py-1.5 text-[13px] font-[580] text-cover-ink hover:border-brass"
          >
            <Youtube size={15} aria-hidden /> Channel <ArrowUpRight size={13} aria-hidden />
          </a>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {[
            ["Videos measured", `${r.videos.length}`],
            ["With transcripts", `${withText}`],
            ["Typical length", fmtTime(medianLen)],
            ["Prediction vs real curve", r.model_fit === null ? "—" : `${signed(r.model_fit, 2)} shape match`],
          ].map(([k, v]) => (
            <div key={k} className="border-t border-cover-3 pt-2">
              <dt className="text-[12px] text-cover-ink-2">{k}</dt>
              <dd className="tnum text-[22px] font-[650] wdth-wide">
                {v.endsWith("shape match") ? <>{v.split(" ")[0]} <span className="text-[12px] font-[500] text-cover-ink-2">shape match</span></> : v}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-cover-ink-2">
          {r.source === "dataset" ? <Database size={13} aria-hidden /> : <Youtube size={13} aria-hidden />}
          {r.source === "dataset" ? "From Retent AI’s research dataset" : "Fetched live from YouTube"} · compared with{" "}
          {r.baseline_videos} videos from {r.baseline_channels} other channels
          {r.skipped.too_new ? ` · ${r.skipped.too_new} newest uploads skipped (no Most replayed curve yet)` : ""}
        </p>
      </motion.section>

      {/* Advice */}
      <section aria-labelledby="advice">
        <h2 id="advice" className="text-[19px] font-[650]">For the next video</h2>
        {r.advice.length === 0 ? (
          <p className="mt-2 max-w-[80ch] text-[14px] text-ink-2">
            No moment costs this channel viewers consistently across these videos. That’s a good sign. The curve shape below shows
            where attention still sags.
          </p>
        ) : (
          <ol className="mt-3 grid gap-3 lg:grid-cols-2">
            {r.advice.map((a, i) => (
              <motion.li
                key={a.kind + i}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.07, ease: EASE }}
                className={clsx("flex gap-3 rounded-[8px] border bg-paper-raised p-4", a.keep ? "border-rev-green/40" : "border-rule-strong")}
              >
                <span
                  className={clsx("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-[700]",
                    a.keep ? "bg-rev-green-paper text-rev-green" : "bg-pen-wash text-pen-text")}
                >
                  {a.keep ? <Check size={15} aria-hidden /> : i + 1}
                </span>
                <div>
                  <p className="text-[14.5px] leading-snug font-[560]">{a.text}</p>
                  <p className="mt-1 text-[12.5px] text-ink-3">{KIND_SHORT[a.kind]}: {a.evidence}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        )}
      </section>

      {/* Patterns */}
      <section aria-labelledby="moments">
        <h2 id="moments" className="text-[19px] font-[650]">What the audience does at each kind of moment</h2>
        <p className="mt-1 max-w-[88ch] text-[13.5px] text-ink-2">
          Every occurrence lined up at the moment it starts. The line is the change in YouTube’s Most replayed interest (points on its
          0–100 scale, against the typical shape at that point in a video). The shaded block is the 30 seconds the number is
          measured over. Dashed: the same moment on other channels.
        </p>
        {shown.length > 0 && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {shown.map((p, i) => <PatternCard key={p.kind} p={p} index={i} />)}
          </div>
        )}
        {quiet.length > 0 && (
          <details className="mt-4 group" open={shown.length === 0}>
            <summary className="cursor-pointer text-[13.5px] font-[600] text-ink-2 hover:text-ink">
              {quiet.length} more {quiet.length === 1 ? "kind" : "kinds"} of moments without a consistent effect
            </summary>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {quiet.map((p, i) => <PatternCard key={p.kind} p={p} index={i} />)}
            </div>
          </details>
        )}
      </section>

      {/* Shape */}
      <section aria-labelledby="shape" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <h2 id="shape" className="text-[19px] font-[650]">Where this channel’s videos sag</h2>
          <p className="mt-1 max-w-[80ch] text-[13.5px] text-ink-2">
            Average Most replayed shape across these videos (violet, with the middle half of videos shaded) against{" "}
            {r.baseline_videos} videos from other channels (dashed). Time is a share of each video, so different lengths line up.
          </p>
          <div className="mt-3 rounded-[8px] border border-rule bg-paper-raised p-3">
            <ShapeChart shape={r.shape} />
          </div>
        </div>
        <div className="space-y-2 self-end">
          {r.shape.zones.length === 0 && <p className="text-[13.5px] text-ink-2">No stretch sits clearly above or below other channels.</p>}
          {r.shape.zones.map((z) => (
            <div key={`${z.from_pct}${z.direction}`} className="border-t border-rule-strong pt-2">
              <p className="text-[14px] font-[620]" style={{ color: z.direction === "below" ? "var(--pen-text)" : "var(--rev-green)" }}>
                {z.direction === "below" ? "Sags" : "Holds better"} from {z.from_pct}% to {z.to_pct}%
              </p>
              <p className="text-[13px] text-ink-2">
                {z.size.toFixed(2)} SD {z.direction} other channels
                {z.common_moment ? `. Most common moment here: ${KIND_SHORT[z.common_moment].toLowerCase()}.` : "."}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Habits */}
      <section aria-labelledby="habits">
        <h2 id="habits" className="text-[19px] font-[650]">Habits, measured from the transcripts</h2>
        <div className="mt-3 overflow-x-auto rounded-[8px] border border-rule bg-paper-raised">
          <table className="w-full min-w-[520px] text-[13.5px]">
            <thead>
              <tr className="border-b border-rule text-left text-[12px] text-ink-3">
                <th className="px-4 py-2 font-[560]">Habit</th>
                <th className="px-4 py-2 text-right font-[560]">{r.channel.channel}</th>
                <th className="px-4 py-2 text-right font-[560]">Other channels</th>
              </tr>
            </thead>
            <tbody>
              {r.habits.map((h) => (
                <tr key={h.key} className="border-b border-rule last:border-0">
                  <td className="px-4 py-2 text-ink-2">{h.label}</td>
                  <td className="tnum px-4 py-2 text-right font-[620]">{habitValue(h.channel, h.unit)}</td>
                  <td className="tnum px-4 py-2 text-right text-ink-2">{habitValue(h.typical, h.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Videos */}
      <section aria-labelledby="videos">
        <h2 id="videos" className="text-[19px] font-[650]">The videos</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">
          Each video’s real Most replayed curve, with its moments marked underneath (red: a kind that costs this channel viewers,
          green: one that holds them). Hover a mark to read the line.
        </p>
        <ul className="mt-3 divide-y divide-rule rounded-[8px] border border-rule bg-paper-raised">
          {r.videos.map((v) => (
            <li key={v.id} className="grid items-center gap-4 px-4 py-3 md:grid-cols-[120px_minmax(0,1.1fr)_minmax(0,1fr)_auto]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" className="hidden aspect-video w-[120px] rounded-[4px] object-cover md:block" />
              <div className="min-w-0">
                <p className="line-clamp-2 text-[14px] leading-snug font-[600]">{v.title}</p>
                <p className="tnum mt-0.5 text-[12px] text-ink-3">
                  {[fmtDate(v.upload_date), v.views ? `${compact(v.views)} views` : null, fmtTime(v.duration),
                    v.has_transcript ? null : "curve only"].filter(Boolean).join(" · ")}
                </p>
              </div>
              <VideoSpark heat={v.heat} moments={v.moments} duration={v.duration} colorOf={colorOf} />
              <div className="flex items-center gap-3 text-[12.5px]">
                {v.fit !== null && (
                  <span className="tnum text-ink-3" title="How well Retent AI's prediction matched this video's real curve (Spearman)">
                    model {signed(v.fit, 2)}
                  </span>
                )}
                {v.analysis_id && (
                  <Link href={`/a/${v.analysis_id}`} className="inline-flex items-center gap-1 font-[600] text-ink hover:text-pen-text">
                    Open <ArrowUpRight size={13} aria-hidden />
                  </Link>
                )}
                <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer" className="text-ink-3 hover:text-ink" aria-label="Watch on YouTube">
                  <Youtube size={16} aria-hidden />
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="method" className="max-w-[92ch] border-t border-rule pt-5 text-[13px] text-ink-2">
        <h2 id="method" className="text-[14px] font-[640] text-ink">How to read this</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            The real curve is YouTube’s public “Most replayed” graph: relative interest within each video, not the absolute retention
            percentage Studio shows. Effects are changes on its 0–100 scale after removing the shape every video shares.
          </li>
          <li>
            “Clear pattern” means the 90% interval across this channel’s videos excludes zero; “early sign” means the direction is
            consistent but there are too few videos to be sure. These are associations, not proof that the moment caused the drop.
          </li>
          <li>
            Moments are found from the transcript with the same detectors as the main analysis (no language model), so every
            number here can be reproduced.
          </li>
        </ul>
      </section>
    </div>
  );
}

function XRayPage() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const reportId = params.get("r");
  const { data: channels } = useQuery({ queryKey: ["xray-channels"], queryFn: xrayApi.channels });
  const { data: reports } = useQuery({ queryKey: ["xray-reports"], queryFn: xrayApi.reports });
  const report = useQuery({ queryKey: ["xray", reportId], queryFn: () => xrayApi.get(reportId as string), enabled: !!reportId });

  const [input, setInput] = useState("");
  const [category, setCategory] = useState<"tech" | "education" | "vlog">("tech");
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(channel: string, opts: { category?: string } = {}) {
    setError(null);
    setLog(["Finding the channel"]);
    setRunning(true);
    try {
      const job = await xrayApi.start({ channel, ...opts });
      api.events(
        job.job_id,
        (ev) => setLog((l) => (l[l.length - 1] === ev.message ? l : [...l, ev.message])),
        async (err) => {
          setRunning(false);
          if (err) {
            setError(err);
            return;
          }
          await qc.invalidateQueries({ queryKey: ["xray-reports"] });
          router.replace(`/xray?r=${job.analysis_id}`, { scroll: false });
        },
      );
    } catch (e) {
      setRunning(false);
      setError((e as Error).message);
    }
  }

  const canRun = input.trim().length > 1 && !running;

  return (
    <div className="h-full overflow-y-auto">
      <header className="border-b border-rule px-5 pt-7 pb-5 md:px-8">
        <h1 className="flex items-center gap-2 text-[26px] leading-tight font-[650] wdth-wide">
          <ScanSearch size={24} strokeWidth={1.8} aria-hidden /> Channel X-Ray
        </h1>
        <p className="mt-1 max-w-[84ch] text-[14px] text-ink-2">
          One video’s drop can be bad luck. The same drop in eight videos is a habit. X-Ray reads a channel’s recent long videos,
          finds every sponsor read, subscribe ask, intro, tease and slow stretch, and checks what YouTube’s real audience curve did at
          each one, compared with other channels.
        </p>
      </header>

      <div className="space-y-8 px-5 py-6 md:px-8">
        <section aria-label="Choose a channel" className="max-w-[1080px] rounded-[8px] border border-rule bg-paper-raised p-4">
          <label className="block">
            <span className="mb-1.5 block text-[13.5px] font-[620]">Channel link, @handle, or any video from the channel</span>
            <div className="flex flex-wrap gap-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canRun && start(input.trim(), { category })}
                placeholder="@mkbhd  or  https://www.youtube.com/@channel"
                className="min-w-0 flex-1 basis-[280px] rounded-[7px] border border-rule-strong bg-paper px-3 py-2 text-[14.5px] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-ink focus:shadow-[0_0_0_3px_var(--rev-blue-paper)]"
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
                onClick={() => start(input.trim(), { category })}
                disabled={!canRun}
                className="inline-flex items-center gap-2 rounded-[8px] bg-ink px-5 py-2 text-[14.5px] font-[620] text-paper hover:bg-primary-hover disabled:opacity-40"
              >
                {running ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ScanSearch size={16} aria-hidden />}
                X-Ray channel
              </button>
            </div>
            <span className="mt-1.5 block text-[12px] text-ink-3">
              Takes 1–3 minutes live: YouTube shows the Most replayed curve only on videos a few weeks old, and transcripts may need
              Whisper. Channels below are already in the dataset and open instantly.
            </span>
          </label>

          {channels && channels.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-[600] text-ink-2">
                <Database size={13} aria-hidden /> In the research dataset
              </p>
              <div className="flex flex-wrap gap-2">
                {channels.slice(0, 10).map((c) => (
                  <button
                    key={c.channel_id}
                    type="button"
                    disabled={running}
                    onClick={() => start(c.channel_id)}
                    className="rounded-full border border-rule-strong bg-paper px-3 py-1 text-[13px] font-[560] hover:border-ink/50 disabled:opacity-40"
                  >
                    {c.channel} <span className="tnum text-ink-3">· {c.transcripts}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {reports && reports.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[12.5px] font-[600] text-ink-2">Recent X-Rays</p>
              <div className="flex flex-wrap gap-2">
                {reports.slice(0, 8).map((x) => (
                  <Link
                    key={x.id}
                    href={`/xray?r=${x.id}`}
                    scroll={false}
                    className={clsx("rounded-full border px-3 py-1 text-[13px] font-[560]",
                      x.id === reportId ? "border-ink bg-ink text-paper" : "border-rule-strong hover:border-ink/50")}
                  >
                    {x.channel}
                    {x.hurts > 0 && <span className={clsx("ml-1.5 tnum", x.id === reportId ? "text-paper/70" : "text-pen-text")}>{x.hurts} costly</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {(running || error) && (
          <section aria-live="polite" className="max-w-[1080px] rounded-[8px] border border-rule bg-paper-raised p-4">
            <ol className="space-y-1 text-[13.5px]">
              {log.slice(-7).map((m, i, arr) => (
                <li key={`${m}${i}`} className={clsx("flex items-center gap-2", i === arr.length - 1 && running ? "font-[600] text-ink" : "text-ink-3")}>
                  {i === arr.length - 1 && running ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
                  {m}
                </li>
              ))}
            </ol>
            {error && <p className="mt-2 text-[13.5px] text-pen-text">{error}</p>}
          </section>
        )}

        {report.data && !running && <Report r={report.data} />}
        {report.isLoading && <p className="text-[13.5px] text-ink-3">Loading the X-Ray…</p>}
        {!reportId && !running && (
          <div className="grid min-h-[220px] max-w-[1080px] place-items-center rounded-[8px] border border-dashed border-rule-strong p-8 text-center">
            <div className="max-w-md">
              <p className="text-[16px] font-[620]">Pick a channel to see its habits</p>
              <p className="mt-1 text-[13.5px] text-ink-2">
                Try one from the dataset for an instant result, or paste any channel with a few 5–25 minute videos.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <XRayPage />
    </Suspense>
  );
}
