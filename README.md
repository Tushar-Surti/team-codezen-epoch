# Retent AI

**Predict the drop. Fix the video. Keep them watching.**

Retent AI reads a video script (before you shoot) or transcript (before you publish), predicts the audience-retention curve, flags each likely drop-off with evidence, writes the fix, and re-simulates the edited version to show what the fix is worth. English, Hindi and Hinglish; 5–15 minute tech reviews, explainers and vlogs.

- Plan and architecture: [docs/PLAN.md](docs/PLAN.md)
- Task tracker (what's done and what's left): [docs/TASKS.md](docs/TASKS.md)
- Product record: [PRODUCT.md](PRODUCT.md)
- Teammate machine setup and data collection: [docs/TEAM_SETUP.md](docs/TEAM_SETUP.md)

## Layout

```
apps/web/                 Next.js 16 app (Workspace, intake, labs)
services/api/             FastAPI: analysis jobs, SSE progress, simulation
packages/retent_core/     Shared core: contract, text, features, engine, flags, simulator
ml/                       Offline: seed discovery, D1 collection, fixtures, (training, eval)
fixtures/                 Sample scripts + development analyses
models/                   Trained artifacts, priors, eval report (generated)
data/                     Collected data (gitignored; shared via HF dataset repo)
```

## Run it locally

Requirements: Python via [uv](https://docs.astral.sh/uv/), Node 20+ with `corepack` (pnpm).

```bash
cp .env.example .env            # add ANTHROPIC_API_KEY and GROQ_API_KEY
uv sync --all-packages          # Python workspace
corepack pnpm install           # web deps (run inside apps/web the first time)

pnpm dev:api                    # API on http://127.0.0.1:8000
pnpm dev:web                    # Web on http://localhost:3000

uv run pytest                   # core + API tests
```

Open http://localhost:3000/new and click **Load the sample script**, or open the sample analysis at http://localhost:3000/a/sample-hinglish-tech.

## The contract

`packages/retent_core/src/retent_core/contract.py` defines every shape the system exchanges (Pydantic). After changing it:

```bash
pnpm contract                   # writes JSON Schema and regenerates apps/web/src/lib/contract.gen.ts
```

## Honesty rules

- The curve comes from the retention engine, never from an LLM.
- Until baseline parameters are fitted on real Studio curves, curves are labelled **uncalibrated**.
- Fixture analyses are labelled **Development data**. No metric in the UI is typed in by hand.
