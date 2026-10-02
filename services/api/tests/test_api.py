"""API flow: samples → analyze (job + SSE) → fetch → simulate, against a temporary store."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from retent_api import main
from retent_api.store import FIXTURES, Store


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path / "analyses", fixtures_dir=FIXTURES))
    with TestClient(main.app) as c:
        yield c


def test_health(client):
    assert client.get("/api/health").json()["ok"] is True


def test_samples_and_fixtures(client):
    samples = client.get("/api/samples").json()
    assert samples and samples[0]["script"]
    rows = client.get("/api/analyses").json()
    assert any(r["id"] == "sample-hinglish-tech" for r in rows)
    assert client.get("/api/analyses/sample-hinglish-tech").json()["synthetic"] is True


def test_missing_analysis_is_404(client):
    assert client.get("/api/analyses/nope").status_code == 404


def test_analyze_stream_and_simulate(client):
    s = client.get("/api/samples").json()[0]
    job = client.post("/api/analyze", json={"title": s["title"], "category": s["category"], "script": s["script"],
                                            "thumbnail_text": s["thumbnail_text"]}).json()
    with client.stream("GET", f"/api/jobs/{job['job_id']}/events") as res:
        body = "".join(res.iter_text())
    stages = [json.loads(line[6:])["stage"] for line in body.splitlines()
              if line.startswith("data: ") and '"stage"' in line]
    assert stages[0] == "ingest" and stages[-1] == "fix"
    assert 'event: end\ndata: {"error": null}' in body

    a = client.get(f"/api/analyses/{job['analysis_id']}").json()
    assert a["flags"] and a["fixes"]
    fix_ids = [f["id"] for f in a["fixes"][:2]]
    sim = client.post("/api/simulate", json={"analysis_id": a["id"], "fix_ids": fix_ids}).json()
    assert sim["fix_ids"] == fix_ids
    assert len(sim["curve"]["bins"]) == 100
    assert sim["sentences"] and sim["metrics"]["duration_seconds"] > 0


def test_short_script_reports_an_error(client):
    job = client.post("/api/analyze", json={"title": "Tiny", "category": "tech", "script": "Too short."}).json()
    with client.stream("GET", f"/api/jobs/{job['job_id']}/events") as res:
        body = "".join(res.iter_text())
    assert "too short" in body


def test_analyze_needs_input(client):
    assert client.post("/api/analyze", json={"title": "x", "category": "tech"}).status_code == 422
