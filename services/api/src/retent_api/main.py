"""Retent AI API.

    uv run --package retent-api uvicorn retent_api.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from retent_core import PRODUCT_NAME
from retent_core.contract import (
    Analysis, AnalyzeRequest, InputMode, JobAccepted, Metrics, SimulateRequest, Simulation, Stage, VideoMeta,
)
from retent_core.engine import load_baselines
from retent_core.pipeline import analyze_sentences, sentences_from_captions, sentences_from_script
from retent_core.llm import LLMError
from retent_core.contract import EditOp, EditOpKind
from retent_core.semantic import Semantic, read_script, write_fixes, write_hooks
from retent_core.simulator import apply_ops, delta, edited_semantic, run
from retent_core.text import detect_language
from retent_api.jobs import Jobs
from retent_api.store import ROOT, Store

load_dotenv(ROOT / ".env")
load_baselines(ROOT / "models" / "baselines.json")

app = FastAPI(title=f"{PRODUCT_NAME} API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
store = Store()
jobs = Jobs()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "product": PRODUCT_NAME}


@app.get("/api/samples")
def samples() -> list[dict]:
    """Authored sample scripts for demos (clearly labelled as samples)."""
    out = []
    for p in sorted((ROOT / "fixtures" / "samples").glob("*.json")):
        import json

        s = json.loads(p.read_text(encoding="utf-8"))
        out.append({k: s.get(k) for k in ("id", "label", "note", "title", "category", "thumbnail_text", "script")})
    return out


def _eval_report() -> dict:
    import json

    path = ROOT / "models" / "eval_report.json"
    if not path.exists():
        raise HTTPException(404, "No evaluation report yet. Run: python -m retent_ml.train")
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/eval")
def eval_summary() -> dict:
    """Held-out evaluation (GroupKFold by channel): summary plus per-video metrics, no series."""
    import json

    r = _eval_report()
    card_path = ROOT / "models" / "model_card.json"
    card = json.loads(card_path.read_text(encoding="utf-8")) if card_path.exists() else {}
    videos = [{k: v for k, v in x.items() if k != "series"} for x in r["videos"]]
    return {**{k: v for k, v in r.items() if k != "videos"}, "videos": videos,
            "top_features": list(card.get("importance_gain", {}))[:8]}


@app.get("/api/eval/videos/{video_id}")
def eval_video(video_id: str) -> dict:
    """One held-out video with predicted vs actual series (for overlays and the blind test)."""
    for x in _eval_report()["videos"]:
        if x["id"] == video_id:
            return x
    raise HTTPException(404, "Video not in the evaluation set")


@app.get("/api/analyses")
def list_analyses() -> list[dict]:
    return store.list()


@app.get("/api/analyses/{analysis_id}", response_model=Analysis)
def get_analysis(analysis_id: str) -> Analysis:
    a = store.get(analysis_id)
    if a is None:
        raise HTTPException(404, "Analysis not found")
    return a


@app.get("/api/analyses/{analysis_id}/actual")
def get_actual(analysis_id: str) -> dict:
    """YouTube's public "Most replayed" curve for a public video, when we have it."""
    heat = store.heatmap(analysis_id)
    if not heat:
        raise HTTPException(404, "No actual curve for this analysis")
    return {"source": "youtube_most_replayed", "points": heat}


async def _run_script_job(job, req: AnalyzeRequest, analysis_id: str) -> None:
    try:
        await job.emit(Stage.ingest, "start", "Reading the script")
        sents = sentences_from_script(req.script or "")
        if len(sents) < 8:
            raise ValueError("That script is too short to analyze. Paste at least a few minutes of speech.")
        lang = req.language or detect_language(req.script or "")
        await job.emit(Stage.segment, "done", f"{len(sents)} lines, timing estimated from speaking rate", 0.2)

        await job.emit(Stage.read, "start", "Reading for hooks, promises and loops", 0.3)
        semantic: Semantic | None = None
        try:
            semantic = await asyncio.to_thread(read_script, sents, req.title, req.thumbnail_text, req.category, req.engine)
            p = semantic.provenance
            await job.emit(Stage.read, "done", f"Read by {p.provider.title()} · {len(semantic.roles)} lines labelled, "
                           f"{len(semantic.loops)} loops, {len(semantic.sections)} sections", 0.5, provenance=p)
        except LLMError as exc:
            await job.emit(Stage.read, "done", f"No language model available, using keyword rules ({str(exc)[:80]})", 0.5)

        await job.emit(Stage.predict, "start", "Predicting the retention curve", 0.55)
        meta = VideoMeta(title=req.title, candidate_titles=req.candidate_titles, thumbnail_text=req.thumbnail_text,
                         category=req.category, language=lang, input_mode=InputMode.script, duration_seconds=0)
        writer = (lambda flags, fixes, payoff_id: write_fixes(sents, req.title, flags, fixes, req.engine, payoff_id)[0])
        await job.emit(Stage.fix, "start", "Writing fixes in your voice and simulating each one", 0.7)
        analysis = await asyncio.to_thread(analyze_sentences, sents, meta, engine=req.engine, analysis_id=analysis_id,
                                           timing="estimated", semantic=semantic, writer=writer)
        await job.emit(Stage.explain, "done", f"{len(analysis.flags)} drop risks explained", 0.9)
        written = sum(1 for f in analysis.fixes if f.provenance.provider != "rules")
        await job.emit(Stage.fix, "done", f"{len(analysis.fixes)} fixes simulated, {written} written by a language model", 0.98)
        store.put(analysis, extra={"_semantic": semantic.to_json()} if semantic else None)
        await job.finish()
    except Exception as exc:  # noqa: BLE001 - surface the message to the client
        await job.emit(Stage.ingest, "error", str(exc))
        await job.finish(str(exc))


async def _run_url_job(job, req: AnalyzeRequest, analysis_id: str) -> None:
    from retent_api import youtube

    try:
        await job.emit(Stage.ingest, "start", "Opening the video on YouTube")
        vid = youtube.video_id(req.source_url or "")
        info = await asyncio.to_thread(youtube.fetch_info, vid)
        heat = info.get("heatmap") or []
        await job.emit(Stage.ingest, "done", f"{info.get('title', '')[:70]} · {(info.get('duration') or 0) / 60:.1f} min · "
                       + ("has YouTube's Most replayed curve" if len(heat) >= 50 else "no Most replayed curve on this one"), 0.12)

        loop = asyncio.get_running_loop()
        def whisper_note() -> None:
            asyncio.run_coroutine_threadsafe(
                job.emit(Stage.transcribe, "progress", "Captions blocked here, transcribing the audio with Groq Whisper", 0.2), loop)
        await job.emit(Stage.transcribe, "start", "Getting the transcript", 0.15)
        segs, source, lang = await asyncio.to_thread(youtube.transcript, info, whisper_note)
        sents = sentences_from_captions(segs)
        label = {"manual": "creator captions", "auto": "YouTube captions", "asr": "Whisper transcript"}[source]
        await job.emit(Stage.transcribe, "done", f"{len(sents)} lines from the {label}", 0.3)

        title = info.get("title") or "Untitled video"
        await job.emit(Stage.read, "start", "Reading for hooks, promises and loops", 0.35)
        semantic: Semantic | None = None
        try:
            semantic = await asyncio.to_thread(read_script, sents, title, None, req.category, req.engine)
            await job.emit(Stage.read, "done", f"Read by {semantic.provenance.provider.title()} · {len(semantic.sections)} sections, "
                           f"{len(semantic.loops)} loops", 0.5, provenance=semantic.provenance)
        except LLMError as exc:
            await job.emit(Stage.read, "done", f"No language model available, using keyword rules ({str(exc)[:80]})", 0.5)

        await job.emit(Stage.predict, "start", "Predicting the retention curve", 0.55)
        text = " ".join(s.text for s in sents[:80])
        meta = VideoMeta(title=title, category=req.category, language=req.language or detect_language(text),
                         input_mode=InputMode.url, duration_seconds=float(info["duration"]),
                         source_url=f"https://www.youtube.com/watch?v={vid}", channel=info.get("channel"))
        writer = (lambda flags, fixes, payoff_id: write_fixes(sents, title, flags, fixes, req.engine, payoff_id)[0])
        await job.emit(Stage.fix, "start", "Writing fixes and simulating each one", 0.7)
        analysis = await asyncio.to_thread(analyze_sentences, sents, meta, engine=req.engine, analysis_id=analysis_id,
                                           timing="measured", semantic=semantic, writer=writer,
                                           chapters=info.get("chapters") or None)
        await job.emit(Stage.explain, "done", f"{len(analysis.flags)} drop risks explained", 0.9)
        await job.emit(Stage.fix, "done", f"{len(analysis.fixes)} fixes simulated", 0.98)
        extra: dict = {"_semantic": semantic.to_json()} if semantic else {}
        if len(heat) >= 50:
            extra["_heatmap"] = heat
        store.put(analysis, extra=extra or None)
        await job.finish()
    except Exception as exc:  # noqa: BLE001 - surface the message to the client
        await job.emit(Stage.ingest, "error", str(exc))
        await job.finish(str(exc))


UPLOADS = ROOT / "data" / "uploads"
MAX_UPLOAD_BYTES = 2_000_000_000


async def _run_upload_job(job, path: Path, title: str, category: str, engine: str, thumbnail_text: str | None,
                          analysis_id: str) -> None:
    import concurrent.futures

    from retent_api import media_probe
    from retent_core import groq

    try:
        await job.emit(Stage.ingest, "start", "Reading the rough cut")
        dur = await asyncio.to_thread(media_probe.duration, path)
        video = await asyncio.to_thread(media_probe.has_video, path)
        await job.emit(Stage.ingest, "done", f"{dur / 60:.1f} min {'video' if video else 'audio'}", 0.1)
        if dur > 25 * 60:
            raise ValueError(f"That cut runs {dur / 60:.0f} minutes. Retent AI analyses up to 25 minutes (tuned for 5–15).")

        await job.emit(Stage.transcribe, "start", "Extracting the audio and transcribing it with Whisper", 0.15)
        audio = await asyncio.to_thread(media_probe.extract_audio, path, path.with_name("audio.mp3"))
        if not groq.available():
            raise ValueError("Transcribing a rough cut needs GROQ_API_KEY in .env.")
        # Whisper (network) and the visual/audio measurements (local) run side by side.
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            f_asr = pool.submit(groq.transcribe, audio, None)
            f_cuts = pool.submit(media_probe.scene_cuts, path) if video else None
            f_sil = pool.submit(media_probe.silences, audio)
            await job.emit(Stage.segment, "start", "Measuring shot cuts and silences", 0.25)
            segs = await asyncio.wrap_future(f_asr)
            cuts = await asyncio.wrap_future(f_cuts) if f_cuts else []
            sil = await asyncio.wrap_future(f_sil)
        if len(segs) < 20:
            raise ValueError("Couldn't get enough speech from this cut to analyze it.")
        sents = sentences_from_captions(segs)
        media = {"duration": dur, "cuts": cuts, "silences": sil, "has_video": video}
        await job.emit(Stage.transcribe, "done", f"{len(sents)} lines transcribed", 0.35)
        await job.emit(Stage.segment, "done",
                       f"{len(cuts)} shot cuts, {sum(1 for a, b in sil if b - a >= 3)} pauses of 3 s or more" if video
                       else f"Audio only: {len(sil)} silences", 0.4)

        await job.emit(Stage.read, "start", "Reading for hooks, promises and loops", 0.45)
        semantic: Semantic | None = None
        try:
            semantic = await asyncio.to_thread(read_script, sents, title, thumbnail_text, category, engine)
            await job.emit(Stage.read, "done", f"Read by {semantic.provenance.provider.title()} · {len(semantic.sections)} sections",
                           0.55, provenance=semantic.provenance)
        except LLMError as exc:
            await job.emit(Stage.read, "done", f"No language model available, using keyword rules ({str(exc)[:80]})", 0.55)

        await job.emit(Stage.predict, "start", "Predicting the retention curve", 0.6)
        text = " ".join(s.text for s in sents[:80])
        meta = VideoMeta(title=title, thumbnail_text=thumbnail_text, category=category, language=detect_language(text),
                         input_mode=InputMode.video, duration_seconds=dur)
        writer = (lambda flags, fixes, payoff_id: write_fixes(sents, title, flags, fixes, engine, payoff_id)[0])
        await job.emit(Stage.fix, "start", "Writing fixes and simulating each one", 0.75)
        analysis = await asyncio.to_thread(analyze_sentences, sents, meta, engine=engine, analysis_id=analysis_id,
                                           timing="measured", semantic=semantic, writer=writer, media=media)
        await job.emit(Stage.explain, "done", f"{len(analysis.flags)} drop risks explained", 0.9)
        await job.emit(Stage.fix, "done", f"{len(analysis.fixes)} fixes simulated", 0.98)
        extra: dict = {"_media": {**media, "file": path.name}}
        if semantic:
            extra["_semantic"] = semantic.to_json()
        store.put(analysis, extra=extra)
        await job.finish()
    except Exception as exc:  # noqa: BLE001 - surface the message to the client
        await job.emit(Stage.ingest, "error", str(exc))
        await job.finish(str(exc))


@app.post("/api/analyze/upload", response_model=JobAccepted)
async def analyze_upload(file: UploadFile = File(...), title: str = Form(...), category: str = Form("tech"),
                         engine: str = Form("auto"), thumbnail_text: str | None = Form(None)) -> JobAccepted:
    """Rough-cut mode: upload an unpublished video (or audio) before publishing."""
    if not title.strip():
        raise HTTPException(422, "Add the title you plan to publish with.")
    suffix = Path(file.filename or "cut.mp4").suffix.lower() or ".mp4"
    if suffix not in {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".mp3", ".m4a", ".wav"}:
        raise HTTPException(415, "Upload an MP4, MOV, MKV or WebM video (or MP3, M4A, WAV audio).")
    analysis_id = uuid.uuid4().hex[:12]
    folder = UPLOADS / analysis_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"source{suffix}"
    size = 0
    with path.open("wb") as out:
        while chunk := await file.read(4 * 1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "That file is over 2 GB. Export a smaller cut (720p is plenty).")
            out.write(chunk)
    job = jobs.create(analysis_id)
    asyncio.create_task(_run_upload_job(job, path, title.strip(), category, engine, thumbnail_text, analysis_id))
    return JobAccepted(job_id=job.id, analysis_id=analysis_id)


@app.get("/api/media/{analysis_id}")
def media_file(analysis_id: str):
    """The uploaded rough cut, for the workspace player."""
    from fastapi.responses import FileResponse

    raw = store.get_raw(analysis_id) or {}
    name = (raw.get("_media") or {}).get("file")
    path = (UPLOADS / analysis_id / name).resolve() if name else None
    if not path or not path.exists() or path.parent.parent != UPLOADS.resolve():
        raise HTTPException(404, "No uploaded media for this analysis")
    return FileResponse(path)


RETENTION_DIR = ROOT / "data" / "raw" / "d2"


@app.post("/api/retention/import")
async def retention_import(image: UploadFile = File(...), analysis_id: str | None = Form(None),
                           y_top: float = Form(1.0), y_bottom: float = Form(0.0)) -> dict:
    """Real retention check: a YouTube Studio retention screenshot → actual curve → compared with our prediction."""
    import io
    import json

    import numpy as np
    from PIL import Image

    from retent_ml.digitize import DigitizeError, digitize, overlay, record

    raw = await image.read()
    if len(raw) > 15_000_000:
        raise HTTPException(413, "That image is over 15 MB.")
    try:
        img = Image.open(io.BytesIO(raw))
        res = digitize(img, y_top=y_top, y_bottom=y_bottom)
    except DigitizeError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(422, f"Couldn't read that image: {str(exc)[:120]}") from exc

    rid = uuid.uuid4().hex[:10]
    RETENTION_DIR.mkdir(parents=True, exist_ok=True)
    (RETENTION_DIR / "uploads").mkdir(exist_ok=True)
    (RETENTION_DIR / "overlays").mkdir(exist_ok=True)
    img_path = RETENTION_DIR / "uploads" / f"{rid}.png"
    img.convert("RGB").save(img_path)
    overlay(img, res).save(RETENTION_DIR / "overlays" / f"{rid}.png")

    actual = np.array(res.points, dtype=float)
    out: dict = {"id": rid, "actual": res.points, "coverage": res.coverage, "warnings": res.warnings,
                 "overlay_url": f"/api/retention/overlay/{rid}.png", "comparison": None}
    a = store.get(analysis_id) if analysis_id else None
    if a is not None:
        pred = np.array([b.retention for b in a.curve.bins], dtype=float)
        dur = a.metrics.duration_seconds
        xs = (np.arange(100) + 0.5) / 100 * dur
        at30 = lambda v: float(np.interp(min(30.0, dur), np.concatenate([[0.0], xs]), np.concatenate([[1.0], v])))  # noqa: E731
        ra, rp = actual.argsort().argsort(), pred.argsort().argsort()
        out["comparison"] = {
            "analysis_id": a.id, "title": a.meta.title, "duration": dur, "predicted": pred.round(4).tolist(),
            "mae_pts": round(float(np.abs(pred - actual).mean() * 100), 1),
            "shape": round(float(np.corrcoef(ra, rp)[0, 1]), 3),
            "intro_actual": round(at30(actual), 4), "intro_pred": round(at30(pred), 4),
            "apv_actual": round(float(actual.mean()), 4), "apv_pred": round(float(pred.mean()), 4),
        }
    rec = record(res, image=img_path, source_url=None, video_id=None, duration=a.metrics.duration_seconds if a else None)
    rec.update(id=rid, source="upload", analysis_id=a.id if a else None, comparison=out["comparison"])
    (RETENTION_DIR / f"{rid}.json").write_text(json.dumps(rec, ensure_ascii=False), encoding="utf-8")
    return out


@app.get("/api/retention/summary")
def retention_summary() -> dict:
    """Every Studio screenshot checked against a prediction (real absolute retention)."""
    import json

    import numpy as np

    rows = []
    for f in sorted(RETENTION_DIR.glob("*.json")):
        r = json.loads(f.read_text(encoding="utf-8"))
        if r.get("comparison"):
            rows.append({"id": r["id"], **{k: r["comparison"][k] for k in ("title", "mae_pts", "shape", "apv_actual", "apv_pred")}})
    out: dict = {"n": len(rows), "checks": rows}
    if rows:
        out["mean_mae_pts"] = round(float(np.mean([x["mae_pts"] for x in rows])), 1)
        out["mean_shape"] = round(float(np.mean([x["shape"] for x in rows])), 3)
    return out


@app.get("/api/retention/overlay/{name}")
def retention_overlay(name: str):
    from fastapi.responses import FileResponse

    path = (RETENTION_DIR / "overlays" / name).resolve()
    if path.parent != (RETENTION_DIR / "overlays").resolve() or not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(path, media_type="image/png")


@app.post("/api/analyze", response_model=JobAccepted)
async def analyze(req: AnalyzeRequest) -> JobAccepted:
    if not req.script and not req.source_url:
        raise HTTPException(422, "Send a script, or a public YouTube URL.")
    analysis_id = uuid.uuid4().hex[:12]
    job = jobs.create(analysis_id)
    if req.source_url and not req.script:
        asyncio.create_task(_run_url_job(job, req, analysis_id))
    else:
        asyncio.create_task(_run_script_job(job, req, analysis_id))
    return JobAccepted(job_id=job.id, analysis_id=analysis_id)


@app.get("/api/jobs/{job_id}/events")
async def job_events(job_id: str) -> StreamingResponse:
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")

    async def gen():
        async for ev in job.stream():
            yield f"event: stage\ndata: {ev.model_dump_json()}\n\n"
        yield f"event: end\ndata: {{\"error\": {('\"' + job.error + '\"') if job.error else 'null'}}}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/hooks")
def hooks(body: dict) -> dict:
    """Hook Lab: an LLM writes opening hooks; the retention model re-simulates and ranks each one."""
    from retent_core.features import TimedSentence

    a = store.get(body.get("analysis_id", ""))
    if a is None:
        raise HTTPException(404, "Analysis not found")
    raw = store.get_raw(a.id) or {}
    semantic = Semantic.from_json(raw["_semantic"]) if raw.get("_semantic") else None
    media = raw.get("_media")
    sents = [TimedSentence(s.id, s.text, s.start, s.end, s.lang) for s in a.sentences]
    payoff_id = a.metrics.payoff_sentence_id
    try:
        written, prov = write_hooks(sents, a.meta.title, a.meta.category, body.get("engine", a.engine), payoff_id,
                                    int(body.get("n", 5)))
    except LLMError as exc:
        raise HTTPException(503, f"No language model available to write hooks: {exc}") from exc
    tail = _tail(a)
    before = run(sents, a.meta.title, a.meta.thumbnail_text, a.meta.category, payoff_id=payoff_id, semantic=semantic, tail=tail,
                 media=media)
    out = []
    for h in written:
        ops = [EditOp(op=EditOpKind.insert, after_sentence_id="", new_text=h["text"], note="hook")]
        after = run(apply_ops(sents, ops), a.meta.title, a.meta.thumbnail_text, a.meta.category, payoff_id=payoff_id,
                    semantic=edited_semantic(semantic, ops), tail=tail, media=media)
        out.append({**h, "delta": delta(before, after).model_dump(),
                    "intro_retention": round(after.metrics.intro_retention, 4)})
    out.sort(key=lambda h: (h["delta"]["intro_retention"], h["delta"]["viewers_at_payoff"] or 0), reverse=True)
    return {"analysis_id": a.id, "current_opening": a.sentences[0].text if a.sentences else "",
            "current_intro_retention": a.metrics.intro_retention, "provenance": prov.model_dump(), "hooks": out}


def _tail(a: Analysis) -> float:
    if not a.sentences or a.sentences[0].timing != "measured":
        return 0.0
    return max(0.0, a.meta.duration_seconds - max(s.end for s in a.sentences))


@app.post("/api/shorts")
def shorts(body: dict) -> dict:
    """Shorts Finder: 3–4 clip candidates with packaging, scored on YouTube's real curve when available."""
    from retent_core.shorts import find_clips, package

    a = store.get(body.get("analysis_id", ""))
    if a is None:
        raise HTTPException(404, "Analysis not found")
    heat = store.heatmap(a.id)
    clips, source = find_clips(a, heat, int(body.get("n", 4)))
    packs, prov = package(a, clips, body.get("engine", a.engine))
    url = a.meta.source_url
    video_id = url.split("v=")[-1][:11] if url and "v=" in url else None
    return {
        "analysis_id": a.id, "source": source, "full_video_url": url, "video_id": video_id,
        "can_render": video_id is not None, "channel": a.meta.channel, "title": a.meta.title,
        "provenance": prov.model_dump() if prov else None,
        "clips": [{"id": f"c{i + 1}", "start": round(c.start, 2), "end": round(c.end, 2),
                   "duration": round(c.end - c.start, 1), "score": round(c.score, 3), "text": c.text,
                   "title": p["title"], "hook_text": p["hook_text"], "why": p["why"],
                   "description": p["description"].replace("{FULL_VIDEO}", url or "<link to the full video>")}
                  for i, (c, p) in enumerate(zip(clips, packs))],
    }


@app.post("/api/shorts/render")
def shorts_render(body: dict) -> dict:
    """Cut and render one vertical Short from the published video (about 20–40 s)."""
    from retent_api.shorts_render import render

    a = store.get(body.get("analysis_id", ""))
    if a is None or not a.meta.source_url or "v=" not in a.meta.source_url:
        raise HTTPException(400, "Rendering needs a published YouTube video.")
    vid = a.meta.source_url.split("v=")[-1][:11]
    try:
        path = render(vid, float(body["start"]), float(body["end"]), str(body.get("hook_text", ""))[:80],
                      a.meta.channel or "", a.meta.title)
    except Exception as exc:  # noqa: BLE001 - surface a readable error
        raise HTTPException(502, f"Couldn't render this Short: {str(exc)[:200]}") from exc
    return {"file": path.name, "url": f"/api/shorts/file/{path.name}"}


@app.get("/api/shorts/file/{name}")
def shorts_file(name: str):
    from fastapi.responses import FileResponse

    from retent_api.shorts_render import OUT_DIR

    path = (OUT_DIR / name).resolve()
    if path.parent != OUT_DIR.resolve() or not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(path, media_type="video/mp4", filename=name)


@app.post("/api/simulate", response_model=Simulation)
def simulate(req: SimulateRequest) -> Simulation:
    a = store.get(req.analysis_id)
    if a is None:
        raise HTTPException(404, "Analysis not found")
    from retent_core.features import TimedSentence

    raw = store.get_raw(req.analysis_id) or {}
    semantic = Semantic.from_json(raw["_semantic"]) if raw.get("_semantic") else None
    media = raw.get("_media")
    sents = [TimedSentence(s.id, s.text, s.start, s.end, s.lang) for s in a.sentences]
    ops = [op for fx in a.fixes if fx.id in req.fix_ids for op in fx.ops]
    payoff_id = a.metrics.payoff_sentence_id
    tail = _tail(a)
    before = run(sents, a.meta.title, a.meta.thumbnail_text, a.meta.category, payoff_id=payoff_id, semantic=semantic, tail=tail,
                 media=media)
    after_sents = apply_ops(sents, ops)
    after_sem = edited_semantic(semantic, ops)
    after = run(after_sents, a.meta.title, a.meta.thumbnail_text, a.meta.category, payoff_id=payoff_id, semantic=after_sem,
                tail=tail, media=media)
    edited = analyze_sentences(after_sents, a.meta.model_copy(update={"duration_seconds": max(x.end for x in after_sents) + tail}),
                               engine=a.engine, analysis_id=a.id, timing=a.sentences[0].timing, semantic=after_sem,
                               media=media)
    return Simulation(
        analysis_id=a.id, fix_ids=req.fix_ids, curve=edited.curve,
        metrics=Metrics(**{**edited.metrics.model_dump(), "payoff_time": after.payoff_time,
                           "payoff_sentence_id": payoff_id,
                           "viewers_at_payoff": round(after.prediction.at(after.payoff_time) * 1000, 1)
                           if after.payoff_time is not None else None}),
        delta=delta(before, after), sentences=edited.sentences,
    )
