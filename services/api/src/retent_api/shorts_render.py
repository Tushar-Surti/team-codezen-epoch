"""Render a vertical Short (1080×1920) from a section of a public YouTube video.

Downloads only the clip's section (yt-dlp --download-sections), then ffmpeg composes: blurred fill
background, the full original frame centred (nothing important cropped away), a hook card for the
first seconds and a "Watch the full video" end card. Text cards are drawn with Pillow (this ffmpeg
build has no drawtext). Output goes to data/shorts/.
"""

from __future__ import annotations

import hashlib
import subprocess
import tempfile
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from retent_ml.collect import _ydl

ROOT = Path(__file__).resolve().parents[4]
OUT_DIR = ROOT / "data" / "shorts"
W, H = 1080, 1920
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"
INK, PAPER, PEN, BRASS = (23, 23, 26), (247, 248, 245), (215, 38, 30), (215, 178, 90)


def _font(path: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default(size)


def hook_card(text: str, path: Path) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = _font(FONT_BLACK, 74)
    lines = textwrap.wrap(text.upper(), width=18)[:3]
    y = 230
    for line in lines:
        bbox = d.textbbox((0, 0), line, font=font)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (W - w) // 2
        d.rounded_rectangle((x - 28, y - 18, x + w + 28, y + h + 30), radius=18, fill=(*PAPER, 245))
        d.text((x, y - bbox[1] // 2), line, font=font, fill=INK)
        y += h + 58
    d.rounded_rectangle((W // 2 - 70, y + 8, W // 2 + 70, y + 16), radius=4, fill=PEN)  # red-pen underline
    img.save(path)


def end_card(channel: str, title: str, path: Path) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    top = 1300
    d.rounded_rectangle((70, top, W - 70, top + 430), radius=36, fill=(27, 36, 64, 240))
    big, small = _font(FONT_BLACK, 70), _font(FONT_BOLD, 40)
    d.polygon([(130, top + 92), (130, top + 168), (196, top + 130)], fill=BRASS)  # play triangle
    d.text((226, top + 80), "Watch the", font=big, fill=PAPER)
    d.text((226, top + 160), "full video", font=big, fill=BRASS)
    for k, line in enumerate(textwrap.wrap(title, width=38)[:2]):
        d.text((130, top + 278 + k * 50), line, font=small, fill=(238, 240, 246))
    d.text((130, top + 378 - 6), f"{channel} · tap the link below", font=_font(FONT_BOLD, 32), fill=(170, 179, 202))
    img.save(path)


def render(video_id: str, start: float, end: float, hook_text: str, channel: str, title: str) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(f"{video_id}|{start:.1f}|{end:.1f}|{hook_text}".encode()).hexdigest()[:12]
    out = OUT_DIR / f"{video_id}-{key}.mp4"
    if out.exists():
        return out
    dur = end - start
    with tempfile.TemporaryDirectory() as tmp:
        tmpd = Path(tmp)
        opts = {"skip_download": False, "format": "bv*[height<=720]+ba/b[height<=720]/b",
                "download_ranges": lambda info, ydl: [{"start_time": start, "end_time": end}],
                "force_keyframes_at_cuts": False, "paths": {"home": tmp}, "outtmpl": {"default": "src.%(ext)s"},
                "merge_output_format": "mp4",
                "extractor_args": {"youtube": {"player_client": ["web_embedded", "mweb", "default"]}}}
        with _ydl(**opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
        src = next((p for p in tmpd.iterdir() if p.name.startswith("src.") and p.suffix in (".mp4", ".mkv", ".webm")), None)
        if src is None:
            raise RuntimeError("YouTube didn't return the video section")
        hook_card(hook_text, tmpd / "hook.png")
        end_card(channel, title, tmpd / "end.png")
        graph = (
            f"[0:v]split=2[a][b];"
            f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=24:2[bg];"
            f"[b]scale={W}:-2[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2[v1];"
            f"[v1][1:v]overlay=0:0:enable='between(t,0,4)'[v2];"
            f"[v2][2:v]overlay=0:0:enable='gte(t,{max(0.0, dur - 3.5):.2f})'[v]"
        )
        cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(src),
               "-loop", "1", "-i", str(tmpd / "hook.png"), "-loop", "1", "-i", str(tmpd / "end.png"),
               "-filter_complex", graph, "-map", "[v]", "-map", "0:a?", "-t", f"{dur:.2f}",
               "-c:v", "h264_videotoolbox", "-b:v", "6M", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            cmd[cmd.index("h264_videotoolbox")] = "libx264"  # software fallback
            proc = subprocess.run(cmd, capture_output=True, text=True)
            if proc.returncode != 0:
                raise RuntimeError(f"ffmpeg failed: {proc.stderr[-300:]}")
    return out
