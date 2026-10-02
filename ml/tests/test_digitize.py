"""The digitizer recovers known curves from Studio-style charts (light and dark theme)."""

import numpy as np
import pytest
from PIL import Image, ImageDraw

from retent_ml.digitize import DigitizeError, digitize


def truth(n: int = 100) -> np.ndarray:
    t = (np.arange(n) + 0.5) / n
    return 0.62 + 0.38 * np.exp(-t * 18) - 0.25 * t - 0.12 * (t > 0.92) + 0.04 * np.exp(-((t - 0.55) / 0.03) ** 2)


def render(theme: str = "light", y_top: float = 1.0, width: int = 900, height: int = 420, thick: int = 3) -> Image.Image:
    bg, grid, line, band = ((255, 255, 255), (229, 229, 229), (6, 95, 212), (236, 236, 236)) if theme == "light" else \
        ((40, 40, 40), (70, 70, 70), (62, 166, 255), (56, 56, 56))
    img = Image.new("RGB", (width, height), bg)
    d = ImageDraw.Draw(img)
    left, right, top, bottom = 60, width - 30, 30, height - 50
    d.polygon([(left, top + 60), (right, top + 180), (right, top + 240), (left, top + 110)], fill=band)
    for k in range(5):
        y = top + k * (bottom - top) / 4
        d.line([(left, y), (right, y)], fill=grid, width=1)
        d.text((10, y - 6), f"{int(round((y_top - k * y_top / 4) * 100))}%", fill=grid)
    d.text((left, bottom + 15), "0:00", fill=grid)
    d.text((right - 30, bottom + 15), "10:00", fill=grid)
    xs = np.linspace(left, right, 400)
    ys = np.interp(np.linspace(0, 1, 400), (np.arange(100) + 0.5) / 100, truth())
    pts = [(x, top + (y_top - v) / y_top * (bottom - top)) for x, v in zip(xs, ys)]
    d.line(pts, fill=line, width=thick)
    return img


@pytest.mark.parametrize("theme", ["light", "dark"])
def test_recovers_curve(theme):
    res = digitize(render(theme))
    err = np.abs(np.array(res.points) - truth())
    assert res.coverage > 0.95
    assert err.mean() < 0.015, err.mean()
    assert not [w for w in res.warnings if "outside" in w]


def test_scaled_axis():
    res = digitize(render(y_top=1.2), y_top=1.2)
    assert np.abs(np.array(res.points) - truth()).mean() < 0.015


def test_manual_rows():
    img = render()
    res = digitize(img, y_rows=(30, 370))
    assert np.abs(np.array(res.points) - truth()).mean() < 0.015


def test_no_line():
    with pytest.raises(DigitizeError):
        digitize(Image.new("RGB", (400, 300), (255, 255, 255)))
