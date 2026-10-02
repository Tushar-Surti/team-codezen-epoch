# Setup and data collection (MacBook Air M3)

Everything runs on one **MacBook Air M3 (16 GB)**: the UI, the API, data collection, transcription, training and the demo. See [PLAN.md §9](PLAN.md#9-one-machine-the-macbook-air-m3) for why.

**Rule of thumb:** the Air has no fan and is also the demo machine. Run heavy jobs (collection pass A, local Whisper, training) **overnight, plugged in**, and **never while presenting**.

## 1. One-time setup

```bash
brew install uv node            # node doubles as yt-dlp's JavaScript runtime
cp .env.example .env            # add GROQ_API_KEY (required) and ANTHROPIC_API_KEY (optional, enables Claude)
uv sync --all-packages          # Python workspace
cd apps/web && corepack pnpm install && cd ../..
```

Run the app:

```bash
pnpm dev:api                    # API on http://127.0.0.1:8000
pnpm dev:web                    # Web on http://localhost:3000
```

## 2. Data collection

Collection is resumable: stop any time, and rerun the same command to continue. Logs go to `data/collect.log` and `data/asr.log` when run in the background.

**Pass A**: metadata, the "Most replayed" curve and chapters; tries captions. Focus on the cells that are short:

```bash
uv run --package retent-ml python -m retent_ml.collect --only vlog/en,vlog/hi,education/en,education/hi,tech/hi --sleep 2.5
```

**Pass B**: captions that were rate-limited during pass A. It backs off on HTTP 429. With one internet connection this is slow. A phone hotspot works as an optional second connection for this pass only.

```bash
uv run --package retent-ml python -m retent_ml.collect --captions --sleep 4
```

**Pass C**: transcribe from the audio when captions are missing or blocked. The audio is downloaded to a temporary folder (about 5 MB for 15 minutes) and deleted straight after.

```bash
# Groq Whisper: fast; free tier ≈ 2 h of audio per hour and 8 h per day, so runs are capped
uv run --package retent-ml python -m retent_ml.asr --include-pending --only tech/hi,education/hi,vlog/hi --max-minutes 110

# Local Whisper on the Mac's GPU (MLX, no quota): for overnight runs, being added (see TASKS.md)
uv run --package retent-ml python -m retent_ml.asr --include-pending --engine local
```

**Captions in the wrong language:** some Hindi creators leave the video language set to English. The collector picks captions by the *spoken* language (YouTube's `-orig` track). Older records are repaired with:

```bash
uv run --package retent-ml python -m retent_ml.collect --fix-language
```

**Check quality** after every run:

```bash
uv run --package retent-ml python -m retent_ml.audit       # per-record verdicts → data/derived/audit.json
uv run --package retent-ml python -m retent_ml.datacard    # regenerate docs/DATA_CARD.md
```

### What the Phase 0 spike showed
- YouTube serves "Most replayed" for only some videos (about 6 in 16), skewed toward uploads older than about a month. Expect to probe 2–3× more videos than you keep.
- Hindi videos expose original-language ASR captions as `hi-orig`, and the collector prefers them.
- Caption downloads hit HTTP 429 after roughly 20 requests from one connection. Passes B and C handle this.
- yt-dlp needs a JavaScript runtime (`deno` if installed, otherwise `node`). Without one, video details and captions come back empty.

Seeds (162 channels across 6 cells) are in `ml/seeds/channels.json`. Regenerate them with `python -m retent_ml.seeds`.

### Other datasets

```bash
uv run --package retent-ml python -m retent_ml.sponsorblock       # D3: SponsorBlock segments for every D1 video
uv run --package retent-ml python -m retent_ml.media --limit 120  # D1-media: audio + 144p video (stays on the Mac)
```

**D2 (Studio screenshots):** save each public retention screenshot to `data/raw/d2/`, add a row to `data/raw/d2/manifest.csv` (`image,source_url,video_id,duration,y_top,y_bottom,y_rows`), then run `python -m retent_ml.digitize --manifest data/raw/d2/manifest.csv`. Check every overlay in `data/raw/d2/overlays/`, and set `"reviewed": true` in the JSON only when the red line sits on the blue one. If the chart's top gridline isn't 100%, set `y_top` (e.g. `1.2`).

## 3. GPU kit: hand the heavy work to a friend's NVIDIA laptop

Build the kit (code plus every collected video; about 2 MB):

```bash
uv run --package retent-ml python -m retent_ml.kit build      # → handoff/retent-gpu-kit.zip
```

Send `handoff/retent-gpu-kit.zip` to your friend. Their instructions are in the kit's `README.md`: install uv and Node, then run one command:

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1 -ExistingData "C:\path\to\their\old\retent\data\raw\d1"
```

It merges their earlier videos, collects more for the thin cells, fetches captions from their connection, transcribes the rest with Whisper large-v3 on the GPU, adds SponsorBlock, audits, and writes `RETURN.zip`. When it comes back:

```bash
uv run --package retent-ml python -m retent_ml.kit absorb ~/Downloads/RETURN.zip
```

The merge keeps the best text for each video (creator captions > YouTube auto > Whisper), adds new videos, merges the probe log, and saves their report under `data/derived/kit-returns/`.

## 4. Backup

`data/` is gitignored and the whole dataset is under 100 MB. Back it up to the private Hugging Face dataset repo with `python -m retent_ml.hub push`.

## 5. Rules

- Never commit `.env`.
- Commit messages carry no AI co-author lines.
