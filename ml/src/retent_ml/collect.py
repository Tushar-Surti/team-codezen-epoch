"""D1 collector: public videos with a "Most replayed" curve, original-language captions and chapters.

Crawls channel upload lists, keeps 5–15 minute videos older than MIN_AGE_DAYS, probes each one,
and writes one JSON record per kept video to data/raw/d1/<video_id>.json. Safe to stop and
restart: already-probed ids (kept or rejected) are skipped via data/raw/d1/_probed.jsonl.

Videos without a caption track are kept with caption status "none" and transcribed in pass C
(retent_ml.asr, Groq Whisper).

YouTube only serves "Most replayed" for some videos (Phase 0 spike: ~6 in 16, skewed to older
uploads), so expect to probe 2–3x more videos than you keep.

Run:
  uv run --package retent-ml python -m retent_ml.collect --seeds ml/seeds/channels.json --per-channel 40
"""

from __future__ import annotations

import argparse
import json
import random
import shutil
import tempfile
import time
from datetime import UTC, datetime, timedelta
from itertools import zip_longest
from pathlib import Path

import yt_dlp
from yt_dlp.networking.impersonate import ImpersonateTarget

ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = ROOT / "data" / "raw" / "d1"
PROBED_LOG = OUT_DIR / "_probed.jsonl"

MIN_S, MAX_S = 300, 900
MIN_AGE_DAYS = 30
CAPTION_LANGS = ("en", "hi")


def _js_runtimes() -> dict:
    """yt-dlp needs a JS runtime for YouTube. It looks for deno by default; fall back to node."""
    if shutil.which("deno") or not shutil.which("node"):
        return {}
    return {"js_runtimes": {"node": {}}}


def _ydl(**extra) -> yt_dlp.YoutubeDL:
    return yt_dlp.YoutubeDL({
        "quiet": True, "no_warnings": True, "noprogress": True, "skip_download": True, "ignore_no_formats_error": True,
        "impersonate": ImpersonateTarget("chrome"), **_js_runtimes(), **extra,
    })


class RateLimited(Exception):
    pass


def list_channel_videos(channel_url: str, limit: int) -> list[dict]:
    """Recent uploads from a channel's /videos tab (flat, cheap)."""
    url = channel_url.rstrip("/") + "/videos"
    with _ydl(extract_flat="in_playlist", playlistend=limit) as ydl:
        res = ydl.extract_info(url, download=False)
    return [e for e in (res.get("entries") or []) if e and e.get("id")]


def _pick_caption(info: dict, lang: str) -> tuple[str, str] | None:
    """Prefer creator-uploaded captions, then the original-language ASR track ("<lang>-orig")."""
    manual = info.get("subtitles") or {}
    for key in manual:
        if key.split("-")[0] == lang:
            return "manual", key
    auto = info.get("automatic_captions") or {}
    if f"{lang}-orig" in auto:
        return "auto", f"{lang}-orig"
    return None


def spoken_language(info: dict) -> str:
    """The language actually spoken. YouTube's own ASR track ("<lang>-orig") is detected from the
    audio, so it beats the uploader's metadata, which Hindi creators often leave set to English."""
    orig = [k[: -len("-orig")] for k in (info.get("automatic_captions") or {}) if k.endswith("-orig")]
    if orig:
        return orig[0].split("-")[0]
    return (info.get("language") or "").split("-")[0]


def _fetch_json3(video_id: str, kind: str, key: str) -> list[dict]:
    """Download one caption track through yt-dlp (handles signing and impersonation)."""
    with tempfile.TemporaryDirectory() as tmp:
        opts = {"subtitleslangs": [key], "subtitlesformat": "json3", "paths": {"home": tmp},
                "outtmpl": {"default": "%(id)s.%(ext)s"}}
        opts["writesubtitles" if kind == "manual" else "writeautomaticsub"] = True
        try:
            with _ydl(**opts) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
        except yt_dlp.utils.DownloadError as exc:
            if "429" in str(exc):
                raise RateLimited(str(exc)) from exc
            raise
        files = list(Path(tmp).glob("*.json3"))
        if not files:
            return []
        data = json.loads(files[0].read_text(encoding="utf-8"))
    segs = []
    for ev in data.get("events", []):
        text = "".join(s.get("utf8", "") for s in ev.get("segs") or []).strip()
        if text and text != "\n":
            start = ev.get("tStartMs", 0) / 1000
            segs.append({"start": start, "end": start + ev.get("dDurationMs", 0) / 1000, "text": text})
    return segs


def probe(video_id: str) -> tuple[dict | None, str]:
    with _ydl() as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)

    duration = info.get("duration") or 0
    if not MIN_S <= duration <= MAX_S:
        return None, "duration"
    upload = info.get("upload_date")
    if upload and datetime.strptime(upload, "%Y%m%d").replace(tzinfo=UTC) > datetime.now(UTC) - timedelta(
        days=MIN_AGE_DAYS
    ):
        return None, "too_recent"
    heat = info.get("heatmap") or []
    if len(heat) < 50:
        return None, "no_heatmap"

    lang = spoken_language(info)
    caption = None
    for cand in ([lang] if lang in CAPTION_LANGS else []) + list(CAPTION_LANGS):
        if picked := _pick_caption(info, cand):
            caption = (cand, *picked)
            break
    if caption is None:
        # No caption track: keep the record; pass C (retent_ml.asr) transcribes it with Groq Whisper.
        cap_lang, cap_kind, cap_key = (lang if lang in CAPTION_LANGS else None), None, None
        segments, cap_status = [], "none"
    else:
        cap_lang, cap_kind, cap_key = caption
        try:
            segments, cap_status = _fetch_json3(video_id, cap_kind, cap_key), "ok"
        except RateLimited:
            # Caption endpoint is throttled per IP; keep the record and fetch captions in pass B (or C).
            segments, cap_status = [], "pending"
        if cap_status == "ok" and len(segments) < 20:
            segments, cap_status = [], "empty"

    record = {
        "id": video_id,
        "title": info.get("title"),
        "description": (info.get("description") or "")[:2000],
        "channel": info.get("channel"),
        "channel_id": info.get("channel_id"),
        "channel_followers": info.get("channel_follower_count"),
        "upload_date": upload,
        "duration": duration,
        "views": info.get("view_count"),
        "likes": info.get("like_count"),
        "comments": info.get("comment_count"),
        "language": info.get("language"),
        "thumbnail": info.get("thumbnail"),
        "chapters": info.get("chapters") or [],
        "heatmap": heat,
        "caption": {"lang": cap_lang, "kind": cap_kind, "key": cap_key, "status": cap_status, "segments": segments},
        "collected_at": datetime.now(UTC).isoformat(),
    }
    return record, {"ok": "kept", "pending": "kept_pending_caption"}.get(cap_status, "kept_needs_asr")


def fetch_pending_captions(sleep: float, deadline: float = float("inf")) -> None:
    """Pass B: fill in captions for kept records whose caption fetch was rate-limited."""
    pending = [f for f in sorted(OUT_DIR.glob("*.json"))
               if json.loads(f.read_text(encoding="utf-8"))["caption"].get("status") == "pending"]
    print(f"{len(pending)} records waiting for captions", flush=True)
    for f in pending:
        if time.time() > deadline:
            print("time limit reached; rerun to continue", flush=True)
            return
        rec = json.loads(f.read_text(encoding="utf-8"))
        cap = rec["caption"]
        for attempt in range(5):
            try:
                segs = _fetch_json3(rec["id"], cap["kind"], cap["key"])
                cap.update(segments=segs, status="ok" if len(segs) >= 20 else "empty")
                f.write_text(json.dumps(rec, ensure_ascii=False), encoding="utf-8")
                print(f"{rec['id']} captions {cap['status']} ({len(segs)} segments)", flush=True)
                break
            except RateLimited:
                wait = 120 * (2 ** attempt)
                print(f"  429 — backing off {wait}s", flush=True)
                time.sleep(wait)
            except Exception as exc:  # noqa: BLE001
                print(f"{rec['id']} error {str(exc)[:80]}", flush=True)
                break
        time.sleep(sleep + random.random() * sleep)


def fix_languages(sleep: float) -> None:
    """Refetch captions for records whose caption language differs from the channel's language,
    using the spoken language (the "-orig" ASR track) instead of the uploader's metadata."""
    files = [f for f in sorted(OUT_DIR.glob("*.json"))
             if (r := json.loads(f.read_text(encoding="utf-8")))["caption"].get("kind") != "asr"
             and r["caption"].get("lang") != r.get("seed_lang")]
    print(f"{len(files)} records to recheck", flush=True)
    for f in files:
        rec = json.loads(f.read_text(encoding="utf-8"))
        try:
            with _ydl() as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={rec['id']}", download=False)
            lang = spoken_language(info)
            picked = _pick_caption(info, lang) if lang in CAPTION_LANGS else None
            if not picked or (lang, picked[1]) == (rec["caption"].get("lang"), rec["caption"].get("key")):
                print(f"{rec['id']} keeps {rec['caption'].get('lang')} (spoken: {lang or '?'})", flush=True)
                continue
            segs = _fetch_json3(rec["id"], *picked)
        except RateLimited:
            print("  429 — stopping; rerun later", flush=True)
            return
        except Exception as exc:  # noqa: BLE001
            print(f"{rec['id']} error {str(exc)[:80]}", flush=True)
            continue
        if len(segs) >= 20:
            rec["caption"] = {"lang": lang, "kind": picked[0], "key": picked[1], "status": "ok", "segments": segs,
                              "replaced": {k: rec["caption"].get(k) for k in ("lang", "kind", "key")}}
            f.write_text(json.dumps(rec, ensure_ascii=False), encoding="utf-8")
            print(f"{rec['id']} captions now {lang} {picked[0]} ({len(segs)} segments)", flush=True)
        time.sleep(sleep + random.random() * sleep)


def _load_probed() -> set[str]:
    """Ids with a final verdict. Errors are not final: they are retried on the next run."""
    if not PROBED_LOG.exists():
        return set()
    done = set()
    for line in PROBED_LOG.read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            # Errors, too-recent uploads (they age) and old caption-less rejections (pass C transcribes
            # those now) are retried.
            if not row["status"].startswith(("error", "rate_limited", "no_caption", "caption_empty", "too_recent")):
                done.add(row["id"])
    return done


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=Path, default=ROOT / "ml" / "seeds" / "channels.json")
    ap.add_argument("--per-channel", type=int, default=12, help="Videos to probe per channel per run.")
    ap.add_argument("--sleep", type=float, default=2.5, help="Base pause between probes (seconds).")
    ap.add_argument("--only", help="Only these cells, comma-separated, e.g. tech/hi,vlog/hi.")
    ap.add_argument("--captions", action="store_true", help="Pass B: fetch captions for pending records only.")
    ap.add_argument("--fix-language", action="store_true", help="Refetch captions in the spoken language.")
    ap.add_argument("--max-minutes", type=float, default=None, help="Stop cleanly after this long (rerun continues).")
    args = ap.parse_args()
    deadline = time.time() + args.max_minutes * 60 if args.max_minutes else float("inf")
    if args.captions:
        fetch_pending_captions(args.sleep * 3, deadline)
        return
    if args.fix_language:
        fix_languages(args.sleep)
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    seeds = json.loads(args.seeds.read_text(encoding="utf-8"))
    only = set(args.only.split(",")) if args.only else None
    probed = _load_probed()
    kept = len(list(OUT_DIR.glob("*.json")))

    # Round-robin across cells, and across channels within a cell, so every pass adds channel
    # diversity instead of exhausting a few big creators first. Reruns continue where they left off.
    by_cell: dict[str, list[dict]] = {}
    for seed in seeds:
        cell = f"{seed['category']}/{seed['lang']}"
        if not only or cell in only:
            by_cell.setdefault(cell, []).append(seed)
    order = [s for group in zip_longest(*by_cell.values()) for s in group if s]
    for seed in order:
        if time.time() > deadline:
            print("time limit reached; rerun to continue", flush=True)
            return
        cell = f"{seed['category']}/{seed['lang']}"
        try:
            # Listings are newest-first and carry no dates; list deeper so the window reaches
            # uploads older than MIN_AGE_DAYS even on channels that post daily.
            entries = list_channel_videos(seed["url"], args.per_channel * 3)
        except Exception as exc:  # noqa: BLE001 - keep crawling other channels
            print(f"[skip channel] {seed['url']}: {str(exc)[:120]}", flush=True)
            continue
        i, skip, probes = 0, 1, 0
        while i < len(entries) and probes < args.per_channel and time.time() <= deadline:
            e = entries[i]
            vid = e["id"]
            i += 1
            if vid in probed:
                continue
            if e.get("duration") and not MIN_S <= e["duration"] <= MAX_S:
                status, record = "duration", None
            else:
                probes += 1
                record, status = None, "rate_limited"
                for attempt in range(4):
                    try:
                        record, status = probe(vid)
                        break
                    except RateLimited:
                        backoff = 60 * (2 ** attempt)
                        print(f"  429 — backing off {backoff}s", flush=True)
                        time.sleep(backoff)
                    except Exception as exc:  # noqa: BLE001
                        record, status = None, f"error:{str(exc)[:80]}"
                        break
                time.sleep(args.sleep + random.random() * args.sleep)
            # Gallop past recent uploads: each "too_recent" doubles the stride until videos are old enough.
            if status == "too_recent":
                i += skip - 1
                skip = min(skip * 2, 16)
            else:
                skip = 1
            if record:
                record.update(category=seed["category"], seed_lang=seed["lang"], seed_tier=seed.get("tier"))
                (OUT_DIR / f"{vid}.json").write_text(json.dumps(record, ensure_ascii=False), encoding="utf-8")
                kept += 1
            with PROBED_LOG.open("a", encoding="utf-8") as f:
                f.write(json.dumps({"id": vid, "status": status, "cell": cell}) + "\n")
            probed.add(vid)
            print(f"[{cell}] {vid} {status}  (kept {kept})", flush=True)

if __name__ == "__main__":
    main()
