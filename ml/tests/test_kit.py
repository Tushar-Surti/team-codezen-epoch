"""GPU kit merging: the better copy of a record wins, nothing is lost, probe logs merge."""

import json
import zipfile

from retent_ml.kit import absorb, text_rank


def _rec(vid, status="ok", kind="auto", n=30):
    segs = [{"start": i, "end": i + 1, "text": "x"} for i in range(n if status == "ok" else 0)]
    return {"id": vid, "category": "tech", "seed_lang": "hi",
            "caption": {"status": status, "kind": kind, "segments": segs}}


def test_text_rank_prefers_usable_then_creator_captions():
    assert text_rank(_rec("a", "ok", "asr")) > text_rank(_rec("a", "pending", None))
    assert text_rank(_rec("a", "ok", "manual")) > text_rank(_rec("a", "ok", "asr"))
    assert text_rank(_rec("a", "ok", "auto")) > text_rank(_rec("a", "ok", "asr"))


def test_absorb_adds_improves_keeps_and_merges_log(tmp_path):
    mine = tmp_path / "mine"
    (mine / "d1").mkdir(parents=True)
    for r in (_rec("keep", "ok", "manual"), _rec("improve", "pending", None)):
        (mine / "d1" / f"{r['id']}.json").write_text(json.dumps(r))
    (mine / "d1" / "_probed.jsonl").write_text('{"id": "keep", "status": "kept"}\n')

    kit = tmp_path / "kit" / "data" / "raw" / "d1"
    kit.mkdir(parents=True)
    # Real YouTube ids can start with "_" or "-": they must not be skipped.
    for r in (_rec("keep", "ok", "asr"), _rec("improve", "ok", "asr"), _rec("_new", "ok", "asr"), _rec("-new2", "ok", "asr")):
        (kit / f"{r['id']}.json").write_text(json.dumps(r))
    (kit / "_probed.jsonl").write_text('{"id": "keep", "status": "kept"}\n{"id": "z", "status": "no_heatmap"}\n')
    zpath = tmp_path / "RETURN.zip"
    with zipfile.ZipFile(zpath, "w") as z:
        for f in kit.iterdir():
            z.write(f, f"data/raw/d1/{f.name}")

    stats = absorb(zpath, verbose=False, d1_dir=mine / "d1", probed_log=mine / "d1" / "_probed.jsonl",
                   d3_dir=mine / "d3")
    assert stats["added"] == 2 and stats["improved"] == 1 and stats["kept"] == 1 and stats["probe_lines"] == 1
    assert json.loads((mine / "d1" / "keep.json").read_text())["caption"]["kind"] == "manual"
    assert json.loads((mine / "d1" / "improve.json").read_text())["caption"]["status"] == "ok"
