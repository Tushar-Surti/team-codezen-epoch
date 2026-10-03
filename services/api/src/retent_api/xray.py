"""Channel X-Ray jobs.

Gathers a channel's recent long-form videos (from the local research dataset when we already have them,
from YouTube otherwise), measures each one against YouTube's public "Most replayed" curve and aggregates
the channel report (retent_core.xray). Every transcribed video is also saved as a full analysis so the
report can open it in the workspace. Reports live in data/xray/reports.

Warm the cross-channel baseline once (so the first X-Ray is instant):
    uv run --package retent-api python -m retent_api.xray warm
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from retent_core.contract import InputMode, Stage, VideoMeta
from retent_core.pipeline import analyze_sentences, sentences_from_captions
from retent_core.text import detect_language
from retent_core.xray import aggregate, measure
from retent_api.store import ROOT, Store

XRAY = ROOT / "data" / "xray"
REPORTS = XRAY / "reports"
MEASURED = XRAY / "videos"
FETCHED = XRAY / "raw"  # videos fetched live from YouTube, same shape as dataset records (re-runs need no network)
ANALYSES = XRAY / "analyses"
D1 = ROOT / "data" / "raw" / "d1"
MEASURE_VERSION = 2  # bump when retent_core.xray.measure changes
MIN_S, MAX_S = 180, 25 * 60
SCAN = 80  # uploads listed per live X-Ray
CURVE_AGE_DAYS = 35  # YouTube shows "Most replayed" only once a video is a few weeks old
CHANNEL_ID_RE = re.compile(r"UC[A-Za-z0-9_-]{22}")

for d in (REPORTS, MEASURED, ANALYSES, FETCHED):
    d.mkdir(parents=True, exist_ok=True)
analyses = Store(data_dir=ANALYSES, fixtures_dir=ANALYSES / "_none")

_d1_cache: dict[Path, tuple[float, dict]] = {}


def _d1() -> list[dict]:
    """Every collected record that has a Most replayed curve (re-read only when a file changes)."""
    out = []
    for f in D1.glob("*.json"):
        mtime = f.stat().st_mtime
        hit = _d1_cache.get(f)
        if not hit or hit[0] != mtime:
            try:
                rec = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            _d1_cache[f] = hit = (mtime, rec)
        rec = hit[1]
        if len(rec.get("heatmap") or []) >= 50 and rec.get("channel_id"):
            out.append(rec)
    return out


def _segments(rec: dict) -> list[dict] | None:
    cap = rec.get("caption") or {}
    segs = cap.get("segments") or []
    return segs if cap.get("status") == "ok" and len(segs) >= 20 else None


def local_channels(min_transcripts: int = 3) -> list[dict]:
    by: dict[str, dict] = {}
    for r in _d1():
        c = by.setdefault(r["channel_id"], {"channel_id": r["channel_id"], "channel": r.get("channel") or "",
                                            "category": r.get("category"), "videos": 0, "transcripts": 0})
        c["videos"] += 1
        c["transcripts"] += bool(_segments(r))
    rows = [c for c in by.values() if c["transcripts"] >= min_transcripts]
    return sorted(rows, key=lambda c: (-c["transcripts"], -c["videos"]))


def _measure_cached(vid: str, title: str, duration: float, heat: list[dict], segs: list[dict] | None,
                    category: str, chapters: list[dict] | None) -> dict:
    """measure() keyed by video id; transcribed results are cached on disk (they never change)."""
    path = MEASURED / f"{vid}.json"
    if path.exists():
        cached = json.loads(path.read_text(encoding="utf-8"))
        if cached.get("v") == MEASURE_VERSION and cached["has_transcript"] == bool(segs):
            return cached
    sents = sentences_from_captions(segs) if segs else None
    if sents is not None and len(sents) < 10:
        sents = None
    m = measure(sents, title, duration, heat, category, chapters)
    m["v"] = MEASURE_VERSION
    path.write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
    return m


def baseline(exclude_channel_id: str | None) -> list[dict]:
    """Every transcribed video in the dataset from other channels: the "typical" comparison."""
    out = []
    for r in _d1():
        if r["channel_id"] == exclude_channel_id or not (segs := _segments(r)):
            continue
        m = _measure_cached(r["id"], r.get("title") or "", float(r["duration"]), r["heatmap"], segs,
                            r.get("category") or "tech", r.get("chapters"))
        out.append({**m, "id": r["id"], "channel_id": r["channel_id"]})
    return out


# ---------------------------------------------------------------------------------------------
# YouTube


class XRayError(RuntimeError):
    pass


def channel_url(text: str) -> str:
    """@handle, channel URL, channel id, or any video link from the channel."""
    t = text.strip()
    if not t:
        raise XRayError("Paste a channel link or @handle.")
    if m := CHANNEL_ID_RE.fullmatch(t):
        return f"https://www.youtube.com/channel/{m.group(0)}"
    if t.startswith("@"):
        return f"https://www.youtube.com/{t.split('/')[0]}"
    if "youtube.com/" in t or "youtu.be/" in t:
        if not t.startswith("http"):
            t = "https://" + t
        if m := re.search(r"youtube\.com/(@[^/?#]+|channel/UC[A-Za-z0-9_-]{22}|c/[^/?#]+|user/[^/?#]+)", t):
            return f"https://www.youtube.com/{m.group(1)}"
        from retent_api import youtube

        info = youtube.fetch_info(youtube.video_id(t))  # a video link: X-Ray the channel that posted it
        if info.get("channel_id"):
            return f"https://www.youtube.com/channel/{info['channel_id']}"
    if re.fullmatch(r"[A-Za-z0-9_.-]{3,30}", t):
        return f"https://www.youtube.com/@{t}"
    raise XRayError("That doesn't look like a YouTube channel. Paste a link like https://www.youtube.com/@mkbhd.")


def list_uploads(url: str) -> tuple[dict, list[dict]]:
    from retent_ml.collect import _ydl

    try:
        with _ydl(extract_flat="in_playlist", playlistend=SCAN) as ydl:
            res = ydl.extract_info(url.rstrip("/") + "/videos", download=False)
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "bot" in msg.lower() or "confirm you" in msg.lower():
            raise XRayError("YouTube is asking this connection to confirm it isn't a bot. Try a channel from "
                            "the dataset list, or again in a few minutes.") from exc
        raise XRayError(f"Couldn't open that channel: {msg[:160]}") from exc
    avatar = next((t.get("url") for t in res.get("thumbnails") or [] if t.get("id") == "avatar_uncropped"), None)
    meta = {"channel": res.get("channel") or res.get("uploader") or res.get("title") or "",
            "channel_id": res.get("channel_id") or res.get("id"), "url": url, "avatar": avatar,
            "followers": res.get("channel_follower_count")}
    return meta, [e for e in res.get("entries") or [] if e and e.get("id")]


# ---------------------------------------------------------------------------------------------
# The job


def _analysis(vid: str, title: str, duration: float, segs: list[dict], category: str, channel: str,
              chapters: list[dict] | None, heat: list[dict]) -> str:
    """Full analysis for one video, saved where the workspace can open it (with its real curve)."""
    aid = f"x{vid}"
    if analyses.get_raw(aid):
        return aid
    sents = sentences_from_captions(segs)
    text = " ".join(s.text for s in sents[:80])
    meta = VideoMeta(title=title, category=category, language=detect_language(text), input_mode=InputMode.url,
                     duration_seconds=duration, source_url=f"https://www.youtube.com/watch?v={vid}", channel=channel)
    a = analyze_sentences(sents, meta, analysis_id=aid, timing="measured", chapters=chapters or None)
    analyses.put(a, extra={"_heatmap": heat})
    return aid


async def run(job, body: dict, report_id: str) -> None:
    from retent_api import youtube

    try:
        text = str(body.get("channel") or "").strip()
        limit = max(4, min(int(body.get("limit") or 10), 15))
        whisper_left = max(0, min(int(body.get("whisper") if body.get("whisper") is not None else 4), 6))
        live = bool(body.get("live"))
        await job.emit(Stage.ingest, "start", "Finding the channel")
        records_live = {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in FETCHED.glob("*.json")}

        local = {c["channel_id"]: c for c in local_channels(min_transcripts=1)}
        m = CHANNEL_ID_RE.fullmatch(text)
        records = {r["id"]: r for r in _d1()}
        meta: dict
        entries: list[dict]
        if m and m.group(0) in local and not live:
            cid = m.group(0)
            mine = sorted((r for r in records.values() if r["channel_id"] == cid),
                          key=lambda r: r.get("upload_date") or "", reverse=True)
            meta = {"channel": local[cid]["channel"], "channel_id": cid,
                    "url": f"https://www.youtube.com/channel/{cid}", "avatar": None, "followers": mine[0].get("channel_followers")}
            # Transcribed videos first: they carry the moment-level patterns.
            mine.sort(key=lambda r: not _segments(r))
            entries = [{"id": r["id"], "title": r.get("title"), "duration": r.get("duration")} for r in mine]
            source = "dataset"
            await job.emit(Stage.ingest, "done", f"{meta['channel']} · {len(entries)} videos already in the research "
                           "dataset, no YouTube calls needed", 0.1)
        else:
            url = await asyncio.to_thread(channel_url, text)
            meta, entries = await asyncio.to_thread(list_uploads, url)
            source = "youtube"
            await job.emit(Stage.ingest, "done", f"{meta['channel']} · looking at the last {len(entries)} uploads", 0.1)

        category = body.get("category") or (local.get(meta["channel_id"], {}).get("category")) or "tech"
        videos: list[dict] = []
        skipped = {"length": 0, "too_new": 0, "no_curve": 0, "unavailable": 0}
        recent = (datetime.now(UTC) - timedelta(days=CURVE_AGE_DAYS)).strftime("%Y%m%d")
        i, jump = 0, 1
        while i < len(entries) and len(videos) < limit:
            e = entries[i]
            i += 1
            dur = e.get("duration")
            if dur and not MIN_S <= dur <= MAX_S:
                skipped["length"] += 1
                continue
            vid = e["id"]
            progress = 0.12 + 0.6 * len(videos) / limit
            rec = records.get(vid) or records_live.get(vid)
            if rec:
                title, duration, heat = rec.get("title") or "", float(rec["duration"]), rec["heatmap"]
                segs, chapters = _segments(rec), rec.get("chapters")
                upload, views, tsource = rec.get("upload_date"), rec.get("views"), (rec.get("caption") or {}).get("kind")
            else:
                await job.emit(Stage.transcribe, "progress", f"Opening “{(e.get('title') or vid)[:60]}”", progress)
                try:
                    info = await asyncio.to_thread(youtube.fetch_info, vid)
                except youtube.YouTubeError:
                    skipped["unavailable"] += 1
                    continue
                heat = info.get("heatmap") or []
                if len(heat) < 50:
                    if (info.get("upload_date") or "0") >= recent:
                        # Too new for a curve: skip ahead through the uploads in growing jumps.
                        skipped["too_new"] += 1
                        i += jump - 1
                        jump = min(jump * 2, 16)
                        await job.emit(Stage.transcribe, "progress", "Newest uploads don't have a Most replayed curve "
                                       "yet, skipping to older ones", progress)
                    else:
                        skipped["no_curve"] += 1  # not enough views for YouTube to show one
                    continue
                jump = 1
                title, duration = info.get("title") or "", float(info["duration"])
                chapters, upload, views = info.get("chapters"), info.get("upload_date"), info.get("view_count")
                segs, tsource = None, None
                try:
                    allow = whisper_left > 0
                    segs, tsource, _ = await asyncio.to_thread(youtube.transcript, info, None, allow)
                    whisper_left -= tsource == "asr"
                except youtube.YouTubeError:
                    pass  # curve only: it still counts towards the channel's shape
                (FETCHED / f"{vid}.json").write_text(json.dumps({
                    "id": vid, "title": title, "duration": duration, "heatmap": heat, "chapters": chapters,
                    "upload_date": upload, "views": views, "channel": meta["channel"], "channel_id": meta["channel_id"],
                    "caption": {"status": "ok" if segs else "none", "kind": tsource, "segments": segs or []},
                }, ensure_ascii=False), encoding="utf-8")
                await asyncio.sleep(0.4)  # be gentle with YouTube between videos
            label = "transcript" if segs else "curve only"
            await job.emit(Stage.transcribe, "progress", f"{len(videos) + 1}/{limit} · {title[:60]} · {label}", progress)
            m_ = await asyncio.to_thread(_measure_cached, vid, title, duration, heat, segs, category, chapters)
            aid = None
            if segs:
                aid = await asyncio.to_thread(_analysis, vid, title, duration, segs, category, meta["channel"], chapters, heat)
            videos.append({**m_, "id": vid, "title": title, "upload_date": upload, "views": views,
                           "analysis_id": aid, "transcript": tsource, "channel_id": meta["channel_id"]})

        with_text = sum(v["has_transcript"] for v in videos)
        if len(videos) < 3:
            raise XRayError("Not enough videos with YouTube's Most replayed curve on this channel (it needs 3+ long "
                            "videos with enough views). Try a bigger channel.")
        if with_text < 2:
            raise XRayError("Couldn't get transcripts for enough of this channel's videos (YouTube is blocking "
                            "captions here). Try again later or pick a channel from the dataset list.")
        await job.emit(Stage.transcribe, "done", f"{len(videos)} videos with real curves, {with_text} with transcripts", 0.75)

        await job.emit(Stage.explain, "start", "Lining up every moment against the real curves", 0.8)
        others = await asyncio.to_thread(baseline, meta["channel_id"])
        body_ = await asyncio.to_thread(aggregate, videos, others)
        report = {
            "id": report_id, "created_at": datetime.now(UTC).isoformat(), "source": source,
            "channel": meta, "category": category, "skipped": skipped,
            "videos": [{k: v.get(k) for k in ("id", "title", "upload_date", "views", "duration", "heat", "moments",
                                              "fit", "analysis_id", "transcript", "has_transcript")} for v in videos],
            **body_,
        }
        (REPORTS / f"{report_id}.json").write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
        hurts = sum(p["verdict"] == "hurts" for p in report["patterns"])
        await job.emit(Stage.explain, "done", f"{len(report['patterns'])} kinds of moments measured, {hurts} costing "
                       "this channel viewers", 0.98)
        await job.finish()
    except Exception as exc:  # noqa: BLE001 - surface the message to the client
        await job.emit(Stage.ingest, "error", str(exc))
        await job.finish(str(exc))


def get_report(report_id: str) -> dict | None:
    p = REPORTS / f"{report_id}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def list_reports() -> list[dict]:
    """Latest report per channel."""
    seen, rows = set(), []
    for p in sorted(REPORTS.glob("*.json"), key=lambda x: -x.stat().st_mtime):
        r = json.loads(p.read_text(encoding="utf-8"))
        cid = r["channel"]["channel_id"]
        if cid in seen:
            continue
        seen.add(cid)
        rows.append({"id": r["id"], "channel": r["channel"]["channel"], "channel_id": cid, "created_at": r["created_at"],
                     "videos": len(r["videos"]), "hurts": sum(p_["verdict"] == "hurts" for p_ in r["patterns"]),
                     "source": r["source"]})
    return rows


if __name__ == "__main__" and sys.argv[1:] == ["warm"]:
    t0 = time.time()
    n = len(baseline(None))
    print(f"measured {n} dataset videos in {time.time() - t0:.1f}s → {MEASURED}")
