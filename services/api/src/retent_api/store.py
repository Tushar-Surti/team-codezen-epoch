"""File-backed store for analyses (JSON on disk) plus the read-only development fixtures."""

from __future__ import annotations

import json
from pathlib import Path

from retent_core.contract import Analysis

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "data" / "analyses"
FIXTURES = ROOT / "fixtures" / "analyses"


class Store:
    def __init__(self, data_dir: Path = DATA, fixtures_dir: Path = FIXTURES):
        self.data_dir = data_dir
        self.fixtures_dir = fixtures_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, analysis_id: str) -> Path | None:
        for base in (self.data_dir, self.fixtures_dir):
            p = base / f"{analysis_id}.json"
            if p.exists():
                return p
        return None

    def get_raw(self, analysis_id: str) -> dict | None:
        p = self._path(analysis_id)
        return json.loads(p.read_text(encoding="utf-8")) if p else None

    def get(self, analysis_id: str) -> Analysis | None:
        raw = self.get_raw(analysis_id)
        if raw is None:
            return None
        # Underscore keys are side data stored with the analysis (real curve, semantic labels).
        return Analysis.model_validate({k: v for k, v in raw.items() if not k.startswith("_")})

    def heatmap(self, analysis_id: str) -> list[dict] | None:
        raw = self.get_raw(analysis_id)
        return raw.get("_heatmap") if raw else None

    def put(self, analysis: Analysis, extra: dict | None = None) -> None:
        payload = json.loads(analysis.model_dump_json())
        if extra:
            payload.update(extra)
        (self.data_dir / f"{analysis.id}.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    def list(self) -> list[dict]:
        rows = []
        for base, origin in ((self.data_dir, "user"), (self.fixtures_dir, "fixture")):
            for p in sorted(base.glob("*.json"), key=lambda x: -x.stat().st_mtime):
                if p.name == "index.json":
                    continue
                raw = json.loads(p.read_text(encoding="utf-8"))
                m = raw["metrics"]
                worst = raw["flags"][0] if raw["flags"] else None
                rows.append({
                    "id": raw["id"], "title": raw["meta"]["title"], "category": raw["meta"]["category"],
                    "language": raw["meta"]["language"], "input_mode": raw["meta"]["input_mode"],
                    "duration_seconds": m["duration_seconds"], "intro_retention": m["intro_retention"],
                    "apv": m["apv"], "flags": len(raw["flags"]), "worst_flag": worst["title"] if worst else None,
                    "synthetic": raw["synthetic"], "origin": origin, "created_at": raw["created_at"],
                    "has_actual": bool(raw.get("_heatmap")),
                })
        return rows
