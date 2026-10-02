"""Build development fixtures: real engine output on real public captions + authored sample scripts.

Fixtures are marked synthetic=True so the UI labels them as development data.
Run: uv run --package retent-ml python -m retent_ml.make_fixtures
"""

from __future__ import annotations

import json
from pathlib import Path

from dotenv import load_dotenv

from retent_core.contract import Category, Engine, InputMode, Language, VideoMeta
from retent_core.llm import LLMError
from retent_core.semantic import read_script, write_fixes
from retent_core.pipeline import analyze_sentences, sentences_from_captions, sentences_from_script
from retent_core.text import detect_language

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw" / "d1"
SAMPLES = ROOT / "fixtures" / "samples"
OUT = ROOT / "fixtures" / "analyses"
ENGINE = Engine.auto


def _semantic_and_writer(sents, meta: VideoMeta):
    """Same path as the API: LLM read + LLM-written fixes when a key is set, keyword rules otherwise."""
    try:
        sem = read_script(sents, meta.title, meta.thumbnail_text, meta.category, ENGINE)
    except LLMError:
        return None, None, {}
    def writer(flags, fixes, payoff_id):
        return write_fixes(sents, meta.title, flags, fixes, ENGINE, payoff_id)[0]
    return sem, writer, {"_semantic": sem.to_json()}


def from_sample(path: Path) -> dict:
    s = json.loads(path.read_text(encoding="utf-8"))
    sents = sentences_from_script(s["script"])
    meta = VideoMeta(title=s["title"], category=Category(s["category"]), language=detect_language(s["script"]),
                     thumbnail_text=s.get("thumbnail_text"), input_mode=InputMode.script, duration_seconds=0)
    sem, writer, extra = _semantic_and_writer(sents, meta)
    a = analyze_sentences(sents, meta, synthetic=True, timing="estimated", analysis_id=s["id"],
                          semantic=sem, writer=writer, engine=ENGINE)
    return {**json.loads(a.model_dump_json()), **extra}


def from_record(path: Path) -> dict | None:
    r = json.loads(path.read_text(encoding="utf-8"))
    if r["caption"].get("status", "ok") != "ok" or not r["caption"]["segments"]:
        return None
    sents = sentences_from_captions(r["caption"]["segments"])
    lang = Language.hi if r["caption"]["lang"] == "hi" else Language.en
    meta = VideoMeta(title=r["title"], category=Category(r["category"]), language=lang, input_mode=InputMode.url,
                     duration_seconds=r["duration"], source_url=f"https://www.youtube.com/watch?v={r['id']}",
                     channel=r.get("channel"))
    sem, writer, extra = _semantic_and_writer(sents, meta)
    a = analyze_sentences(sents, meta, synthetic=True, timing="measured", chapters=r.get("chapters"),
                          analysis_id=f"yt-{r['id']}", semantic=sem, writer=writer, engine=ENGINE)
    out = {**json.loads(a.model_dump_json()), **extra}
    # Keep the real "Most replayed" curve beside the fixture for the blind-test / overlay views.
    out["_heatmap"] = r["heatmap"]
    return out


def main() -> None:
    load_dotenv(ROOT / ".env")
    OUT.mkdir(parents=True, exist_ok=True)
    index = []
    for p in sorted(SAMPLES.glob("*.json")):
        a = from_sample(p)
        (OUT / f"{a['id']}.json").write_text(json.dumps(a, ensure_ascii=False), encoding="utf-8")
        index.append({"id": a["id"], "title": a["meta"]["title"], "kind": "sample"})
    # A balanced handful of public videos that have text: up to 2 per (category, language) cell.
    picked: dict[str, list[Path]] = {}
    for p in sorted(RAW.glob("*.json")):
        r = json.loads(p.read_text(encoding="utf-8"))
        if r["caption"].get("status") == "ok" and len(r["caption"].get("segments") or []) >= 20:
            cell = f"{r['category']}/{r['caption'].get('lang') or r['seed_lang']}"
            if len(picked.setdefault(cell, [])) < 2:
                picked[cell].append(p)
    for p in [x for group in picked.values() for x in group]:
        a = from_record(p)
        if a:
            (OUT / f"{a['id']}.json").write_text(json.dumps(a, ensure_ascii=False), encoding="utf-8")
            index.append({"id": a["id"], "title": a["meta"]["title"], "kind": "public"})
    (OUT / "index.json").write_text(json.dumps(index, indent=1, ensure_ascii=False), encoding="utf-8")
    for row in index:
        a = json.loads((OUT / f"{row['id']}.json").read_text(encoding="utf-8"))
        m = a["metrics"]
        print(f"{row['id']:22s} intro={m['intro_retention']:.2f} apv={m['apv']:.2f} flags={len(a['flags'])}")
        for f in a["flags"][:6]:
            d = next((x["delta"] for x in a["fixes"] if x["flag_id"] == f["id"]), None)
            gain = f" | fix Δpayoff={d['viewers_at_payoff']} Δintro={d['intro_retention']:+.3f} Δruntime={d['runtime_seconds']}" if d else ""
            print(f"    {f['kind']:15s} sev{f['severity']} lost={f['viewers_lost']:6.1f}  {f['title']}{gain}")


if __name__ == "__main__":
    main()
