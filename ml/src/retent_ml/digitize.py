"""Retention Import / D2: turn a YouTube Studio audience-retention screenshot into a 100-point curve.

Studio draws the retention line in a saturated blue on a light or dark background, over faint
horizontal gridlines. The digitizer:
  1. masks the blue line by colour (hue 190°–230°, high saturation), which ignores the grey
     "typical" band, the gridlines and the axis text;
  2. finds the horizontal gridlines (long, low-saturation rows that differ from the background)
     and calibrates the y axis from the top and bottom ones (default 100% and 0%; override with
     --y-top / --y-bottom when the chart is scaled differently, or pass --y-rows for manual pixels);
  3. takes the line's left and right ends as 0% and 100% of the video, reads the line centre in
     every column, and resamples to YouTube's 100-bin resolution.

Every D2 curve keeps its source URL. Check each one with the --debug overlay before training on it.

Run:
  uv run --package retent-ml python -m retent_ml.digitize shot.png --source-url URL --debug overlay.png
  uv run --package retent-ml python -m retent_ml.digitize --manifest data/raw/d2/manifest.csv
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
D2_DIR = ROOT / "data" / "raw" / "d2"
N_BINS = 100


class DigitizeError(ValueError):
    pass


@dataclass
class Result:
    points: list[float]  # retention fraction at bin centres (i + 0.5) / 100
    coverage: float  # share of columns in the line's span where the line was found
    plot: dict  # pixel calibration actually used
    warnings: list[str] = field(default_factory=list)


def _hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    x = rgb.astype(np.float32) / 255.0
    mx, mn = x.max(axis=2), x.min(axis=2)
    d = mx - mn
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    h = np.zeros_like(mx)
    safe = np.where(d == 0, 1, d)
    h = np.where(mx == r, (g - b) / safe % 6, h)
    h = np.where(mx == g, (b - r) / safe + 2, h)
    h = np.where(mx == b, (r - g) / safe + 4, h)
    h = np.where(d == 0, 0, h) * 60.0
    s = np.where(mx == 0, 0, d / np.where(mx == 0, 1, mx))
    return h, s, mx


def line_mask(rgb: np.ndarray) -> np.ndarray:
    h, s, v = _hsv(rgb)
    return (h >= 190) & (h <= 232) & (s >= 0.45) & (v >= 0.35)


def gridline_rows(rgb: np.ndarray, x0: int, x1: int) -> list[int]:
    """Centres of horizontal gridlines spanning most of [x0, x1]."""
    region = rgb[:, x0 : x1 + 1].astype(np.int16)
    bg = np.median(region.reshape(-1, 3), axis=0)
    _, s, _ = _hsv(rgb[:, x0 : x1 + 1])
    diff = np.abs(region - bg).sum(axis=2)
    grey = (diff >= 12) & (diff <= 200) & (s < 0.2)
    share = grey.mean(axis=1)
    rows = np.where(share >= 0.6)[0]
    groups: list[list[int]] = []
    for r in rows:
        if groups and r - groups[-1][-1] <= 1:
            groups[-1].append(int(r))
        else:
            groups.append([int(r)])
    return [int(round(np.mean(g))) for g in groups]


def digitize(image: Image.Image, *, y_top: float = 1.0, y_bottom: float = 0.0,
             y_rows: tuple[int, int] | None = None) -> Result:
    rgb = np.asarray(image.convert("RGB"))
    mask = line_mask(rgb)
    cols = np.where(mask.any(axis=0))[0]
    if cols.size < 50:
        raise DigitizeError("No retention line found (expected Studio's blue line).")
    # The longest run of columns with line pixels is the curve; stray blue UI bits are shorter.
    breaks = np.where(np.diff(cols) > 6)[0]
    runs = np.split(cols, breaks + 1)
    span = max(runs, key=len)
    x0, x1 = int(span[0]), int(span[-1])
    if x1 - x0 < 100:
        raise DigitizeError("The detected line is too short to be a retention curve.")

    warnings: list[str] = []
    if y_rows:
        top_px, bottom_px = y_rows
    else:
        grid = gridline_rows(rgb, x0, x1)
        if len(grid) < 2:
            raise DigitizeError("Couldn't find the gridlines; pass --y-rows TOP,BOTTOM pixel rows to calibrate.")
        top_px, bottom_px = grid[0], grid[-1]
        if len(grid) < 3:
            warnings.append("only two gridlines found; check the y calibration on the overlay")
    if bottom_px <= top_px:
        raise DigitizeError("Bad y calibration: the bottom row must be below the top row.")

    ys = np.full(x1 - x0 + 1, np.nan)
    for i, c in enumerate(range(x0, x1 + 1)):
        rows = np.where(mask[:, c])[0]
        if rows.size:
            # A thick or anti-aliased line: take the centre of the largest connected run.
            parts = np.split(rows, np.where(np.diff(rows) > 2)[0] + 1)
            ys[i] = float(np.mean(max(parts, key=len)))
    found = ~np.isnan(ys)
    coverage = float(found.mean())
    if coverage < 0.85:
        warnings.append(f"line found in only {coverage:.0%} of columns")
    idx = np.arange(ys.size)
    ys = np.interp(idx, idx[found], ys[found])
    values = y_top + (ys - top_px) * (y_bottom - y_top) / (bottom_px - top_px)

    centres = (np.arange(N_BINS) + 0.5) / N_BINS * (ys.size - 1)
    points = np.interp(centres, idx, values)
    if points.max() > 1.5 or points.min() < -0.05:
        warnings.append("values outside 0–150%; the y calibration is probably wrong")
    return Result([round(float(p), 4) for p in points], round(coverage, 3),
                  {"x0": x0, "x1": x1, "top_px": int(top_px), "bottom_px": int(bottom_px),
                   "y_top": y_top, "y_bottom": y_bottom}, warnings)


def overlay(image: Image.Image, res: Result) -> Image.Image:
    """The digitized curve redrawn in red over the screenshot, plus the calibration rows."""
    img = image.convert("RGB").copy()
    d = ImageDraw.Draw(img)
    p = res.plot
    for row in (p["top_px"], p["bottom_px"]):
        d.line([(p["x0"], row), (p["x1"], row)], fill=(255, 140, 0), width=1)
    span = p["x1"] - p["x0"]
    pts = []
    for i, v in enumerate(res.points):
        x = p["x0"] + (i + 0.5) / N_BINS * span
        y = p["top_px"] + (v - p["y_top"]) * (p["bottom_px"] - p["top_px"]) / (p["y_bottom"] - p["y_top"])
        pts.append((x, y))
    d.line(pts, fill=(220, 20, 20), width=2)
    return img


def record(res: Result, *, image: Path, source_url: str | None, video_id: str | None,
           duration: float | None) -> dict:
    return {
        "id": video_id or image.stem, "video_id": video_id, "source_url": source_url, "image": image.name,
        "duration": duration, "points": res.points, "coverage": res.coverage, "calibration": res.plot,
        "warnings": res.warnings, "digitized_at": datetime.now(UTC).isoformat(), "reviewed": False,
    }


def _parse_rows(s: str | None) -> tuple[int, int] | None:
    if not s:
        return None
    a, b = (int(v) for v in s.split(","))
    return a, b


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("image", nargs="?", type=Path)
    ap.add_argument("--manifest", type=Path, help="CSV: image,source_url,video_id,duration,y_top,y_bottom,y_rows")
    ap.add_argument("--source-url")
    ap.add_argument("--video-id")
    ap.add_argument("--duration", type=float)
    ap.add_argument("--y-top", type=float, default=1.0, help="Value of the top gridline (fraction).")
    ap.add_argument("--y-bottom", type=float, default=0.0, help="Value of the bottom gridline (fraction).")
    ap.add_argument("--y-rows", help="Manual calibration: TOP,BOTTOM pixel rows for --y-top/--y-bottom.")
    ap.add_argument("--debug", type=Path, help="Write an overlay PNG to check the result.")
    ap.add_argument("--out", type=Path, help="Output JSON (default data/raw/d2/<id>.json).")
    args = ap.parse_args()

    jobs = []
    if args.manifest:
        with args.manifest.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                jobs.append({"image": args.manifest.parent / row["image"], "source_url": row.get("source_url") or None,
                             "video_id": row.get("video_id") or None,
                             "duration": float(row["duration"]) if row.get("duration") else None,
                             "y_top": float(row.get("y_top") or 1.0), "y_bottom": float(row.get("y_bottom") or 0.0),
                             "y_rows": _parse_rows(row.get("y_rows"))})
    elif args.image:
        jobs.append({"image": args.image, "source_url": args.source_url, "video_id": args.video_id,
                     "duration": args.duration, "y_top": args.y_top, "y_bottom": args.y_bottom,
                     "y_rows": _parse_rows(args.y_rows)})
    else:
        ap.error("pass an image or --manifest")

    D2_DIR.mkdir(parents=True, exist_ok=True)
    for job in jobs:
        img = Image.open(job["image"])
        try:
            res = digitize(img, y_top=job["y_top"], y_bottom=job["y_bottom"], y_rows=job["y_rows"])
        except DigitizeError as exc:
            print(f"{job['image'].name}: FAILED {exc}", flush=True)
            continue
        rec = record(res, image=job["image"], source_url=job["source_url"], video_id=job["video_id"],
                     duration=job["duration"])
        out = args.out if (args.out and len(jobs) == 1) else D2_DIR / f"{rec['id']}.json"
        out.write_text(json.dumps(rec, indent=1), encoding="utf-8")
        debug = args.debug if (args.debug and len(jobs) == 1) else D2_DIR / "overlays" / f"{rec['id']}.png"
        debug.parent.mkdir(parents=True, exist_ok=True)
        overlay(img, res).save(debug)
        note = f" warnings: {'; '.join(res.warnings)}" if res.warnings else ""
        print(f"{job['image'].name}: ok, start {res.points[0]:.0%} → end {res.points[-1]:.0%}, "
              f"coverage {res.coverage:.0%} → {out.name}{note}", flush=True)


if __name__ == "__main__":
    main()
