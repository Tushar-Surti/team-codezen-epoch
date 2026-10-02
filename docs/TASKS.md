# Retent AI: task tracker

Status: ✅ done · 🟡 partly done · ⬜ not started · ⛔ blocked
Owners: **You** (Mac, UI and demo) · **Data** (Windows laptop A) · **ML** (Windows laptop B). Claude helps on any task, but never commits.
IDs such as `A1` and `E2` refer to the feature tables in [PLAN.md §3](PLAN.md#3-feature-set).

Update this file whenever a task changes state; it is the single source of truth for what's left.

## Progress at a glance

| Phase | Done | Partial | Left |
|---|---|---|---|
| 0. Foundations | 6 | 3 | 0 |
| 1. Data | 3 | 6 | 0 |
| 2. Model & evaluation | 4 | 0 | 13 |
| 3. Core loop | 11 | 1 | 1 |
| 4. Differentiators | 0 | 4 | 10 |
| 5. Validation & discovery | 0 | 0 | 5 |
| 6. Finish | 0 | 1 | 7 |
| 7. Pitch kit | 1 | 1 | 4 |
| 8. Showstoppers | 0 | 0 | 5 |
| **Total** | **25** | **16** | **45** |

---

## Phase 0: Foundations

| Task | Owner | Status | Notes |
|---|---|---|---|
| `Analysis` contract (Pydantic → JSON Schema → TypeScript) | Claude | ✅ | `packages/retent_core/src/retent_core/contract.py`, `pnpm contract` |
| Data spike: "Most replayed", captions, chapters | Claude | ✅ | About 6 in 16 videos have the curve; captions return 429 per IP |
| Seed channels for all 6 cells | Claude | ✅ | 162 channels in `ml/seeds/channels.json` |
| impeccable init → PRODUCT.md | You + Claude | ✅ | |
| Visual direction chosen | You | ✅ | Revision Draft; brief in `apps/web/.impeccable/surfaces/` |
| Monorepo scaffold (uv + pnpm) | Claude | ✅ | |
| Add `ANTHROPIC_API_KEY` and `GROQ_API_KEY` to `.env` | You | 🟡 | Groq added and verified; Anthropic still missing (blocks Claude tasks) |
| WSL2 + CUDA 12.8 + PyTorch setup on both Windows laptops | Data, ML | 🟡 | Laptop with RTX 4050 done natively (torch 2.11 cu128, faster-whisper on GPU); second laptop: `uv sync --all-packages --all-extras` |
| Screenshot digitizer prototype (5 Studio screenshots) | ML | 🟡 | `retent_ml.digitize` built and tested on synthetic light/dark charts; needs 5 real screenshots |

## Phase 1: Data

| Task | Owner | Status | Notes |
|---|---|---|---|
| D1 pass A: metadata + "Most replayed" | Data | 🟡 | Mac: 105 tech/en. Windows: 108 across 4 cells, collector running round-robin over all 6 cells; see [DATA_CARD.md](DATA_CARD.md) |
| D1 pass B: captions | Data | 🟡 | Mac: 86 waiting on 429 (run `--captions`). Windows: captions arriving with pass A; `--fix-language` repairs Hindi videos given English captions |
| Collect Hindi cells (tech/hi, education/hi, vlog/hi) | Data | 🟡 | Running on the Windows laptop; tech/hi 93, education/hi 5, vlog/hi 0 so far |
| Groq Whisper fallback when captions are blocked | Claude | ✅ | Pass C: `python -m retent_ml.asr`; caption-less videos are now kept for it |
| D1-media subset (~300 videos: audio and low-res video) | Data | 🟡 | `retent_ml.media --limit 300` built (balanced across cells, no ffmpeg); not run yet |
| D2: digitize 60–100 public Studio retention screenshots | Data | 🟡 | Tool + manifest + review overlays ready; screenshots must be found and saved by a person |
| D3: SponsorBlock segments for D1 videos | Data | ✅ | `retent_ml.sponsorblock`; rerun after collecting (incremental) |
| Share data via a private Hugging Face dataset repo | Data | 🟡 | `retent_ml.hub push/pull` built; needs `HF_TOKEN` and `RETENT_HF_DATASET` in `.env` |
| Data card (counts per cell, yield, biases) | Data | ✅ | Generated: `retent_ml.datacard` → [DATA_CARD.md](DATA_CARD.md) |

## Phase 2: Model & evaluation

| Task | Owner | Status | Notes |
|---|---|---|---|
| Feature package v0 (text EN/HI/Hinglish, bin features) | Claude | ✅ | `retent_core/text.py`, `features.py` |
| Hazard engine v0 (rules-based interest score) | Claude | ✅ | `engine.py`; curves labelled uncalibrated |
| Flag detectors (9 kinds) + counterfactual severity | Claude | ✅ | `flags.py` |
| Edit simulator (apply ops, re-time, deltas) | Claude | ✅ | `simulator.py` |
| LLM router: Claude + Groq, failover, cache, provenance | Claude | ⛔ | Needs keys |
| LLM semantic pass: segment roles, promises, loops, payoff | Claude | ⛔ | Replaces cue lexicons; also names sections |
| LLM fix writing in the creator's language and voice | Claude | ⛔ | Replaces template lines |
| Dual labeling of D1 (Claude Batches + Groq) + agreement κ | ML | ⬜ | |
| Calibrate speaking rates per language/category from captions | ML | ⬜ | Writes `models/speaking_rates.json` |
| LightGBM LambdaRank interest model, GroupKFold by channel | ML | ⬜ | Needs ≥300 captioned videos |
| Fit hazard baselines on D2 → `models/baselines.json` | ML | ⬜ | Turns curves "calibrated" |
| Ensemble uncertainty band (5 fold models) | ML | ⬜ | |
| SHAP attributions for the trained model | ML | ⬜ | Same `Signal` shape as today |
| Baselines: position-only, Claude zero-shot, Groq zero-shot, random | ML | ⬜ | |
| `eval_report.json` + `norms.json` (`ml/eval/run.py`) | ML | ⬜ | Feeds E1 and E5 |
| Category norms on each flag (`Flag.norm`) | ML | ⬜ | "Top Hindi tech reviews hook by 0:08" |
| Missing flags: chapter skip, visual/audio monotony | Claude | ⬜ | Monotony needs video mode |

## Phase 3: Core loop

| Task | Owner | Status | Notes |
|---|---|---|---|
| API: jobs, SSE progress, simulate, samples, fixtures | Claude | ✅ | `services/api` |
| Workspace curve: band, red pen on biggest drop, crosshair, playhead | You + Claude | ✅ | |
| Metrics ledger (Intro 0:30, APV, AVD, viewers at payoff) | You + Claude | ✅ | |
| Lanes: drop risks, promise, loops, sections, new info | You + Claude | ✅ | |
| Script page: screenplay format, margin notes, revision `*`, OMITTED | You + Claude | ✅ | |
| Fix queue + inspector + Apply → Blue/Pink revisions + re-simulation | You + Claude | ✅ | |
| Intake (script mode) with live stage progress | You + Claude | ✅ | |
| Projects list | You + Claude | ✅ | |
| Engine switch (Deep / Fast / Auto) | Claude | 🟡 | UI exists; does nothing until the LLM router lands |
| Key moments (spikes) marked on the curve | You + Claude | ✅ | Spikes marked in ink; dips keep the red wash |
| Curve as a data table (accessibility) | You + Claude | ✅ | "Curve as a table" under the chart, with key moments and the revision column |
| Keyboard control of playhead and lanes | You + Claude | ✅ | Curve is a slider: arrows, Shift, Home/End, `[` `]` jump between drops, Esc; arrows in the drop-risk lane |
| Persist drafts on the server | Claude | ⬜ | Drafts live in browser memory today |

## Phase 4: Differentiators

| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| A1 | Upload `.txt / .docx / .srt / .vtt` | Claude | ⬜ | Paste works today |
| A2 | Thumbnail image read by Claude vision; candidate titles | Claude | ⛔ | Thumbnail *text* field works today |
| A3 | Video mode: Whisper, shot cuts, loudness, face, OCR | ML + Claude | ⬜ | |
| A4 | Public YouTube URL mode | Claude | ⬜ | Caption 429 → Whisper fallback |
| C3 | Open-loop arcs | Claude | 🟡 | Lane works; LLM detection will find far more loops |
| C4 | Redundancy map view (recurrence plot) | You + Claude | 🟡 | Data computed in every analysis; no UI yet |
| C5 | Pacing lanes: words/min, fillers; video lanes | You + Claude | 🟡 | New-info lane only |
| D4 | Hook Lab: Claude vs Groq hooks, ranked by the model | You + Claude | ⛔ | Needs keys |
| D5 | Title Fit | You + Claude | ⬜ | |
| D6 | Chapter Advisor | Claude | ⬜ | Chapter export from sections exists |
| D7 | Exports: FCPXML / Premiere XML, PDF report | Claude | 🟡 | EDL, script, chapters and CSV done |
| F1 | Live script editor with underlines | You + Claude | ⬜ | |
| F2 | Versions compare view | You + Claude | ⬜ | Revisions exist; side-by-side compare missing |
| — | More samples: Devanagari Hindi, English education, vlog; extend Hinglish to ~8 min | Claude | ⬜ | Demo coverage for all 3 categories |

## Phase 5: Validation & discovery

| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| E1 | Validation Lab (renders `eval_report.json`) | You + Claude | ⬜ | Waits on the eval report |
| E2 | Blind test: any public URL → predict → reveal actual | You + Claude | ⬜ | Fixtures already store the real curve |
| E3 | Channel X-Ray | You + Claude | ⬜ | |
| E4 | Retention Import (screenshot → curve → score) | ML + You | ⬜ | Digitizer from Phase 0 |
| E5 | Category Norms page | You + Claude | ⬜ | Waits on `norms.json` |

## Phase 6: Finish

| Task | Owner | Status | Notes |
|---|---|---|---|
| Landing page (impeccable surface round; GSAP ScrollTrigger + Lenis story) | You + Claude | ⬜ | You pick the layout on the decision page |
| Mobile layout: rail → bottom bar, stacked panels | You + Claude | ⬜ | Desktop done; phone width cramped |
| impeccable critique → audit → harden → polish | You + Claude | ⬜ | |
| Finish reviewer + DESIGN.md (documenter) | Claude | ⬜ | Required to close the direction contract |
| Tests: pytest for the core, Playwright end-to-end demo flow | Claude | 🟡 | pytest done: core + API (`uv run pytest`); Playwright flow left |
| Demo mode (pre-cached projects, replay recorded streams) | Claude | ⬜ | |
| Deploy: Vercel (web) + Railway/Render (API) | You + Claude | ⬜ | Demo runs locally first |
| Fix known rough edges: weak auto section titles; fixes with no measurable gain | Claude | ⬜ | Mostly solved by the LLM pass |

## Phase 7: Pitch kit

| Task | Owner | Status |
|---|---|---|
| README + architecture diagram | Claude | 🟡 |
| Model card | ML | ⬜ |
| Data card | Data | ✅ |
| 2–3 min demo video | You | ⬜ |
| Pitch deck | You + Claude | ⬜ |
| Judge Q&A rehearsal ([PLAN.md §12](PLAN.md#12-judge-qa-prep-analytics-experts-will-ask-these)) | Everyone | ⬜ |

## Phase 8: Showstoppers (only after Phase 6 is done)

| ID | Task | Status |
|---|---|---|
| G1 | Browser extension overlay on YouTube | ⬜ |
| G2 | Connect your channel (YouTube Analytics OAuth) | ⬜ |
| G3 | Shorts candidates from predicted spikes | ⬜ |
| G4 | Hindi interface toggle | ⬜ |
| G5 | Challenger neural model vs LightGBM | ⬜ |
