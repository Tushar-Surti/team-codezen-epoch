"""Retent AI API.

    uv run --package retent-api uvicorn retent_api.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from retent_core import PRODUCT_NAME
from retent_core.contract import (
    Analysis, AnalyzeRequest, InputMode, JobAccepted, Metrics, SimulateRequest, Simulation, Stage, VideoMeta,
)
from retent_core.engine import load_baselines
from retent_core.pipeline import analyze_sentences, sentences_from_script
from retent_core.simulator import apply_ops, delta, run
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
        await job.emit(Stage.segment, "done", f"{len(sents)} lines, timing estimated from speaking rate", 0.25)
        await job.emit(Stage.read, "start", "Reading for hooks, promises and loops", 0.35)
        await asyncio.sleep(0)  # the LLM semantic pass slots in here (retent_api.llm)
        await job.emit(Stage.predict, "start", "Predicting the retention curve", 0.55)
        meta = VideoMeta(title=req.title, candidate_titles=req.candidate_titles, thumbnail_text=req.thumbnail_text,
                         category=req.category, language=lang, input_mode=InputMode.script, duration_seconds=0)
        analysis = await asyncio.to_thread(analyze_sentences, sents, meta, engine=req.engine,
                                           analysis_id=analysis_id, timing="estimated")
        await job.emit(Stage.explain, "done", f"{len(analysis.flags)} drop risks found", 0.8)
        await job.emit(Stage.fix, "done", f"{len(analysis.fixes)} fixes simulated", 0.95)
        store.put(analysis)
        await job.finish()
    except Exception as exc:  # noqa: BLE001 - surface the message to the client
        await job.emit(Stage.ingest, "error", str(exc))
        await job.finish(str(exc))


@app.post("/api/analyze", response_model=JobAccepted)
async def analyze(req: AnalyzeRequest) -> JobAccepted:
    if not req.script and not req.source_url:
        raise HTTPException(422, "Send a script, or a public YouTube URL.")
    if req.source_url and not req.script:
        raise HTTPException(501, "URL analysis is not wired yet. Paste the script for now.")
    analysis_id = uuid.uuid4().hex[:12]
    job = jobs.create(analysis_id)
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


@app.post("/api/simulate", response_model=Simulation)
def simulate(req: SimulateRequest) -> Simulation:
    a = store.get(req.analysis_id)
    if a is None:
        raise HTTPException(404, "Analysis not found")
    from retent_core.features import TimedSentence

    sents = [TimedSentence(s.id, s.text, s.start, s.end, s.lang) for s in a.sentences]
    ops = [op for fx in a.fixes if fx.id in req.fix_ids for op in fx.ops]
    payoff_id = a.metrics.payoff_sentence_id
    before = run(sents, a.meta.title, a.meta.thumbnail_text, a.meta.category, payoff_id=payoff_id)
    after_sents = apply_ops(sents, ops)
    after = run(after_sents, a.meta.title, a.meta.thumbnail_text, a.meta.category, payoff_id=payoff_id)
    edited = analyze_sentences(after_sents, a.meta, engine=a.engine, analysis_id=a.id, timing=a.sentences[0].timing)
    return Simulation(
        analysis_id=a.id, fix_ids=req.fix_ids, curve=edited.curve,
        metrics=Metrics(**{**edited.metrics.model_dump(), "payoff_time": after.payoff_time,
                           "payoff_sentence_id": payoff_id,
                           "viewers_at_payoff": round(after.prediction.at(after.payoff_time) * 1000, 1)
                           if after.payoff_time is not None else None}),
        delta=delta(before, after), sentences=edited.sentences,
    )


_ = Path
