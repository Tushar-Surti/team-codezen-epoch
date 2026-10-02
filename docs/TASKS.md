# Retent AI: task tracker

Status: ✅ done · 🟡 partly done · ⬜ not started · ⛔ blocked
Everything runs on the **MacBook Air M3** (since 2026-10-03; see [PLAN.md §9](PLAN.md#9-one-machine-the-macbook-air-m3)).
Owners: **You** (decisions, finding Studio screenshots, demo) · **Claude** (code and runs; never commits).
Heavy jobs (collection, MLX transcription, training) run overnight, plugged in, never during a demo.
IDs such as `A1` and `E2` refer to the feature tables in [PLAN.md §3](PLAN.md#3-feature-set).

Update this file whenever a task changes state; it is the single source of truth for what's left.

## Progress at a glance

| Phase | Done | Partial | Left |
|---|---|---|---|
| 0. Foundations | 6 | 3 | 0 |
| 1. Data | 4 | 6 | 1 |
| 2. Model & evaluation | 9 | 2 | 6 |
| 3. Core loop | 12 | 0 | 1 |
| 4. Differentiators | 1 | 4 | 9 |
| 5. Validation & discovery | 2 | 0 | 3 |
| 6. Finish | 2 | 1 | 5 |
| 7. Pitch kit | 1 | 1 | 4 |
| 8. Showstoppers | 0 | 0 | 5 |
| **Total** | **37** | **17** | **34** |

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
| GPU kit round trip: friend's RTX 5050 laptop merges their 108 videos, collects, fetches captions, runs Whisper large-v3, returns `RETURN.zip` | You | 🟡 | Kit built and round-trip tested on the Mac (`handoff/retent-gpu-kit.zip`); send it, then `python -m retent_ml.kit absorb RETURN.zip` |
| Screenshot digitizer prototype (5 Studio screenshots) | Claude | 🟡 | `retent_ml.digitize` built and tested on synthetic light/dark charts; needs 5 real screenshots |

## Phase 1: Data

| Task | Owner | Status | Notes |
|---|---|---|---|
| D1 pass A: metadata + "Most replayed" | Claude | 🟡 | 258 on the Mac (tech/en 209, tech/hi 16, edu/en 11, edu/hi 22), now collecting only the thin cells; +108 waiting on the Windows laptop. Target ≈100 with text per cell. Audit: all curves clean (`retent_ml.audit`) |
| D1 pass B: captions | Claude | 🟡 | ~220 waiting on 429; `--captions` backs off (optional phone hotspot as a second connection); Whisper (pass C) covers the rest. `--fix-language` repairs Hindi videos given English captions |
| Collect Hindi cells (tech/hi, education/hi, vlog/hi) | Claude | 🟡 | Collector on the Mac focuses on thin cells; tech/hi 93 more arrive with the Windows data |
| Groq Whisper fallback when captions are blocked | Claude | ✅ | Pass C: `python -m retent_ml.asr`; caption-less videos are now kept for it |
| Local Whisper on the Mac's GPU (MLX `large-v3-turbo`) as `--engine local` | Claude | ⬜ | No quota; replaces the CUDA path; run overnight on every video still waiting for text |
| D1-media subset (~120 videos: audio and low-res video) | Claude | 🟡 | `retent_ml.media --limit 300` built (balanced across cells, no ffmpeg); not run yet |
| D2: digitize 60–100 public Studio retention screenshots | Claude | 🟡 | Tool + manifest + review overlays ready; screenshots must be found and saved by a person |
| D3: SponsorBlock segments for D1 videos | Claude | ✅ | `retent_ml.sponsorblock`; rerun after collecting (incremental) |
| Share data via a private Hugging Face dataset repo | Claude | 🟡 | `retent_ml.hub push/pull` built; needs `HF_TOKEN` and `RETENT_HF_DATASET` in `.env` |
| Data card (counts per cell, yield, biases) | Claude | ✅ | Generated: `retent_ml.datacard` → [DATA_CARD.md](DATA_CARD.md) |
| Per-record quality audit (label, text coverage, pace, language) | Claude | ✅ | `retent_ml.audit` → `data/derived/audit.json`; position explains only ~8% of a curve, so most of the signal is content |

## Phase 2: Model & evaluation

| Task | Owner | Status | Notes |
|---|---|---|---|
| Feature package v0 (text EN/HI/Hinglish, bin features) | Claude | ✅ | `retent_core/text.py`, `features.py` |
| Hazard engine v0 (rules-based interest score) | Claude | ✅ | `engine.py`; curves labelled uncalibrated |
| Flag detectors (9 kinds) + counterfactual severity | Claude | ✅ | `flags.py` |
| Edit simulator (apply ops, re-time, deltas) | Claude | ✅ | `simulator.py` |
| LLM router: Claude + Groq, failover, cache, provenance | Claude | ✅ | `retent_core/llm.py`; Groq live; Claude path coded (structured outputs, prompt caching, refusal fallback), activates when the key is added |
| LLM semantic pass: segment roles, promises, loops, payoff | Claude | ✅ | `retent_core/semantic.py`, about 3.5 s on Groq; finds tangents, the real payoff and unclosed loops the keyword rules missed; names sections |
| LLM fix writing in the creator's language and voice | Claude | ✅ | Writes in the script's own language/script; guards against invented timings and content; every fix re-simulated with the real text |
| Dual labeling of D1 (Claude Batches + Groq) + agreement κ | Claude | ⬜ | |
| Calibrate speaking rates per language/category from captions | Claude | ⬜ | Writes `models/speaking_rates.json` |
| LightGBM LambdaRank interest model, GroupKFold by channel | Claude | ✅ | Position prior + LightGBM residual on text features, smoothed; `retent_ml.train` in ~5 s; served by the engine automatically |
| Fit hazard baselines on D2 → `models/baselines.json` | Claude | ⬜ | Turns curves "calibrated" |
| Ensemble uncertainty band (5 fold models) | Claude | ⬜ | |
| SHAP attributions for the trained model | Claude | ✅ | Same `Signal` shape as today |
| Baselines: position-only, Claude zero-shot, Groq zero-shot, random | Claude | 🟡 | Position, rules-v0 and random done; Groq zero-shot still to add |
| `eval_report.json` + `norms.json` (`ml/eval/run.py`) | Claude | 🟡 | `eval_report.json` done (GroupKFold by channel, 95% CIs, per-video overlays); norms still to do |
| Category norms on each flag (`Flag.norm`) | Claude | ⬜ | "Top Hindi tech reviews hook by 0:08" |
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
| Engine switch (Deep / Fast / Auto) | Claude | ✅ | Routes read/write to Groq or Claude with failover; provenance badge on every written fix |
| Key moments (spikes) marked on the curve | You + Claude | ✅ | Spikes marked in ink; dips keep the red wash |
| Curve as a data table (accessibility) | You + Claude | ✅ | "Curve as a table" under the chart, with key moments and the revision column |
| Keyboard control of playhead and lanes | You + Claude | ✅ | Curve is a slider: arrows, Shift, Home/End, `[` `]` jump between drops, Esc; arrows in the drop-risk lane |
| Persist drafts on the server | Claude | ⬜ | Drafts live in browser memory today |

## Phase 4: Differentiators

| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| A1 | Upload `.txt / .docx / .srt / .vtt` | Claude | ⬜ | Paste works today |
| A2 | Thumbnail image read by Claude vision; candidate titles | Claude | ⛔ | Thumbnail *text* field works today |
| A3 | Video mode: Whisper, shot cuts, loudness, face, OCR | Claude | ⬜ | |
| A4 | Public YouTube URL mode | Claude | ⬜ | Caption 429 → Whisper fallback |
| C3 | Open-loop arcs | Claude | 🟡 | Lane works; LLM detection will find far more loops |
| C4 | Redundancy map view (recurrence plot) | You + Claude | 🟡 | Data computed in every analysis; no UI yet |
| C5 | Pacing lanes: words/min, fillers; video lanes | You + Claude | 🟡 | New-info lane only |
| D4 | Hook Lab: Claude vs Groq hooks, ranked by the model | You + Claude | ✅ | `/hooks` + `POST /api/hooks`: LLM pitches 5 hooks in the creator's voice; the model re-simulates and ranks them |
| D5 | Title Fit | You + Claude | ⬜ | |
| D6 | Chapter Advisor | Claude | ⬜ | Chapter export from sections exists |
| D7 | Exports: FCPXML / Premiere XML, PDF report | Claude | 🟡 | EDL, script, chapters and CSV done |
| F1 | Live script editor with underlines | You + Claude | ⬜ | |
| F2 | Versions compare view | You + Claude | ⬜ | Revisions exist; side-by-side compare missing |
| — | More samples: Devanagari Hindi, English education, vlog; extend Hinglish to ~8 min | Claude | ⬜ | Demo coverage for all 3 categories |

## Phase 5: Validation & discovery

| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| E1 | Validation Lab (renders `eval_report.json`) | You + Claude | ✅ | `/lab`: baselines with CIs, by category, top signals, best/typical/worst gallery, limits |
| E2 | Blind test: any public URL → predict → reveal actual | You + Claude | ✅ | `/blind`: out-of-fold blind prediction, then YouTube's curve sweeps in, with scores |
| E3 | Channel X-Ray | You + Claude | ⬜ | |
| E4 | Retention Import (screenshot → curve → score) | You | ⬜ | Digitizer from Phase 0 |
| E5 | Category Norms page | You + Claude | ⬜ | Waits on `norms.json` |

## Phase 6: Finish

| Task | Owner | Status | Notes |
|---|---|---|---|
| Landing page (impeccable surface round; GSAP ScrollTrigger + Lenis story) | You + Claude | ✅ | Hero with a marked-up script, GSAP scroll story on the real sample, live proof numbers, Lenis |
| Mobile layout: rail → bottom bar, stacked panels | You + Claude | ⬜ | Desktop done; phone width cramped |
| impeccable critique → audit → harden → polish | You + Claude | ⬜ | |
| Finish reviewer + DESIGN.md (documenter) | Claude | ⬜ | Required to close the direction contract |
| Tests: pytest for the core, Playwright end-to-end demo flow | Claude | 🟡 | pytest done: core + API (`uv run pytest`); Playwright flow left |
| Demo mode (pre-cached projects, replay recorded streams) | Claude | ⬜ | |
| Deploy: Vercel (web) + Railway/Render (API) | You + Claude | ⬜ | Demo runs locally first |
| Fix known rough edges: weak auto section titles; fixes with no measurable gain | Claude | ✅ | Sections named by the LLM; asks now move to after the verdict, so every sample fix has a positive gain |

## Phase 7: Pitch kit

| Task | Owner | Status |
|---|---|---|
| README + architecture diagram | Claude | 🟡 |
| Model card | Claude | ⬜ |
| Data card | Claude | ✅ |
| 2–3 min demo video | You | ⬜ |
| Pitch deck | You + Claude | ⬜ |
| Judge Q&A rehearsal ([PLAN.md §12](PLAN.md#12-judge-qa-prep-analytics-experts-will-ask-these)) | You | ⬜ |

## Phase 8: Showstoppers (only after Phase 6 is done)

| ID | Task | Status |
|---|---|---|
| G1 | Browser extension overlay on YouTube | ⬜ |
| G2 | Connect your channel (YouTube Analytics OAuth) | ⬜ |
| G3 | Shorts candidates from predicted spikes | ⬜ |
| G4 | Hindi interface toggle | ⬜ |
| G5 | Challenger neural model vs LightGBM | ⬜ |
