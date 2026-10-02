# Team setup: Windows GPU laptops (data + ML)

For the teammates on Windows laptops with an RTX 5050 (8 GB VRAM, 24 GB RAM). The MacBook runs the UI and the demo; these machines run long collection jobs and GPU work.

## 1. One-time setup

**Native Windows works** (checked: collection, Whisper, training): install [uv](https://docs.astral.sh/uv/) and Node.js (yt-dlp uses it as its JavaScript runtime), then `cp .env.example .env` and `uv sync --all-packages`. All files are read and written as UTF-8, so Hindi text is fine without extra settings.

**Or WSL2 (Ubuntu)**, if you prefer Linux tooling:

```powershell
wsl --install -d Ubuntu        # in an admin PowerShell, then reboot
```

Inside Ubuntu:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
sudo apt update && sudo apt install -y ffmpeg git
export PYTHONUTF8=1             # Hindi text; add to ~/.bashrc
git clone <repo-url> retent && cd retent
cp .env.example .env            # add GROQ_API_KEY / ANTHROPIC_API_KEY
uv sync --all-packages
```

### GPU setup (optional: local Whisper and embeddings)

Training (LightGBM) runs on the CPU of any machine. A GPU only speeds up local Whisper and embeddings. The CUDA build of PyTorch is in the `gpu` extra, pinned to the CUDA 12.8 wheels on Windows and Linux. It works natively on Windows (checked on an RTX 4050) as well as in WSL2:

```bash
uv sync --all-packages --all-extras    # GPU machines; plain `uv sync --all-packages` elsewhere
uv run python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

RTX 50-series (Blackwell, `sm_120`) needs exactly these CUDA 12.8 builds. For local Whisper, `faster-whisper` uses `compute_type="float16"`; int8 has known cuBLAS failures on RTX 50-series GPUs. On Windows, its CUDA libraries are loaded from the torch wheel, so no separate CUDA toolkit install is needed.

## 2. Data collection (teammate A)

YouTube rate-limits caption downloads per IP, so **each teammate collecting from their own home connection is the fastest path**. Collection is resumable: stop any time, and rerun the same command to continue.

**Pass A** collects metadata and the "Most replayed" curve, and tries captions:

```bash
uv run --package retent-ml python -m retent_ml.collect --per-channel 30 --sleep 2.5
# split the work between machines by cell:
uv run --package retent-ml python -m retent_ml.collect --only tech/hi
uv run --package retent-ml python -m retent_ml.collect --only education/hi
uv run --package retent-ml python -m retent_ml.collect --only vlog/hi
```

**Pass B** fills in captions that were rate-limited during pass A. It backs off automatically on HTTP 429:

```bash
uv run --package retent-ml python -m retent_ml.collect --captions --sleep 4
```

**Pass C** transcribes videos with no caption track (kept by pass A with caption status `none`) using Groq Whisper. It needs `GROQ_API_KEY` in `.env` and no GPU or ffmpeg. Groq's free tier allows about 2 hours of audio per hour, so each run is capped by `--max-minutes`:

```bash
uv run --package retent-ml python -m retent_ml.asr                     # missing captions
uv run --package retent-ml python -m retent_ml.asr --include-pending   # also the 429-blocked ones
```

**Local Whisper (GPU, no quota):** `uv run --package retent-ml python -m retent_ml.asr --engine local`.

**Captions in the wrong language:** some Hindi creators leave the video language set to English, so the collector now picks captions by the *spoken* language (YouTube's `-orig` ASR track). Records collected before that fix are repaired with:

```bash
uv run --package retent-ml python -m retent_ml.collect --fix-language
```

The collector visits channels round-robin across cells, 12 probes per channel per run (`--per-channel`), so each run adds channel diversity. Rerun it to go deeper.

yt-dlp needs a JavaScript runtime for YouTube. The collector uses `deno` if installed, otherwise `node`. Without either, video details and captions come back empty.

Seeds (162 channels across 6 cells) are in `ml/seeds/channels.json`. Regenerate them with `python -m retent_ml.seeds`.

What the spike showed (2026-10-02):
- YouTube only serves "Most replayed" for some videos (about 6 in 16), skewed toward videos older than about a month. Expect to probe 2–3× more videos than you keep.
- Hindi videos expose original-language ASR captions as `hi-orig`, and the collector prefers them.
- Caption downloads hit HTTP 429 after roughly 20 requests from one IP. Pass B and the backoff handle this.

### Other datasets

```bash
uv run --package retent-ml python -m retent_ml.sponsorblock     # D3: SponsorBlock segments for every D1 video
uv run --package retent-ml python -m retent_ml.media --limit 300  # D1-media: audio + 144p video (stays local)
uv run --package retent-ml python -m retent_ml.datacard          # regenerate docs/DATA_CARD.md
```

**D2 (Studio screenshots):** save each public retention screenshot to `data/raw/d2/`, add a row to `data/raw/d2/manifest.csv` (`image,source_url,video_id,duration,y_top,y_bottom,y_rows`), then run `python -m retent_ml.digitize --manifest data/raw/d2/manifest.csv`. Check every overlay in `data/raw/d2/overlays/` and set `"reviewed": true` in the JSON only when the red line sits on the blue one. If the chart's top gridline isn't 100%, set `y_top` (e.g. `1.2`).

## 3. Sharing data

`data/` is gitignored. Records go through the team's private Hugging Face dataset repo. Set `HF_TOKEN` and `RETENT_HF_DATASET` in `.env`, then:

```bash
uv run --package retent-ml python -m retent_ml.hub push    # after collecting
uv run --package retent-ml python -m retent_ml.hub pull    # before training; also merges probe logs
```

## 4. Rules

- Never commit `.env`.
- Commit messages carry no AI co-author lines.
