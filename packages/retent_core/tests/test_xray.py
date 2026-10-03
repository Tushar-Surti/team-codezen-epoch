"""Channel X-Ray: a moment that consistently drops the real curve is reported as a costly pattern."""

import numpy as np

from retent_core.contract import N_BINS
from retent_core.xray import aggregate


def _video(i: int, dip_at: float | None, rng: np.random.Generator, channel: str) -> dict:
    dur = 600.0
    mids = (np.arange(N_BINS) + 0.5) / N_BINS * dur
    heat = 0.5 + 0.4 * np.exp(-mids / 40) + rng.normal(0, 0.01, N_BINS)
    moments = []
    if dip_at is not None:
        heat = heat - 0.25 * ((mids >= dip_at) & (mids < dip_at + 45))
        moments.append({"kind": "sponsor", "start": dip_at, "end": dip_at + 45, "text": "This video is sponsored by"})
    z = (heat - heat.mean()) / heat.std()
    return {"id": f"{channel}{i}", "channel_id": channel, "duration": dur, "heat": heat.tolist(), "z": z.tolist(),
            "rel": float(heat.std() / heat.max()), "has_transcript": True, "moments": moments,
            "habits": {"duration_min": 10.0, "has_sponsor": dip_at is not None}, "fit": 0.3}


def test_consistent_sponsor_dip_is_a_costly_pattern():
    rng = np.random.default_rng(0)
    channel = [_video(i, 200.0 + 20 * i, rng, "me") for i in range(5)]
    others = [_video(i, None, rng, "other") for i in range(12)]
    rep = aggregate(channel, others)
    sponsor = next(p for p in rep["patterns"] if p["kind"] == "sponsor")
    assert sponsor["verdict"] == "hurts"
    assert sponsor["strength"] == "clear"
    assert sponsor["videos"] == 5 and sponsor["effect_pts"] < -5
    assert rep["advice"] and rep["advice"][0]["kind"] == "sponsor"
    assert len(sponsor["trace"]) == len(sponsor["offsets"])


def test_one_video_is_never_a_pattern():
    rng = np.random.default_rng(1)
    channel = [_video(0, 200.0, rng, "me")] + [_video(i, None, rng, "me") for i in range(1, 4)]
    rep = aggregate(channel, [_video(i, None, rng, "other") for i in range(12)])
    sponsor = next(p for p in rep["patterns"] if p["kind"] == "sponsor")
    assert sponsor["verdict"] == "mixed"
    assert not rep["advice"]
