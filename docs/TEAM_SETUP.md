# Team setup: Windows GPU laptops (data + ML)

For the teammates on Windows laptops with an RTX 5050 (8 GB VRAM, 24 GB RAM). The MacBook runs the UI and the demo; these machines run long collection jobs and GPU work.

## 1. One-time setup (WSL2)

Run the Python pipeline inside **WSL2 (Ubuntu)**, not native Windows.

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

### GPU check (RTX 50-series needs CUDA 12.8 builds)

The RTX 5050 is a Blackwell GPU (`sm_120`). Older PyTorch builds don't see it.

```bash
uv pip install "torch>=2.7" --index-url https://download.pytorch.org/whl/cu128
uv run python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0)); print((torch.randn(2048,2048,device='cuda')@torch.randn(2048,2048,device='cuda')).sum().item())"
```

For local Whisper: `faster-whisper` with **CTranslate2 ≥ 4.5**, and `compute_type="float16"`. int8 has known cuBLAS failures on RTX 50-series GPUs.

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

yt-dlp needs a JavaScript runtime for YouTube. The collector uses `deno` if installed, otherwise `node`. Without either, video details and captions come back empty.

Seeds (162 channels across 6 cells) are in `ml/seeds/channels.json`. Regenerate them with `python -m retent_ml.seeds`.

What the spike showed (2026-10-02):
- YouTube only serves "Most replayed" for some videos (about 6 in 16), skewed toward videos older than about a month. Expect to probe 2–3× more videos than you keep.
- Hindi videos expose original-language ASR captions as `hi-orig`, and the collector prefers them.
- Caption downloads hit HTTP 429 after roughly 20 requests from one IP. Pass B and the backoff handle this.

## 3. Sharing data

`data/` is gitignored. Push collected records to the team's private Hugging Face dataset repo:

```bash
uv run --with huggingface_hub huggingface-cli upload <org>/retent-d1 data/raw/d1 d1 --repo-type dataset
```

## 4. Rules

- Never commit `.env`.
- Commit messages carry no AI co-author lines.
