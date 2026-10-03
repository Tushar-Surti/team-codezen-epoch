# Retent AI

**Predict the drop. Fix the video. Keep them watching.**

Retent AI reads a video script (before you shoot) or transcript (before you publish), predicts the audience-retention curve, flags each likely drop-off with evidence, writes the fix, and re-simulates the edited version to show what the fix is worth. English, Hindi and Hinglish; 5–15 minute tech reviews, explainers and vlogs.

- Plan and architecture: [docs/PLAN.md](docs/PLAN.md)
- Task tracker (what's done and what's left): [docs/TASKS.md](docs/TASKS.md)
- Product record: [PRODUCT.md](PRODUCT.md)
- Setup and data collection (MacBook): [docs/SETUP.md](docs/SETUP.md)

## Quick start

### 1. Install the tools (once)

| Tool | Why | Windows | macOS | Linux |
|---|---|---|---|---|
| [Node.js 20+](https://nodejs.org) | Web app (includes `corepack`/pnpm) | installer from nodejs.org | `brew install node` | nodejs.org or your package manager |
| [uv](https://docs.astral.sh/uv/) | Python and the API (installs Python 3.12 for you) | `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"` | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | same as macOS |
| [ffmpeg](https://ffmpeg.org) *(optional)* | Rough-cut uploads, Studio overlays, Shorts rendering | `winget install Gyan.FFmpeg` | `brew install ffmpeg` | `sudo apt install ffmpeg` |

Open a **new** terminal after installing so the tools are on your PATH.

### 2. Start everything

From the repo root:

| Windows | macOS / Linux | Any OS with pnpm |
|---|---|---|
| double-click **`start.cmd`**, or run `.\start.cmd` | `sh start.sh` | `pnpm start` |

The first run takes a few minutes: it creates `.env`, installs the Python and web packages, then starts the API and the web app together and opens http://localhost:3000. Later runs start in seconds. Press **Ctrl+C** to stop both.

| Option | What it does |
|---|---|
| `--prod` | Builds the web app and serves the production build (or `pnpm start:prod`) |
| `--no-open` | Doesn't open the browser |
| `--skip-install` | Skips the package checks |

Pass options after the command, e.g. `.\start.cmd --prod` or `sh start.sh --no-open`.

### 3. Add API keys (recommended)

The app runs without keys, but the language-model features need them. Put them in `.env` (created on first start) and restart:

| Key | What it unlocks |
|---|---|
| `GROQ_API_KEY` (free at [console.groq.com](https://console.groq.com)) | The LLM read of the script (hooks, promises, loops), fixes written in your voice, Hook Lab, Shorts packaging, and Whisper transcription for uploads and YouTube videos without captions. Several keys can go in `GROQ_API_KEYS`, comma-separated. |
| `ANTHROPIC_API_KEY` | The "deep" engine (Claude) for the read and the fixes. |
| `YOUTUBE_API_KEY`, `HF_TOKEN` | Optional: data collection and team data sharing. |

Without keys, scripts are analysed with keyword rules, and the retention curve still comes from the trained model.

### 4. Try it

- **New analysis** (http://localhost:3000/new): click **Load the sample script**, then **Predict the drop**. You can also paste a public YouTube link or upload a rough cut.
- Open the ready-made sample: http://localhost:3000/a/sample-hinglish-tech

## What's in the app

| Page | What it does |
|---|---|
| **Projects** | Every analysis you've run, plus development samples |
| **New analysis** | Script, YouTube link, or rough-cut upload → retention curve, drop-off flags, fixes, simulation |
| **Hook Lab** | Writes alternative openings and ranks them by predicted intro retention |
| **Shorts** | Finds the 3–4 strongest 22–58 s clips in a long video, packages them, and renders vertical Shorts |
| **Accuracy** | How well the model predicts real YouTube "Most replayed" curves on held-out channels, against baselines |
| **Blind test** | The model predicts a video from a channel it never trained on, then YouTube's real curve is revealed next to it |
| **Channel X-Ray** | Scans a channel's recent videos against their real curves and reports which habits cost viewers |
| **Studio check** | Upload a YouTube Studio retention screenshot and compare it with the prediction |

The API's interactive docs are at http://127.0.0.1:8000/docs.

## Troubleshooting

| Problem | Fix |
|---|---|
| `uv isn't installed` / `node` not found | Install it (table above), then open a **new** terminal. |
| `Port 3000 (or 8000) is already in use` | Another copy is running. Stop it, or find it with `netstat -ano \| findstr :3000` (Windows) or `lsof -i :3000` (macOS/Linux). |
| "ffmpeg not found" warning | Only uploads, Studio overlays and Shorts rendering need it. Install it and open a new terminal. |
| A YouTube link says captions are blocked | YouTube rate-limits captions per connection. With `GROQ_API_KEY` set, the audio is transcribed with Whisper instead. |
| "Sign in to confirm you're not a bot" | YouTube is blocking this connection for now. Try again later, or use a dataset channel in Channel X-Ray. |
| `sh: start.sh: Permission denied` | Run it as `sh start.sh` rather than `./start.sh`. |

## Development

### Run the parts separately

```bash
cp .env.example .env            # add GROQ_API_KEY / ANTHROPIC_API_KEY
uv sync --all-packages          # Python workspace
corepack pnpm install           # web packages

pnpm dev:api                    # API on http://127.0.0.1:8000
pnpm dev:web                    # Web on http://localhost:3000
```

### Checks

```bash
uv run pytest                                   # core + API tests
corepack pnpm --filter web typecheck            # TypeScript
corepack pnpm --filter web build                # production build
```

Browser flows live in `apps/web/scripts/e2e-*.mjs` (Playwright). Start the app, then run them from `apps/web` (they save screenshots to `.impeccable/review/`):

```bash
corepack pnpm --filter web exec playwright install chromium    # once
cd apps/web && node scripts/e2e-intake.mjs
```

`e2e-import.mjs` takes a Studio screenshot path and `e2e-upload.mjs` a video path as their argument.

### The contract

`packages/retent_core/src/retent_core/contract.py` defines every shape the system exchanges (Pydantic). After changing it:

```bash
pnpm contract                   # writes JSON Schema and regenerates apps/web/src/lib/contract.gen.ts
```

### The model

The interest model is LightGBM on the engine's text features, trained on public videos' YouTube "Most replayed" curves and evaluated on channels it never saw. The files are in `models/`; the Accuracy page and `models/model_card.json` show what it was trained on and how well it does. To retrain on the collected data in `data/raw/d1`:

```bash
uv run --package retent-ml python -m retent_ml.train                  # add --llm-baseline to compare with a zero-shot LLM (uses Groq)
```

The API loads the new model the next time it starts.

## Layout

```
start.cmd, start.sh       One-command start (scripts/start.mjs)
apps/web/                 Next.js 16 app (Workspace, intake, labs)
services/api/             FastAPI: analysis jobs, SSE progress, simulation
packages/retent_core/     Shared core: contract, text, features, engine, flags, simulator
ml/                       Offline: seed discovery, D1 collection, fixtures, training, eval
fixtures/                 Sample scripts + development analyses
models/                   Trained artifacts, priors, eval report (generated)
data/                     Collected data (gitignored; shared via HF dataset repo)
```

## Honesty rules

- The curve comes from the retention engine, never from an LLM.
- Until baseline parameters are fitted on real Studio curves, curves are labelled **uncalibrated**.
- Fixture analyses are labelled **Development data**. No metric in the UI is typed in by hand.
