# Retent AI — Retention Predictor: Build Plan v2

> *Predict the drop. Fix the video. Keep them watching.*
> **Status: DRAFT v2 — waiting for your review. No code until you approve.**
> **Changes from v1:** no time limit, so the scope is now "best possible"; Claude and Groq are both supported; all ground truth comes from **public data** (no channel access needed); new name options; new features (Channel X-Ray, Retention Import, Title Fit, Chapter Advisor, Category Norms); a judge Q&A prep section and a submission kit.
> **Changes in v2.1:** the UI must be beautiful with standout animation, so there is a motion stack (GSAP, Lenis, Motion) and a list of signature animations (§8.1); a plan for who works on which machine and what happens first (§9).

---

## Build status (updated 2026-10-02)

**Live task tracker: [TASKS.md](TASKS.md)**, which lists every remaining task with owner and status.

**Phase 0 findings**
- "Most replayed" is served for about 6 in 16 videos (skewed to uploads older than ~1 month). The collector probes 2–3× more videos than it keeps.
- Captions: Hindi original ASR is available as `hi-orig`. Caption downloads hit HTTP 429 after roughly 20 requests per IP, so collection runs as pass A (metadata + "Most replayed") and pass B (captions, with backoff), spread across machines. Groq Whisper on audio is the fallback.
- 162 seed channels were discovered across the 6 cells (`ml/seeds/channels.json`).
- Visual direction chosen through impeccable: **Revision Draft** (shooting-script revision pages + the script doctor's red pen). Contract is in `apps/web/.impeccable/surfaces/`.

**Done:** the `Analysis` contract (Pydantic → JSON Schema → TypeScript); `retent_core` (text EN/HI/Hinglish, features, v0 hazard engine, 9 flag detectors, counterfactual simulator); FastAPI (jobs, SSE, simulate, samples); D1 collector and seeds; fixtures; web Workspace (curve with red pen, lanes, screenplay script with revision marks, call-sheet metrics, fix queue + inspector, Blue/Pink revisions, export of EDL, script, chapters and CSV); intake with live stage progress; projects list.

**Next:** LLM router (Claude + Groq) and the semantic pass; interest-model training plus `eval_report.json`; landing page (impeccable surface round); Validation Lab, Blind Test, Hook Lab, Title Fit, X-Ray, Retention Import; responsive pass; finish review.

---

## 0. Name options

| Name | Why it works | Watch-out |
|---|---|---|
| **Retent AI** ✅ *chosen* | Says what it does; tagline "Predict the drop. Fix the video. Keep them watching." | Working name, may change |
| Holdline | The retention curve *is* the line, and "hold" is what retention measures | Purely English |
| **Tikaav (टिकाव)** | Hindi for *staying power*. A bilingual name that matches the EN + HI scope and will stick with Indian judges | Non-Hindi speakers may stumble on it |
| **Cliffwatch** | Keeping watch for the retention *cliffs*; says exactly what the product does | Slightly ominous |
| **Payoff** | Named after the core insight: viewers stay until the title's promise pays off | Very common word, hard to own |
| **Forecut** | *Forecast + cut*: predicts, then tells you what to cut | Sounds close to **FireCut**, an existing AI editing plugin |
| **Premortem** | v1 name; a "premortem for your video" | Morbid; not obviously about video |

**Chosen for now: Retent AI** ("Predict the drop. Fix the video. Keep them watching."). The name may change later; it lives in one config constant, so renaming is cheap.

---

## 1. The idea

Retent AI reads a **script (before you shoot)** or a **rough cut (before you publish)** and predicts the audience-retention curve. It flags each likely drop-off with **quoted evidence and the signals behind it**, writes the **specific edit** that fixes it, and **re-runs the prediction** on the edited version to show what the edit is worth. It is checked against **real public retention data**, including a blind test a judge can run on any YouTube video or channel they choose.

### Three commitments
1. **The model predicts, the LLMs only read the script.** The curve comes from a trained, validated model. Claude and Groq models pull semantic features out of the script and write the fixes; they never draw the curve. Every flag can be traced to measured signals.
2. **Use the terms creators already know.** Metrics use YouTube Studio's names (Intro retention at 0:30, APV, AVD, Key moments: dips and spikes). The workspace looks like an editing timeline (tracks, playhead, markers), and fixes export to DaVinci Resolve, Premiere and Final Cut.
3. **Report accuracy honestly.** Results are measured on channels the model never saw and compared with simple baselines, including "just ask Claude" and "just ask Groq". We show failure cases, live blind tests, and confidence intervals wherever the sample is small. Every number in the product is computed; nothing is typed in by hand.

### How we beat other submissions for the same PS
| Typical submission | Retent AI |
|---|---|
| Asks an LLM where viewers drop off and draws the answer | A hazard model trained on about 1,200 public videos; the LLMs only extract features |
| Generic advice ("intro is long") | Timestamped flag with a quote, the contributing signals, viewers lost per 1,000, and how this compares with the category norm |
| A list of suggestions | Re-simulated before/after ghost curve, and edit markers exported to the editing tool |
| Says it is accurate | Validation Lab with baselines, ablations, failure gallery, live blind test and Channel X-Ray |
| Improvement measured as % viewed (inflated just by making the video shorter) | Viewers at the payoff and total watch time, not just APV |
| English only | Hindi, Hinglish (Devanagari and romanized) and English |
| Post-production only | Script mode (before shooting) and video mode (rough cut) |
| One LLM, a black box | Two engines (Claude for depth, Groq for speed) with a provenance badge on every AI output; the retention model is the judge between them |

---

## 2. Users and core loop

- **Primary user:** a solo or small-team YouTube creator making 5–15 minute tech reviews, explainers or vlogs in EN, HI or Hinglish, usually without a dedicated editor.
- **Secondary user:** the editor who gets the hand-off (markers and a revised script). **Tertiary:** analysts and strategists studying competitor channels (Channel X-Ray).
- **Core loop:** add a script or cut → see the curve and its cliffs → open a cliff to see why → apply the fix → watch the curve change → export the edits to the editing tool.

---

## 3. Feature set

Tiers: **Core** = must be flawless · **Differentiator** = why we win · **Showstopper** = built once Core and Differentiators are polished.

### A. Intake
| # | Feature | Tier |
|---|---|---|
| A1 | **Script mode:** paste, write, or upload `.txt / .docx / .srt / .vtt`. Language detected automatically (EN / HI / Hinglish). Without timestamps, timing is estimated from speaking rates per language and category, measured on our dataset | Core |
| A2 | **Context:** title, category, optional thumbnail (Claude vision reads the thumbnail text so its promise can be tracked), optional candidate titles | Core |
| A3 | **Video mode:** MP4 upload. Groq Whisper large-v3 transcript with word timestamps; shot cuts; loudness, silences and pitch variation (monotone delivery); face on screen; text on screen; visual type of each shot (talking head, b-roll, screen recording) | Differentiator |
| A4 | **Public YouTube URL:** fetches captions and metadata, for the blind test and post-mortems on published videos | Differentiator |

### B. Predicted retention curve — *PS requirement 1*
| # | Feature | Tier |
|---|---|---|
| B1 | Curve at 1% resolution (YouTube's own resolution), drawn per second, with an uncertainty band and a "typical for this category" band | Core |
| B2 | Headline metrics in YouTube Studio terms: **Intro retention (0:30), APV, AVD, predicted Key moments (dips and spikes)** | Core |
| B3 | Synced playhead across the curve, all timeline lanes, the transcript and the video player | Core |

### C. Reasoned flags — *PS requirement 2*
| # | Feature | Tier |
|---|---|---|
| C1 | **Flag engine** (taxonomy below). Each flag has severity (viewers lost per 1,000 starters), quoted evidence, top contributing signals, confidence, and the **category norm** (e.g. "top Hindi tech reviews reach the hook by 0:08", computed from our data) | Core |
| C2 | **Promise Ledger.** Each title or thumbnail promise tracked along the timeline: first touched, then paid off. A "promise debt" meter sits under the curve | Core |
| C3 | **Open-loop arcs.** Curiosity gaps drawn as arcs from where they open to where they close; flags loops that never close or close almost immediately | Differentiator |
| C4 | **Redundancy map.** A self-similarity matrix of the transcript (recurrence plot). Click a bright block to see the two repeating passages side by side | Differentiator |
| C5 | **Pacing tracks.** Words per minute, new-information rate, fillers, and (in video mode) cuts, audio energy and face/b-roll lanes | Differentiator |

**Flag taxonomy.** Every threshold is tuned on data, not hand-picked.

| Flag | Signals | Example | Typical fix |
|---|---|---|---|
| Late hook | Hook classifier; time to first hook | "Intro runs 0:45 before the hook" | Move hook to 0:00, cut greeting, preview payoff |
| Promise debt | Title/thumbnail promises matched to segments | "'Which camera wins' first addressed 2:40; verdict 11:20" | Tease the verdict, add signposts, reorder |
| Repetition | Embedding self-similarity + n-gram overlap | "1:10–1:30 repeats 0:20–0:40" | Cut the span |
| Tangent | Distance from the promise and topic centroid; LLM role label | "2:55–3:40 shop-visit story is off-promise" | Cut, or compress to one line |
| Low density / dead air | New-information rate, EN + HI fillers (*um, basically, matlab, toh*), pauses | "3:10–3:50 adds little new" | Tighten or jump-cut |
| Visual/audio monotony (video) | No shot change, flat loudness, low pitch variation | "No visual change 4:10–4:52" | B-roll, punch-in, on-screen text |
| Early ask / sponsor placement | CTA and sponsor detection; dip size learned from SponsorBlock-labelled videos | "Subscribe ask at 0:12 before any value" | Move after the first payoff |
| Premature wrap-up | Outro-language classifier vs time remaining | "'So that's it' at 8:40 with 2:10 left" | Rephrase, or move the recap |
| Open-loop problems | Pairs of loop openings and closings | "Loop opened 0:20 never closed" | Close it or drop the tease |
| Complexity spike (education) | Readability and jargon density | "5 new terms in 20 s at 6:05" | Example or analogy first |
| Chapter skip risk | Chapter boundaries plus a predicted skip-to target | "Chapter 'Unboxing' invites skipping 2:00–5:30" | Merge or rename chapters, tease what's ahead |

### D. Actionable edits — *PS requirement 3*
| # | Feature | Tier |
|---|---|---|
| D1 | A concrete edit for every flag: **cut, trim, move, insert hook line, rewrite, add pattern interrupt, re-chapter**. New text is written in the script's language and voice | Core |
| D2 | **Re-simulation.** The edit is applied, timing and features recomputed, the model re-run → ghost curve plus Δ intro retention, Δ AVD, Δ viewers at the payoff, and new runtime | Core |
| D3 | **Edit stack.** Combine edits and re-simulate them together (their effects don't simply add up), with a running total | Core |
| D4 | **Hook Lab.** Both engines pitch hooks (Claude and Groq) in EN / HI / Hinglish; **the retention model scores every pitch and ranks them**, with the engine shown on each card | Differentiator |
| D5 | **Title Fit.** For each candidate title: when does the video pay off its promise, and what predicted retention follows? Recommends the title the video actually delivers on | Differentiator |
| D6 | **Chapter Advisor.** Proposes chapter positions and titles that reduce skipping, and exports them as YouTube chapters | Differentiator |
| D7 | **Exports:** revised script with changes marked; timeline markers (EDL for Resolve, FCPXML for Premiere and Final Cut); CSV; chapters; a PDF report | Differentiator |

### E. Validation and discovery — *PS requirement 4*
| # | Feature | Tier |
|---|---|---|
| E1 | **Validation Lab**, built entirely from the evaluation report: results vs baselines by category and language, overlay browser, calibration, ablations, failure gallery, confidence intervals | Core |
| E2 | **Live blind test.** Paste any public URL → we predict from the transcript alone → we reveal the real "Most replayed" curve and score the prediction | Core |
| E3 | **Channel X-Ray.** Paste any public channel → we analyze its recent in-scope videos: predicted vs actual for each, the channel's typical dip causes, hook-latency distribution, what its spike moments have in common | Differentiator |
| E4 | **Retention Import.** Upload a **YouTube Studio retention-graph screenshot** → the curve is digitized (color mask plus axis reading, with manual calibration as fallback) → our prediction is scored against it. Lets any creator validate us without OAuth; also how we build our public absolute-retention dataset | Differentiator |
| E5 | **Category Norms ("What the data says").** Findings computed from our dataset, e.g. hook latency vs early interest, size of the sponsor-read dip, chapter effects, broken down by category and language | Differentiator |

### F. Workflow
| # | Feature | Tier |
|---|---|---|
| F1 | **Live script editor.** Lines underlined as you type, like a grammar checker for retention (local signals plus Groq quick labels); full analysis on demand | Differentiator |
| F2 | **Versions and compare** (v1 vs v2 curves and a diff of flags) | Differentiator |
| F3 | **Engine switch:** Deep (Claude) / Fast (Groq) / Auto, with a provenance badge on every AI output | Core |
| F4 | Shareable read-only report link for editor hand-off | Showstopper |

### G. Showstoppers (after Core and Differentiators are polished)
| # | Feature |
|---|---|
| G1 | **Browser extension:** on any YouTube watch page, overlay Retent AI's prediction on the real "Most replayed" curve. Competitor research in one click |
| G2 | **Connect your channel** (YouTube Analytics OAuth) for exact retention curves. Built for creators and judges who have a channel; we can't test it ourselves without one |
| G3 | **Shorts candidates:** predicted spike moments become suggested Shorts cuts |
| G4 | **Hindi interface** (हिंदी UI toggle) |
| G5 | **Challenger model:** a small temporal neural model vs LightGBM; we ship whichever wins on the holdout |

---

## 4. How the prediction works

```
script / transcript ─► sentences with timestamps (ASR/captions, or estimated)
                    ─► 100 equal bins (YouTube's own resolution) + topic sections + chapters
                    ─► features for each bin
                    ─► Interest model (LightGBM LambdaRank)  → relative interest per bin
                    ─► Hazard integrator                     → absolute retention curve R(t)
                    ─► SHAP attributions                     → flags with reasons
                    ─► edit ops → recompute → rerun           → Δ for each edit
```

**Features per bin**
- *Position and context:* bin index, seconds and % elapsed, category, language, duration.
- *Lexical:* words per minute; filler, question, numeral and second-person ("you", "aap") rates; fillers in both Devanagari and romanized form.
- *Information:* rate of new content tokens and new entities.
- *Redundancy:* highest similarity to any earlier bin.
- *Relevance:* similarity to the title/thumbnail promise and to the topic centroid (multilingual-e5 embeddings).
- *LLM semantic labels (structured JSON):* segment role (hook, setup, payoff, tangent, sponsor, CTA, recap, outro); loop opened or closed; promise touched or fulfilled. A 15-minute transcript is about 2–3k words, so this is **one or two calls per video**.
- *Structure:* chapter boundaries and the distance to the next one.
- *Media (video mode):* shot-cut rate, loudness, silence, pitch variation, share of time a face is on screen, text on screen, visual type.
- *Video-level:* hook latency, promise→payoff delay, intro length.

**Models**
1. **Interest model:** LightGBM with a LambdaRank objective, each video its own group. The target is YouTube's public **"Most replayed"** intensity per bin. It learns which parts of a video are weaker than the rest.
2. **Retention integrator:** a discrete-time hazard model. For each bin, `h_i = base(i | category, duration) · exp(−β·interest_i + γ·event_i)`, and `R(t) = Π(1 − h_i)`. The baseline shape, intro cliff and β are fitted on **digitized public Studio retention curves** (dataset D2 below), pulled toward category priors.
3. **Uncertainty:** the five group-cross-validation models form an ensemble, and its spread is the band.
4. **Explanations:** SHAP values grouped into families of signals feed the flag engine. The LLM only rephrases facts we hand it.
5. **Counterfactual edits:** edit the sentence list, recompute timing and features, re-run, and report viewers at the payoff and watch time, plus APV.

**Train/serve parity:** the same feature package (`ml/retent_features`) runs in training and in the API. Prompts are versioned, and a model card records which provider, model and prompt version produced the training labels.

**Limits we state openly** (in the UI and the pitch)
- "Most replayed" measures *relative interest*, not how many viewers remain. It gives us the **shape** of the curve. The **absolute level** comes from a smaller set of real Studio curves and is shown with confidence intervals.
- We measure how closely "Most replayed" tracks true retention on the videos where we have both, and publish that number rather than assuming it.
- Edit deltas are what the model expects, not guarantees. We back them with natural experiments (SponsorBlock sponsor reads; videos with late vs early hooks).

---

## 5. Two engines: Claude and Groq

```
LLMRouter  ── role-based routing · automatic failover · cache keyed by (provider, model, prompt version, content hash)
 ├─ ClaudeProvider   claude-opus-5-5 — structured outputs, prompt caching, vision,
 │                   Message Batches for offline dataset labeling, server-side refusal fallback
 └─ GroqProvider     whisper-large-v3 / whisper-large-v3-turbo (ASR)
                     openai/gpt-oss-120b (fast extraction and writing) · openai/gpt-oss-20b (live hints)
                     JSON-schema outputs, validated with Pydantic plus a retry
```

| Role | Default | Alternate | Why |
|---|---|---|---|
| ASR (speech to text) | Groq Whisper large-v3 (turbo for drafts) | local faster-whisper | Fast, strong on Hindi, word timestamps |
| Semantic feature extraction (feeds the model) | **Fixed for each model release** to whichever provider scores better on the holdout | The other provider, with its agreement score published | Labels at train and serve time must come from the same source |
| Writing edits, hooks and rewrites | Claude Opus 5.5 (Deep) | Groq GPT-OSS-120B (Fast) | Quality vs speed, user's choice |
| Vision (thumbnail text, keyframes, axis reading in the screenshot digitizer) | Claude Opus 5.5 | — | Vision is reliable on Claude |
| Live editor hints | Groq GPT-OSS-20B | local rules only | Responses fast enough to keep up with typing |
| Zero-shot baselines for validation | Both | — | "Why not just ask an LLM?", answered for both engines |

- **Dual labeling:** the training set is labeled by both engines. Validation reports agreement between them (Cohen's κ) and the downstream accuracy each one gives.
- **Failover:** a timeout, 5xx or rate limit switches to the other provider; the provenance badge shows which one answered.
- Model IDs live in env config and are checked against each provider's model list in Phase 0.

---

## 6. Data and validation plan (public data only)

### Datasets
| Set | What | Size target | Source |
|---|---|---|---|
| **D1, public interest** | 5–15 min videos with a "Most replayed" curve and captions | **~1,200** (3 categories × 2 languages × ~200) from 80–120 channels, big *and* mid-sized | YouTube Data API search (duration filter, `relevanceLanguage`) + yt-dlp (metadata, chapters, captions, "Most replayed") |
| **D1-media** | Subset with low-res video and audio, for video-mode features | ~300 | yt-dlp |
| **D2, public absolute retention** | Real YouTube Studio retention graphs that creators shared publicly, digitized with our Retention Import tool, each linked to its video | 60–100 | Creators' "my analytics" videos and posts, retention-critique threads (e.g. r/NewTubers), case-study breakdowns. Source URL stored for every curve |
| **D3, natural experiments** | Sponsor and self-promo segments | Wherever available in D1 | SponsorBlock API |

**Candidate seed channels.** Each is checked in Phase 0 for duration fit and whether it has a "Most replayed" curve; mid-sized channels are added in every cell.
- Tech, EN: MKBHD, Mrwhosetheboss, Dave2D, JerryRigEverything, Austin Evans. Tech, HI: Technical Guruji, Trakin Tech, Tech Burner, Technology Gyan.
- Education, EN: Kurzgesagt, CrashCourse, Veritasium, Johnny Harris, Ali Abdaal. Education, HI: Dhruv Rathee, StudyIQ, Mohak Mangal, Think School.
- Vlogs, EN: Casey Neistat, Yes Theory, Kara and Nate, Drew Binsky. Vlogs, HI: Sourav Joshi Vlogs, Flying Beast, Mumbiker Nikhil.

**Bias note:** big channels are already good at retention. Mid-sized channels and D2's smaller creators (critique threads skew toward weak retention) give the model examples of what *bad* looks like.

**Splits:** GroupKFold **by channel**, so no channel is in both train and test, plus a frozen ~15% holdout used once for the final numbers.

### Metrics
- *Shape (D1):* Spearman correlation within each video; dip precision, recall and F1 (±2 bins); top-3 spike hit rate.
- *Level (D2):* curve MAE (retention points), APV MAE, intro-retention MAE, with bootstrap 95% confidence intervals.
- *Proxy check (D2 videos that also have "Most replayed"):* how well the "Most replayed" shape tracks true retention.
- *Natural experiment (D3):* predicted vs observed dip at the start of sponsor reads.
- *Engines:* agreement on labels (κ); accuracy of the curve with Claude-sourced vs Groq-sourced features.

### Baselines the model must beat
1. **Position-only:** the category's average shape (the honest bar).
2. **Claude zero-shot:** Claude rates each segment directly.
3. **Groq zero-shot:** a Groq model rates each segment directly.
4. **Random** (the floor).

One command, `ml/eval/run.py`, produces `eval_report.json`; the Validation Lab and the Category Norms page render it as-is.

---

## 7. System architecture

```
┌─────────────────────────── apps/web (Next.js, TypeScript) ───────────────────────────┐
│ Landing · Intake · Workspace · Simulator · Hook Lab · Title Fit · Script Editor         │
│ Validation Lab · Blind Test · Channel X-Ray · Retention Import · Category Norms · Report│
│ D3 + custom SVG/Canvas marks · CodeMirror 6 · Motion · TanStack Query · Zustand        │
└──────────────▲───────────────────────────────────────────┬───────────────────────────────┘
               │ REST (typed client generated from OpenAPI)        │ SSE (stage progress, partial results)
┌──────────────┴──────────────────── services/api (FastAPI) ▼────────────────────────────────┐
│ Ingest ─ parsers · yt-dlp · Data API · ffmpeg            LLMRouter ─ Claude · Groq          │
│ Media ─ PySceneDetect · librosa · MediaPipe · OCR        Retention engine ─ LightGBM + hazard + SHAP │
│ Segmenter ─ sentences → bins · topics · chapters          Flag engine · Edit generator       │
│ Features ─ retent_features (shared with training)       Counterfactual simulator · Exporters│
│ Digitizer ─ Studio screenshot → curve                     Validation · X-Ray · Norms services│
│ Job runner (async, SSE) ─ SQLite (SQLModel) · file store                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────── ml/ (offline) ────────────────────┐
│ collect/  Data API · yt-dlp · SponsorBlock · digitizer │─► models/ (LightGBM ensemble, priors.json, model_card.md)
│ label/    Claude Batches + Groq (dual labels, cached)  │─► eval_report.json, norms.json ─► web
│ train/    GroupKFold · LambdaRank · hazard fit          │
│ eval/     metrics · baselines · ablations · CIs        │
└────────────────────────────────────────────────────────┘
```

### Stack
| Layer | Choice | Why |
|---|---|---|
| Web | **Next.js (App Router) + TypeScript** | Server-rendered landing, fast to build, deploys on Vercel |
| Styling | Tailwind CSS with tokens from impeccable's DESIGN.md | The look comes from the design process, not a kit's defaults |
| Charts | **D3 + custom SVG/Canvas** | Bands, ghost curves, arcs and the recurrence matrix are custom marks |
| Editor | **CodeMirror 6** | Precise range decorations for the live underlines |
| Motion: timelines and SVG | **GSAP** (ScrollTrigger, DrawSVG, MorphSVG, SplitText, Flip; every plugin is free, including commercial use, since 3.13) | Drawing curves, morphing the ghost curve, scroll-driven landing story, ranked cards rearranging |
| Motion: React UI | **Motion** (formerly Framer Motion) | Panels entering and leaving, a flag card expanding into the inspector, springs, hover and press feedback |
| Smooth scroll | **Lenis** (synced with GSAP ScrollTrigger) | Smooth scrolling on the landing page and Read pages only (see §8.1) |
| Hero visual (optional) | OGL or React Three Fiber, only if the chosen visual direction needs WebGL | A living retention-curve hero; skipped if the direction doesn't call for it |
| Number animation | Motion values / GSAP tweens | Metric and delta counters that tick up and down |
| Client state | TanStack Query + Zustand | Server cache plus one playhead and selection shared by every panel |
| API | **FastAPI (Python 3.12) + Pydantic v2** | ML ecosystem, typed schemas → TypeScript client |
| Jobs | Async runner inside the API, SSE progress | Live progress without extra infrastructure |
| Database | SQLite (SQLModel) | Nothing to operate; can move to Postgres |
| LLM | **Claude Opus 5.5 + Groq (GPT-OSS-120B / 20B)** behind `LLMRouter` | See §5 |
| ASR | **Groq Whisper large-v3** (local faster-whisper fallback) | Speed, Hindi, word timestamps |
| Embeddings | multilingual-e5 (local) | Hindi and English in one space, free |
| Media | ffmpeg, PySceneDetect, librosa, MediaPipe, OCR | Cheap, reliable signals |
| ML | LightGBM, SHAP, scikit-learn, pandas | Interpretable, works with a small dataset |
| Testing | pytest (features, golden pipeline runs), Playwright (end-to-end demo flow) | The demo must never break |
| Deploy | Vercel (web) + Railway or Render (API in Docker). The demo runs locally first, deployed version as backup | YouTube blocks many cloud IPs |

### Repo layout
```
apps/web/  services/api/  ml/retent_features/  ml/{collect,label,train,eval}/
models/  data/ (gitignored)  docs/PLAN.md  PRODUCT.md  DESIGN.md
```

---

## 8. UI/UX plan (impeccable)

**Process.** We follow impeccable's flow; no visual choices are made in this plan.
1. `/impeccable init` → interview → `PRODUCT.md`.
2. `/impeccable shape` on the **Workspace** (an *Operate* surface) → new-work concept seed → **you pick the visual direction** → `DESIGN.md`.
3. Landing page (*Persuade*) and Validation Lab / Norms (*Read*) in the same visual style.
4. Build code-first. The craft floor applies; the detector hook runs after every UI edit.
5. Motion passes: `/impeccable animate` (purposeful motion), `/impeccable delight` (memorable touches), and `/impeccable overdrive` on the landing hero and the blind-test reveal.
6. Finish: `critique` → `audit` (accessibility AA, keyboard-operable timeline, responsive, performance) → `harden` (every state) → `polish`, in bounded passes.

### 8.1 Visual and motion ambition

**Binding requirement from you:** the UI must be **beautiful, good-looking and attractive, with high-quality animation**. It is recorded in PRODUCT.md under Brand Commitments, so impeccable treats it as non-negotiable. The aim is a product that looks award-worthy in screenshots *and* feels smooth in the live demo.

**Motion rules** (so the animation impresses without getting in the way)
- **Motion must explain something.** Every animation shows a change in the data (a curve rising after an edit, a promise being paid off, a loop closing). Nothing animates only to decorate.
- **Two energy levels:**
  - *Persuade and Read pages* (landing, Validation Lab, Category Norms) go big: scroll-driven storytelling with GSAP ScrollTrigger, pinned sections, SplitText headline reveals, and Lenis smooth scroll.
  - *Operate pages* (Workspace, Simulator, Editor) stay fast and precise: animations of 150–300 ms, springs, shared-element transitions with Motion, and native scrolling. Lenis is off here because it fights the nested scroll areas in the timeline and transcript.
- **Performance:** animate only transform and opacity. Dense marks (the redundancy matrix, waveforms) go on Canvas. Target is 60 fps on a MacBook Air M3. Durations and easing curves are shared tokens in DESIGN.md.
- **Accessibility:** `prefers-reduced-motion` swaps every animation for a fade or an instant change. Nothing important is conveyed only through motion.

**Signature animated moments**
| # | Moment | Where | How |
|---|---|---|---|
| 1 | **Script becomes a curve:** while you scroll, a script turns into a retention curve, its cliffs light up, an edit is applied and the curve rises | Landing hero / story | GSAP ScrollTrigger (pinned) + MorphSVG + Lenis |
| 2 | **Curve draws itself** as the analysis streams in stage by stage; the uncertainty band fades in after it | Workspace | GSAP DrawSVG, driven by SSE stage events |
| 3 | **Ghost-curve morph:** applying an edit morphs the curve to its new shape while the deltas count up | Simulator | GSAP MorphSVG + number tweens |
| 4 | **Flag card → inspector:** a flag expands smoothly into the full inspector | Workspace | Motion `layoutId` |
| 5 | **Playhead scrub:** a spring-damped playhead; the transcript follows with a highlight sweep | Workspace | Motion springs + GSAP |
| 6 | **Promise Ledger:** each promise's debt bar fills over time, then snaps shut with a small pulse when the promise is paid off | Workspace lane | GSAP timeline |
| 7 | **Open-loop arcs** draw from where each loop opens to where it closes | Workspace lane | GSAP DrawSVG |
| 8 | **Blind-test reveal:** the actual curve sweeps in over the prediction, then the score counts up (the demo's high point) | Blind Test | GSAP timeline + SplitText |
| 9 | **Hook Lab ranking:** engine-tagged cards rearrange into ranked order once the model scores them | Hook Lab | GSAP Flip |
| 10 | **Analysis stages:** each pipeline step (transcribe → segment → read → predict → explain) animates as it completes | Intake → Workspace | Motion |

The visual world itself (palette, type, layout character) is still chosen with you in impeccable's direction workshop. This section only fixes how ambitious the motion must be and which tools we use.

**Screens**
| Screen | Mode | Purpose |
|---|---|---|
| Landing | Persuade | Hero is a *real* sample analysis; the only proof shown is real validation numbers |
| Intake | Operate | Script, video or URL; title(s), thumbnail, category; language detected automatically |
| **Workspace** ★ | Operate | Metrics header; curve with playhead; timeline lanes (Flags, Promises, Loops, Redundancy, Pacing, Media, Chapters); inspector (evidence → why → norm → fix → simulate); synced transcript and video |
| Simulator & Export | Operate | Edit stack, ghost curve, deltas, exports |
| Hook Lab / Title Fit | Operate | Engine-tagged variants, ranked by predicted retention |
| Script Editor | Operate | Writing with live underlines and a mini curve |
| Validation Lab | Read | Results, overlays, failure gallery, CIs |
| Blind Test / Channel X-Ray | Operate | Live tests on any public video or channel |
| Retention Import | Operate | Screenshot → digitized curve → scored |
| Category Norms | Read | Data-backed findings |
| Shared Report | Read | Editor hand-off |

**States designed up front:** analysis streaming in by stage; out-of-scope input (under 5 or over 15 minutes, unsupported language); no title (Promise Ledger disabled, with the reason shown); low-confidence ASR; a video without a "Most replayed" curve; a screenshot the digitizer can't calibrate (manual fallback); one engine down (failover badge); both engines down (rules-only flags, labelled as such).

---

## 9. Team, machines and what comes first

### 9.1 Who works on which machine
| Machine | Strengths | Limits | Best used for |
|---|---|---|---|
| **Your MacBook Air M3, 16 GB** | Fast, quiet, great screen, hardware video decoding | No fan, so it slows down under long heavy jobs; 16 GB is shared between CPU and GPU | **Design and UI lead:** impeccable sessions, frontend, API, LLM router. **This is the demo machine.** At runtime it only needs Groq (ASR), the Claude and Groq APIs, a small embedding model on Apple's GPU, and LightGBM on the CPU, all of which fit easily |
| **Teammates' Windows laptops, RTX 5050 8 GB VRAM, 24 GB RAM** | CUDA GPU, more RAM, can run jobs for hours | Windows tooling quirks; RTX 50-series GPUs need recent CUDA builds | **Data and ML:** long-running collection (each teammate's own home connection spreads out YouTube's rate limits), local GPU Whisper for videos without captions, embedding about 1,200 videos, video features for D1-media, training and parameter sweeps, the neural challenger model |

**Suggested roles** (assuming two teammates; a third would take the API pipeline and the digitizer)
- **You (Mac):** product and UI lead. You drive the impeccable sessions with me, own the frontend, wire up the API, and present the demo.
- **Teammate A (Windows GPU):** data lead. Collectors, SponsorBlock, digitizing D2 screenshots, data card.
- **Teammate B (Windows GPU):** ML lead. Feature package, embeddings, ASR, video features, training, evaluation, model card.

**Windows GPU setup (checked in Phase 0)**
- Run the Python/ML pipeline in **WSL2 (Ubuntu)**; native Windows is only for the browser.
- **PyTorch 2.7 or newer with CUDA 12.8 (`cu128`) wheels.** The RTX 5050 is a Blackwell GPU (`sm_120`), and older builds don't detect it. Confirm with `torch.cuda.is_available()` and a test matrix multiply.
- **faster-whisper with CTranslate2 4.5 or newer**, using `compute_type="float16"`. int8 has known cuBLAS failures on RTX 50-series GPUs.
- Set `PYTHONUTF8=1` so Hindi text doesn't break on Windows.
- Use **`uv`** for Python (one lockfile on Mac and Windows) and **`pnpm`** for Node.

**Sharing work**
- Datasets are stored as Parquet in a **private Hugging Face dataset repo** (versioned, free, works on every OS). Model files are small enough to live in git.
- Code goes through git: I work in this repo on your Mac, you review and commit, teammates pull. Teammates using Claude Code on their own machines follow the same no-commit rule.

### 9.2 What comes first (in order)
**Step 1, the contract** (Mac, you and me, before anything else). We define the `Analysis` schema: curve bins, bands, metrics, flags, evidence, attributions, edits, deltas and provenance. It's written once as Pydantic models and exported as JSON Schema and TypeScript types. We also build 2–3 **fixture analyses** from real public transcripts.
*Why first:* the contract lets all three tracks work in parallel from day one. The UI is built without waiting for the model, and data/ML know exactly what they have to produce. Fixture curves are clearly marked as development data and never shown as results.

**Step 2, three tracks at once:**
| Machine | First tasks, in order |
|---|---|
| Windows A (data) | WSL2 + CUDA check → data spike (20 videos: "Most replayed", Hindi captions, chapters) → **start D1 collection running in the background.** It takes the longest and the model can't be trained until it's well underway → SponsorBlock pull → start gathering D2 screenshots |
| Windows B (ML) | CUDA + faster-whisper check → feature package v0 on the spike videos → embedding and dual-labeling pipeline (Claude Batches + Groq) → **first model as soon as about 300 videos are in**, then retrain as the data grows |
| Mac (UI) | `/impeccable init` interview → `shape` → **you pick the visual direction** → DESIGN.md → scaffold Next.js with GSAP, Lenis and Motion → build the Workspace against fixtures. Alongside (light work): FastAPI skeleton + LLMRouter for Claude and Groq |

**Step 3, first integration.** The API serves real model output into the Workspace and the fixtures are retired. From here we follow Phases 3–8 below.

## 10. Build phases

Tracks: **A** Data/ML · **B** API/pipeline · **C** UI. Each phase has an exit check before the next one starts.

| Phase | Deliverables | Exit check |
|---|---|---|
| **0. Foundations & spikes** | `Analysis` contract and fixtures; Windows CUDA, Whisper and WSL2 setup; check "Most replayed", captions (incl. Hindi) and chapters on 20 videos; check the Claude and Groq models and structured outputs; prototype the digitizer on 5 screenshots; scaffold the monorepo; impeccable `init` + `shape` → PRODUCT.md and DESIGN.md | Contract frozen, every machine set up, data sources and engines confirmed, you've approved the visual direction |
| **1. Data** | Collect D1, D1-media, D2 (digitized) and D3; data card | Every target cell filled, or the shortfall documented |
| **2. Model & evaluation** | Feature package; dual LLM labels; interest model; hazard fit; ensemble; `eval_report.json` v1 with all baselines, CIs and norms | Beats position-only *and* both zero-shot LLM baselines on the holdout |
| **3. Core loop** | API pipeline with SSE; Workspace (curve, flags, inspector, transcript and video sync); edits, re-simulation and edit stack; engine switch | Full demo flow works on all six samples (3 categories × EN/HI) |
| **4. Differentiators** | Promise Ledger, open-loop arcs, redundancy map, pacing lanes, Hook Lab, Title Fit, Chapter Advisor, exports, video mode, live editor, versions | Every Differentiator works end to end |
| **5. Validation & discovery** | Validation Lab, blind test, Channel X-Ray, Retention Import, Category Norms | Every page renders real report data |
| **6. Finish** | impeccable critique, audit, harden and polish; performance pass; Playwright end-to-end tests; demo mode (pre-cached projects, replay of recorded streams if the network fails); deploy | Demo runs end to end three times in a row with nothing breaking |
| **7. Pitch kit** | README, architecture diagram, model card, data card, 2–3 min demo video, pitch deck, judge Q&A rehearsal | Dry run under time with Q&A |
| **8. Showstoppers** | G1–G5, in order of how much they impress | Each one can be shipped on its own |

---

## 11. Demo script (≈3 min)

1. **Landing → sample:** a Hinglish tech-review script ("₹20k phone camera comparison").
2. The analysis streams in and the curve draws. Headline metrics in Studio terms.
3. Biggest cliff: *"Title promise 'kaunsa camera best hai' first addressed at 2:40; top Hindi tech reviews address it by 0:15."* The Promise Ledger lights up.
4. Apply three fixes. The ghost curve rises; *viewers at the verdict* goes up. Export DaVinci markers.
5. **Hook Lab:** Claude's and Groq's hooks compete; the retention model picks the winner.
6. **Validation Lab:** results against the baselines, including "just ask an LLM".
7. **Judge's turn:** they paste any public video URL (blind test) or a channel (X-Ray), and we reveal the actual curve.

*(Every number in the demo is computed live; no scripted values.)*

---

## 12. Judge Q&A prep (analytics experts will ask these)

| Question | Our answer |
|---|---|
| "Most replayed" isn't retention. | Correct. We use it for *shape*, and set the absolute level from real Studio curves. We measured how closely the two agree and show that number. |
| Retention depends on thumbnail, CTR and traffic source. | Yes. We predict *in-video* retention given a click; the title and thumbnail feed in only through their promise. We say this openly. |
| Isn't this just an LLM? | No. An LLM-only baseline is in the Validation Lab, and we beat it. LLMs extract features; a trained model predicts. |
| Big channels bias the data. | We mix in mid-sized channels and smaller creators' digitized curves; results are broken down per cell. |
| Data leakage? | Splits are by channel, and the frozen holdout was used once. |
| Do the edit improvements hold up? | They're model estimates. We check them against natural experiments (sponsor reads, hook timing), and the UI wording says so. |
| Hindi? | Separate metrics per language; fillers in both scripts; Whisper large-v3; a code-mixed Hinglish sample. |

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| YouTube blocks scraping, or the "Most replayed" format changes | Checked in Phase 0; collect from local machines with rate limits; cache everything; pre-cache demo videos and channels |
| D2 too small | Bootstrap confidence intervals; the absolute level is labelled as calibrated on n = N; shape results stand on their own |
| The two engines disagree | Fixed labeler for each model release; agreement and accuracy published |
| LLM latency or cost | One or two calls per video; Claude Batches for offline work; Groq for live; content-hash cache; partial results streamed |
| Hinglish ASR or embeddings weak | Whisper large-v3; transcript editable in the UI; fillers in both scripts; per-language reporting |
| Feature sprawl hurts polish | Tier gates: Showstoppers only once Phase 6 is green |
| Demo-day network failure | Demo mode with pre-cached projects and recorded streams |
| RTX 50-series toolchain problems (PyTorch or CTranslate2 can't see the GPU) | Fixed versions (cu128, CTranslate2 4.5+, float16); fall back to Groq Whisper so data work never stalls |
| MacBook Air slows down during the demo | The demo machine only calls APIs and runs light local models; heavy jobs run offline on the Windows GPUs; demo projects are pre-cached; animations are kept to transform and opacity |
| Animation hurts usability or frame rate | Two energy levels (big on Persuade/Read pages, quick and precise on Operate pages); reduced-motion support; frame rate checked in the impeccable audit |

---

## 14. Open decisions for you
1. ~~Name~~ — decided: **Retent AI** (may change later).
2. **How many teammates are there?** §9 assumes two on Windows GPU laptops.
3. **Approve the scope**, or move any feature between tiers.
4. **Approve the stack** (including GSAP, Lenis and Motion), or tell me what to change.

## 15. Working rules
- Claude never commits. If you ask for a commit, no Claude co-author or attribution lines.
- No fabricated numbers, testimonials or benchmarks anywhere.
- All UI work goes through impeccable; visual direction is chosen by you during its workshop.
- Data use: public metadata, captions and derived features for research; no videos redistributed.
