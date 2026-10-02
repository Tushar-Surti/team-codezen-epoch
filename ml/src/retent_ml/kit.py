"""GPU kit: a self-contained folder a teammate runs on a Windows/Linux NVIDIA laptop and sends back.

The kit carries the code, every D1 record collected so far, and one script (run.ps1 / run.sh) that:
collects more videos for the thin cells, fetches captions from that laptop's own connection,
transcribes everything still missing text with Whisper on the GPU, looks up SponsorBlock segments,
audits the data and packs RETURN.zip. Back on the Mac, `absorb` merges the returned records.

Commands:
  python -m retent_ml.kit build                 # Mac: write handoff/retent-gpu-kit/ (+ .zip)
  python -m retent_ml.kit absorb <dir-or-zip>   # merge records from a returned kit (or any data folder)
  python -m retent_ml.kit report                # inside the kit: write outputs/report.json
  python -m retent_ml.kit pack                  # inside the kit: write RETURN.zip
"""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import tempfile
import zipfile
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from retent_ml.collect import OUT_DIR as D1_DIR, PROBED_LOG, ROOT

D3_DIR = ROOT / "data" / "raw" / "d3"
KIT_NAME = "retent-gpu-kit"
TEMPLATES = Path(__file__).resolve().parent / "kit_templates"
KIND_RANK = {"manual": 3, "auto": 2, "asr": 1}


# ── Record merging ───────────────────────────────────────────────────────────

def text_rank(rec: dict) -> tuple:
    """Higher is better: usable text first, then creator captions > YouTube auto > Whisper, then length."""
    cap = rec.get("caption") or {}
    segs = cap.get("segments") or []
    ok = cap.get("status") == "ok" and len(segs) >= 20
    return (ok, KIND_RANK.get(cap.get("kind") or "", 0), len(segs))


def _find_data_root(path: Path) -> Path:
    """Accept a kit folder, a repo folder, a data/raw folder or a bare d1 folder."""
    for cand in (path / "data" / "raw", path / "raw", path):
        if (cand / "d1").is_dir():
            return cand
    if any(path.glob("*.json")):
        return path.parent if path.name == "d1" else path
    nested = [p for p in path.iterdir() if p.is_dir()] if path.is_dir() else []
    for sub in nested:
        try:
            return _find_data_root(sub)
        except FileNotFoundError:
            continue
    raise FileNotFoundError(f"no data/raw/d1 folder under {path}")


def absorb(source: Path, verbose: bool = True, *, d1_dir: Path | None = None, probed_log: Path | None = None,
           d3_dir: Path | None = None) -> dict:
    """Merge D1/D3 records and the probe log from `source` into this checkout's data/raw."""
    d1_dir, probed_log, d3_dir = d1_dir or D1_DIR, probed_log or PROBED_LOG, d3_dir or D3_DIR
    tmp = None
    if source.suffix == ".zip":
        tmp = tempfile.TemporaryDirectory()
        with zipfile.ZipFile(source) as z:
            z.extractall(tmp.name)
        source = Path(tmp.name)
    raw = _find_data_root(source)
    src_d1 = raw / "d1" if (raw / "d1").is_dir() else raw
    stats = Counter()
    d1_dir.mkdir(parents=True, exist_ok=True)
    # Every *.json here is one video (ids can start with "_" or "-"); the probe log is *.jsonl.
    for f in sorted(src_d1.glob("*.json")):
        rec = json.loads(f.read_text(encoding="utf-8"))
        dest = d1_dir / f.name
        if not dest.exists():
            dest.write_text(json.dumps(rec, ensure_ascii=False), encoding="utf-8")
            stats["added"] += 1
        else:
            mine = json.loads(dest.read_text(encoding="utf-8"))
            if text_rank(rec) > text_rank(mine):
                dest.write_text(json.dumps(rec, ensure_ascii=False), encoding="utf-8")
                stats["improved"] += 1
            else:
                stats["kept"] += 1
    # Probe log: append verdicts we don't have, so nobody re-probes the same videos.
    src_log = src_d1 / "_probed.jsonl"
    if src_log.exists():
        have = set(probed_log.read_text(encoding="utf-8").splitlines()) if probed_log.exists() else set()
        new = [ln for ln in src_log.read_text(encoding="utf-8").splitlines() if ln.strip() and ln not in have]
        with probed_log.open("a", encoding="utf-8") as out:
            out.writelines(ln + "\n" for ln in new)
        stats["probe_lines"] += len(new)
    if (raw / "d3").is_dir():
        d3_dir.mkdir(parents=True, exist_ok=True)
        for f in (raw / "d3").glob("*.json"):
            if not (d3_dir / f.name).exists():
                shutil.copy2(f, d3_dir / f.name)
                stats["d3_added"] += 1
    # Keep the returned report and logs for the record.
    outputs = raw.parent.parent / "outputs" if raw.name == "raw" else None
    if d1_dir == D1_DIR and outputs and outputs.is_dir() and outputs.resolve() != (ROOT / "outputs").resolve():
        dest = ROOT / "data" / "derived" / "kit-returns" / datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        shutil.copytree(outputs, dest, dirs_exist_ok=True)
        stats["report_saved_to"] = str(dest.relative_to(ROOT))
    if tmp:
        tmp.cleanup()
    if verbose:
        print(json.dumps(dict(stats), indent=1))
    return dict(stats)


# ── Inside the kit ───────────────────────────────────────────────────────────

def summary() -> dict:
    cells: dict[str, Counter] = {}
    for f in D1_DIR.glob("*.json"):
        r = json.loads(f.read_text(encoding="utf-8"))
        cell = f"{r['category']}/{r['seed_lang']}"
        cap = r["caption"]
        ok = cap.get("status") == "ok" and len(cap.get("segments") or []) >= 20
        cells.setdefault(cell, Counter())["records"] += 1
        cells[cell]["with_text" if ok else f"waiting_{cap.get('status')}"] += 1
        if ok:
            cells[cell][f"text_{cap.get('kind')}"] += 1
    total = sum(c["records"] for c in cells.values())
    with_text = sum(c["with_text"] for c in cells.values())
    return {"records": total, "with_text": with_text, "cells": {k: dict(v) for k, v in sorted(cells.items())},
            "sponsorblock": len(list(D3_DIR.glob("*.json"))) if D3_DIR.exists() else 0}


def report() -> None:
    gpu = None
    try:
        import torch

        gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CUDA not available"
    except Exception as exc:  # noqa: BLE001 - torch is optional
        gpu = f"torch not installed ({type(exc).__name__})"
    out = ROOT / "outputs"
    out.mkdir(exist_ok=True)
    data = {"generated_at": datetime.now(UTC).isoformat(), "machine": platform.platform(), "gpu": gpu,
            **summary()}
    (out / "report.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    print(json.dumps(data, indent=1))


def pack() -> None:
    target = ROOT / "RETURN.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        for base in ("data/raw", "outputs", "docs"):
            for f in (ROOT / base).rglob("*"):
                if f.is_file():
                    z.write(f, f.relative_to(ROOT))
        z.write(ROOT / "kit.json", "kit.json")
    print(f"wrote {target} ({target.stat().st_size / 1e6:.1f} MB) — send this file back")


# ── On the Mac ───────────────────────────────────────────────────────────────

def build() -> None:
    out = ROOT / "handoff" / KIT_NAME
    if out.exists():
        shutil.rmtree(out)
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache", "tests")
    (out / "packages").mkdir(parents=True)
    shutil.copytree(ROOT / "packages" / "retent_core", out / "packages" / "retent_core", ignore=ignore)
    shutil.copytree(ROOT / "ml", out / "ml", ignore=ignore)
    shutil.copytree(D1_DIR, out / "data" / "raw" / "d1")
    if D3_DIR.exists():
        shutil.copytree(D3_DIR, out / "data" / "raw" / "d3")
    for name in ("pyproject.toml", "README.md", "run.ps1", "run.sh", ".env.example"):
        shutil.copy2(TEMPLATES / name, out / name)
    (out / "outputs").mkdir()
    (out / "docs").mkdir()
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    manifest = {"kit": KIT_NAME, "built_at": datetime.now(UTC).isoformat(), "from_commit": commit,
                "at_build": summary()}
    (out / "kit.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    # A lockfile resolved for Windows/Linux CUDA as well as macOS, so the friend gets exact versions.
    subprocess.run(["uv", "lock", "--quiet"], cwd=out, check=True)
    archive = shutil.make_archive(str(out), "zip", out.parent, out.name)
    print(json.dumps(manifest["at_build"], indent=1))
    print(f"kit folder: {out.relative_to(ROOT)}\nkit zip:    {Path(archive).relative_to(ROOT)} "
          f"({Path(archive).stat().st_size / 1e6:.1f} MB)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["build", "absorb", "report", "pack"])
    ap.add_argument("path", nargs="?", type=Path)
    args = ap.parse_args()
    if args.command == "build":
        build()
    elif args.command == "absorb":
        if not args.path:
            raise SystemExit("usage: python -m retent_ml.kit absorb <returned kit folder, RETURN.zip or data folder>")
        absorb(args.path)
    elif args.command == "report":
        report()
    else:
        pack()


if __name__ == "__main__":
    main()
