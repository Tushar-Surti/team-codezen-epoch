# Retent AI: presentation guide and panel Q&A

Everything you need to present Retent AI to a judging panel: the story, the demo, every feature and why it stands out, the proof, and detailed answers to the questions panels ask (including the famous ones).

All numbers come from the current evaluation run (`models/eval_report.json`, model `lgbm-20261003-0338`, 338 videos from 64 channels). If you retrain, re-read them from the **Accuracy** page (`/lab`) and update the [numbers cheat sheet](#numbers-cheat-sheet).

---

## Contents

1. [The pitch in one breath](#1-the-pitch-in-one-breath)
2. [The problem](#2-the-problem)
3. [The 5-minute demo](#3-the-5-minute-demo)
4. [Every feature, and why it stands out](#4-every-feature-and-why-it-stands-out)
5. [How it works](#5-how-it-works)
6. [The proof](#6-the-proof)
7. [Trust built in: confidence, explanations, disclaimers](#7-trust-built-in-confidence-explanations-disclaimers)
8. [Panel Q&A: the famous questions](#8-panel-qa-the-famous-questions)
9. [Panel Q&A: technical deep dives](#9-panel-qa-technical-deep-dives)
10. [Panel Q&A: data, ethics and legality](#10-panel-qa-data-ethics-and-legality)
11. [Panel Q&A: product, market and business](#11-panel-qa-product-market-and-business)
12. [Panel Q&A: trap questions and honest limits](#12-panel-qa-trap-questions-and-honest-limits)
13. [Numbers cheat sheet](#numbers-cheat-sheet)
14. [Before you present: checklist and fallbacks](#before-you-present-checklist-and-fallbacks)

---

## 1. The pitch in one breath

> **Retent AI reads your script before you shoot (or your rough cut before you publish), predicts where viewers will stop paying attention, circles the exact lines that cause it, writes the fix in your own voice, in English, Hindi or Hinglish, and re-simulates the edited version to show what the fix is worth. And it proves its accuracy openly, against real YouTube viewer data, on channels it has never seen.**

Tagline: **Predict the drop. Fix the video. Keep them watching.**

Three things make it different. Say them early and come back to them:

1. **A trained model draws the curve, not an LLM.** LLMs only read the script and write fixes. The prediction comes from a model trained on what real viewers did.
2. **Evidence before advice.** Every flag shows the quoted line, the timestamp, the measured signals behind it, and how many viewers it costs per 1,000.
3. **Accuracy shown openly.** Tested blind on 64 channels, against baselines including "just ask an LLM", with confidence intervals, failure cases, and a confidence level on every prediction.

---

## 2. The problem

- **Retention decides reach.** YouTube recommends videos that keep people watching. Two videos with the same click-through rate get very different reach if one loses half its viewers in the first 30 seconds.
- **Creators only find out after publishing.** YouTube Studio's audience-retention graph appears days after upload, when the video can no longer be changed, and only for channels you own.
- **Fixing it is guesswork.** "Your intro is too long" is advice everyone gives. Which line loses viewers, how many, and what to write instead? Creators can't test that before shooting.
- **Most tools ignore non-English creators.** A huge share of YouTube's creator growth is Hindi and Hinglish. Most tools treat it as an afterthought.

**Who it's for:** solo and small-team creators making 5–15 minute tech reviews, explainers and vlogs, usually without an editor. Also the editor who receives the hand-off, and analysts studying channels.

---

## 3. The 5-minute demo

Start the app with **`start.cmd`** (Windows) or **`sh start.sh`** (Mac) a few minutes before. It opens at `http://localhost:3000`.

| Time | Screen | What to do | What to say |
|---|---|---|---|
| 0:00 | **Landing** `/` | Scroll slowly | "YouTube ranks videos by retention, but creators only see where viewers left *after* publishing. Retent AI shows it before you shoot." |
| 0:30 | **Sample workspace** `/a/sample-hinglish-tech` | Point at the red-pen drop on the curve | "A Hinglish phone-review script. In five seconds you see the biggest drop: no clear hook in the opening. Every flag comes with the exact lines, the signals behind it, and the viewers it costs per 1,000." |
| 1:00 | Same | Point at the **confidence panel** top right | "And it tells you how much to trust it, with evidence: how well the model did on videos like this one, on channels it never saw. When it isn't sure, it says so." |
| 1:20 | Same | Apply 2–3 fixes → Blue revision | "The fixes are written in the creator's own Hinglish, then re-simulated by our model. You get a Blue revision like a real shooting script: changed lines marked, and the predicted gain in viewers who reach the payoff." Open **Export**: DaVinci markers, chapters, CSV, revised script. |
| 2:00 | **Hook Lab** `/hooks` | Generate hooks | "The first 30 seconds decide most of the curve. The AI pitches five openings; our model re-simulates each one and ranks them by viewers kept." |
| 2:30 | **Blind test** `/blind` | Pick an Education · English video → **Predict blind** → read the confidence card → **Reveal** | "The model never trained on this channel. Black is our prediction from the transcript alone; violet is YouTube's real curve. Below it: where they agree, where they differ, and *why*." Toggle **Compare with AI alone**. |
| 3:20 | **Accuracy** `/lab` | Show the table | "Tested blind on 338 videos from 64 channels. We beat the timing-only baseline on 70% of videos, and on the same 40 videos we beat a large LLM asked directly: +0.19 against +0.04. That's why this needs a trained model, not a prompt." |
| 3:50 | **Channel X-Ray** `/xray` or **Shorts** `/shorts` | One quick run from the dataset list | "Channel X-Ray finds which habits cost a channel viewers, measured against real curves. Shorts Finder turns the strongest moments of a long video into ready-to-post Shorts." |
| 4:20 | **Live** `/new` → paste a judge's YouTube link | Wait ~30 s | "Give us any YouTube link." Fetch → transcribe → predict → **vs YouTube** → reveal and explain. |
| 5:00 | Close | | "Predict the drop. Fix the video. Keep them watching." |

**If something fails live:** if YouTube blocks the link, say "YouTube rate-limits per connection" and switch to the Blind test, which needs no network. If the LLM is slow, the sample workspace and the Blind test are already computed.

---

## 4. Every feature, and why it stands out

### 4.1 Predicted retention curve (the core)

**What it does.** Paste a script, a YouTube link, or upload a rough cut. You get a full retention curve at YouTube's own 1% resolution, with a likely-range band, and the metrics creators already know from YouTube Studio: **intro retention at 0:30, average percentage viewed (APV), average view duration (AVD), and viewers still watching at the payoff**.

**Why it stands out.**
- Works **before shooting**, from a script alone. Studio only shows retention after publishing.
- Uses Studio's vocabulary, so creators and analysts read it instantly.
- The curve is labelled **uncalibrated** until the absolute level is fitted on real Studio curves. The *shape* (where attention rises and falls) is what's validated, and the product says so.

### 4.2 Reasoned flags with evidence

**What it does.** Eleven detectors look for the patterns that lose viewers:

| Flag | Example |
|---|---|
| Late hook | "No clear hook in the opening: ≈70 of every 1,000 gone by 0:32" |
| Promise debt | The title's promise is first addressed at 2:40 and paid off at 11:20 |
| Repetition | 1:10–1:30 repeats 0:20–0:40 |
| Tangent | A 45-second story drifts off the title's promise |
| Low density | A stretch adds little new information, or is full of fillers (*um, basically, matlab, toh*) |
| Early ask / sponsor placement | "Subscribe ask at 0:10, before any value" |
| Premature wrap-up | "So that's it" with two minutes left |
| Open loop never closed | A tease at 0:20 that never pays off |
| Jargon spike (education) | Several heavy terms back to back without an example |
| Static shot (rough cut) | No visual change for 50 seconds |
| Dead air (rough cut) | A 4-second silence |

Each flag shows **severity (viewers lost per 1,000), the quoted lines, the timestamp, and the measured signals behind it**.

**Why it stands out.** Not "your intro is long", but *which line*, *how many viewers*, and *why*, traced to measured signals (SHAP contributions from the model). Advice you can check.

### 4.3 Fixes written in your voice, then re-simulated

**What it does.** Every flag gets a concrete edit: cut, trim, move, insert a hook line, rewrite, add a pattern interrupt (b-roll, punch-in, on-screen text), or re-chapter. New lines are written by an LLM **in the script's own language and voice** (Devanagari stays Devanagari, Hinglish stays Hinglish). Then the edit is applied, timing and features are recomputed, and the model re-runs to show the gain.

**Why it stands out.**
- The gain is measured as **viewers who reach the payoff and total watch time**, not just APV. APV goes up whenever you cut time, which would reward deleting content.
- **The model never recommends an edit it expects to hurt.** A fix is kept only if the model predicts a gain in viewers at the payoff, intro retention or watch time; otherwise the fix is dropped and the flag stays. Every fix shows all three numbers, so a trade-off (for example, more watch time but slightly fewer viewers at the payoff) is visible.
- Fixes stack into **Blue and Pink revisions**, like a film's shooting-script revisions, with changed lines marked.

### 4.4 Exports for the edit

Timeline markers for **DaVinci Resolve (EDL)**, **YouTube chapters**, a **revised script** with changes marked, and a **CSV** of flags and fixes. The workspace also has a synced playhead across the curve, timeline lanes (drop risks, promise, loops, sections, new information, pace, fillers) and the script.

**Why it stands out.** It meets editors in their own tools instead of being another dashboard.

### 4.5 Hook Lab

**What it does.** The LLM pitches five alternative openings in the creator's voice. The retention model re-simulates the video with each one and **ranks them by predicted intro retention and viewers at the payoff**.

**Why it stands out.** The LLM is creative; the model is the judge. Ideas are scored, not just generated.

### 4.6 Three ways in: script, YouTube link, rough cut

- **Script mode:** paste any script. Timing is estimated from speaking rate.
- **YouTube link:** fetches metadata, chapters and the "Most replayed" curve, plus captions, or transcribes the audio with Whisper when captions are blocked. ~20–40 seconds.
- **Rough cut upload:** MP4, MOV, MKV, WebM or audio. Whisper transcript, plus **ffmpeg shot-cut detection and silence detection**, adding static-shot and dead-air flags, cut-rate and silence lanes, and a synced video player.

**Why it stands out.** Useful at every stage: writing, editing and post-mortem.

### 4.7 Blind test

**What it does.** Pick any of 338 public videos. The model, **trained without that video's channel**, predicts from the transcript alone. Before the reveal, a confidence card says how much to trust it, with evidence. Then YouTube's real "Most replayed" curve sweeps in, with scores (shape match, biggest moments found, quietest stretches found), a verdict, and **where the curves agree and differ, with the line that was spoken there and the likely reason**. A toggle overlays a zero-shot LLM's guess for comparison.

**Why it stands out.** Most AI demos ask you to trust them. This one lets a judge test it on a video they choose, shows failures openly, and explains them.

### 4.8 Accuracy page (Validation Lab)

**What it does.** Renders the evaluation report as-is: our model against timing-only, rules-only, random and zero-shot LLM baselines, with 95% confidence intervals, results per category and language, the top signals, and a gallery of best, typical and worst videos.

**Why it stands out.** Every number in the product is computed by the pipeline. Nothing is typed in by hand.

### 4.9 Channel X-Ray

**What it does.** Paste a channel (or pick one from the dataset). It gathers recent long videos that have YouTube's real curve, transcribes them, measures every kind of moment (greetings, asks, sponsor reads, hooks, tangents) against the real curves, and compares them with other channels. Output: which habits cost this channel viewers, where its videos sag, and plain next-video advice.

**Why it stands out.** Competitor and self-analysis from public data, without channel access.

### 4.10 Studio check (Retention Import)

**What it does.** Upload a screenshot of a YouTube Studio retention graph. The digitizer finds the blue line and the gridlines, reads it into a 100-point curve, and compares it with our prediction: average gap in points, shape match, intro retention and APV. (On a synthetic test chart it recovered the curve to within 0.5 points.)

**Why it stands out.** Any creator can check us against their *real* absolute retention without giving us channel access. It also builds the dataset that will calibrate the absolute level.

### 4.11 Shorts Finder

**What it does.** Picks the 3–4 strongest 22–58 second stretches of a long video, using YouTube's real "Most replayed" curve when available and predicted interest otherwise. It starts and ends on sentence boundaries and avoids asks, sponsor reads, greetings and wrap-ups, which don't stand alone. An LLM writes each Short's title, on-screen hook and description. It renders a **vertical 1080×1920 MP4** with a blurred-fill background, a hook card, and a "Watch the full video" end card.

**Why it stands out.** It turns one long video into ready-to-post Shorts that point back to the full video.

### 4.12 Two LLM engines with provenance

Deep (Claude) and Fast (Groq GPT-OSS), with automatic failover, multiple Groq keys and fallback models, and a cache. **Every AI-written output carries a provenance badge** (which provider and model wrote it). Without any keys, the app still works with keyword rules.

### 4.13 Built for Hindi and Hinglish

Language detection across English, Hindi (Devanagari) and Hinglish (romanized); filler lexicons in both scripts; a script-agnostic similarity method that works across Latin and Devanagari without downloading models; Whisper large-v3 for Hindi audio; fixes written in the script's own language. Accuracy is reported per language.

### 4.14 Quality of the experience

A distinctive "revision draft" design (a shooting script with a script doctor's red pen), light and dark themes, a resizable split view, keyboard control of the curve and lanes, the curve available as a data table for screen readers, reduced-motion support, and a **one-command start** for new users.

---

## 5. How it works

```
script / transcript / rough cut
        │
        ▼
sentences with timestamps ── measured (captions, Whisper) or estimated (speaking rate)
        │
        ▼
100 equal time bins (YouTube's own 1% resolution)
        │
        ▼
features per bin ── pace, fillers, questions, "you" rate, numbers, new information,
                    repetition, fit to the title's promise, topic drift, hooks, asks,
                    sponsor reads, wrap-ups, open/closed loops, jargon, time since the
                    last hook, position; (rough cut) static shots, silence
        │          (optional LLM read: segment roles, promises, loops, payoff)
        ▼
interest model ── position prior (everyone watches the start)
                  + LightGBM on what the script adds (18 text features)
                  + a light expert prior for rare events (asks, sponsors, hooks)
                  → relative interest per bin, explained with SHAP values
        │
        ▼
hazard integrator ── category baseline (intro cliff, steady decay, end-screen exit)
                     modulated by interest → absolute retention curve R(t)
        │
        ├──► flags (with evidence and severity) ──► fixes (LLM-written)
        │                                              │
        │                         apply edit, recompute, re-run ◄┘
        ▼
metrics, curve, confidence (from held-out evidence), exports
```

**Training target.** YouTube's public "Most replayed" curve, z-scored within each video, so the model learns the *shape* of attention: which parts are stronger or weaker than the rest of the same video.

**Evaluation.** 5-fold GroupKFold **by channel**: no creator ever appears in both training and test. Scored per video with Spearman rank correlation (shape match), share of the 10 most-replayed moments found, and share of the 10 quietest stretches found (each within ±1% of the video).

**Stack.** Next.js 16 + TypeScript (web), FastAPI on Python 3.12 (API), LightGBM + SHAP (model), Claude and Groq behind one router (LLMs), Whisper large-v3 (speech-to-text, locally on a GPU or via Groq), ffmpeg (media), yt-dlp (public YouTube data). One shared Pydantic contract generates the TypeScript types, so the API and UI can't drift apart.

---

## 6. The proof

### Held-out accuracy (338 videos, 64 channels the model never trained on)

| Method | Shape match (Spearman) | Top-10 peaks found | Quietest 10 found |
|---|---|---|---|
| **Retent AI model** | **+0.244** (95% CI +0.22 to +0.27) | **31%** | **47%** |
| Timing only (average curve shape) | +0.176 | 28% | 47% |
| Rules only (hand-set weights, v0) | +0.094 | 27% | 21% |
| Random | −0.007 | 18% | 17% |

- The model **beats timing-only on 70% of videos**, rules-only on 73%, and random on 82%.
- It finds **2.8× as many of the quietest stretches as chance** (47% vs 17%).

### Against "just ask an LLM" (same 40 held-out videos)

| Method | Shape match |
|---|---|
| **Retent AI model** | **+0.186** (CI +0.09 to +0.28) |
| Zero-shot LLM (GPT-OSS-120B), asked for the curve directly | +0.038 (CI −0.04 to +0.12, includes zero) |
| Timing only | +0.079 |

The model beats the LLM on **63% of these videos**. The LLM's confidence interval includes zero: asked directly, it can't reliably tell where viewers rewatch.

### By category and language (mean shape match)

| | English | Hindi / Hinglish |
|---|---|---|
| Education | +0.33 (56 videos) | +0.41 (13) |
| Vlog | +0.30 (24) | +0.31 (50) |
| Tech | +0.22 (150) | +0.08 (45), our weakest |

### It improves with data

The previous model, trained on 61 videos from 18 channels, scored +0.12. Retrained on 338 videos from 64 channels with the same method, it scores **+0.244, about double**. Training takes seconds, and the curve is still rising.

---

## 7. Trust built in: confidence, explanations, disclaimers

Analytics experts distrust black boxes. Retent AI shows when to trust it and when not to.

**Confidence on every prediction, from evidence.** Each analysis carries a **High, Medium or Low** confidence level. It isn't the model grading itself. It's how well the model matched real YouTube curves **on held-out videos like this one** (same category and language, channels it never saw). For example: *"On 56 Education · English videos from channels it never trained on, the predicted shape matched YouTube's real curve in 93% of them (median rank correlation +0.31)."*

**It drops when the input is outside what was tested,** with the reason stated:
- a script with **estimated timing** (the model was tested on real transcripts with measured timing),
- a length **outside 5–15 minutes**,
- a group with **few test videos**.

We checked which properties actually predict accuracy. Category and language did; transcript source and the model's own signal strength didn't, so they aren't used. Across the 338 test videos: 106 high, 187 medium, 45 low.

**Disclaimers when unsure.** Low confidence shows a clear warning: *"Use the flagged drops as hints to check, not as predictions. The exact percentages are not calibrated."* The absolute level is separately labelled **Uncalibrated**.

**Explanations when the prediction differs from reality.** In the Blind test and in "vs YouTube" for any analysed public video, after the reveal you get:
- a verdict (strong, partial, weak match, or miss, with how often misses happen),
- **where they differ**: the time range, what was said there, and the likely reason. For example, *"Little is said here, so viewers are most likely rewatching something on screen (a demo, a result, b-roll). The model only reads the words."* Or *"This stretch is dense with numbers; 'Most replayed' counts rewatches, and people replay facts they want to catch."*
- **where they agree**,
- in the Blind test, **what we said before the reveal**, so you can see whether the confidence was justified.

**Honest charts.** Both curves are scaled the same way (each between its own 5th and 95th percentile), so one extreme moment, usually the opening, can't flatten the rest. The scores compare ranks, so they don't depend on the scaling.

---

## 8. Panel Q&A: the famous questions

### "How is this different from just pasting the script into ChatGPT and asking where viewers will drop?"

This is the most important question, and we tested it directly.

1. **We measured it.** On the same 40 held-out videos, a large LLM (GPT-OSS-120B) asked for the curve directly scores **+0.04** shape match, and its confidence interval includes zero, so it's statistically indistinguishable from guessing. Our trained model scores **+0.19**, and beats it on 63% of the videos. You can toggle the LLM's guess on in the Blind test and watch it miss.
2. **LLMs know what a "good script" sounds like, not what real viewers do.** An LLM has never seen YouTube's per-second rewatch data for these videos. Our model is trained on exactly that: 338 videos' real "Most replayed" curves.
3. **An LLM gives opinions; we give measurements.** Every flag traces to measured signals (pace, repetition, promise fit, new information), with SHAP contributions and a quoted line. Ask an LLM twice and you can get two different answers; our model is deterministic.
4. **An LLM can't tell you what a fix is worth.** We re-simulate the edited script and report viewers kept at the payoff. An LLM can only claim a fix is better.
5. **An LLM won't tell you when it's wrong.** We show a confidence level backed by held-out evidence, and disclaimers when it's low.
6. **We do use LLMs, for what they're good at:** reading the script (hooks, promises, loops, sections) and writing fixes in the creator's voice. They never draw the curve.

### "YouTube's 'Most replayed' isn't retention. Aren't you training on the wrong thing?"

Correct, it isn't retention, and we say so on every page. "Most replayed" is YouTube's public signal of **relative interest within a video**, rewatches included. It's the best public signal of *where attention rises and falls*, so it trains the **shape**. The **absolute level** (what percentage remain) comes from the hazard engine's category baseline and is labelled **uncalibrated** until it's fitted on real Studio curves. The Studio check feature collects exactly those curves: any creator can upload a Studio screenshot and see how we compare. We don't have private retention data because we don't own channels, and we chose an honest public signal over a fake private one.

### "A correlation of 0.24 sounds low. Is this actually useful?"

1. **Context matters.** Per-moment "Most replayed" data is noisy: it mixes rewatching, skipping and visual moments a transcript can't see. Even timing alone (people watch the start) only reaches +0.18, and a large LLM gets +0.04.
2. **It's consistently above every baseline**, with tight confidence intervals (+0.22 to +0.27), and wins on 70% of videos against timing alone.
3. **The practical metrics are strong:** it finds 47% of the quietest stretches, 2.8× chance. Those are exactly the parts a creator should fix.
4. **It's still improving:** doubling from 61 to 338 videos took it from +0.12 to +0.24.
5. **We don't hide it.** The product shows per-video scores, failures and confidence levels. A tool that claimed 0.9 on this data would be lying.

### "How is this different from YouTube Studio, vidIQ or TubeBuddy?"

- **YouTube Studio** shows real retention, but **only after publishing** and only for your own channel. We predict **before shooting**, explain *why*, and simulate fixes. We complement Studio; the Studio check even compares our prediction against your Studio graph.
- **SEO and title tools** focus on getting the **click** (keywords, titles, thumbnails). We focus on what happens **after the click**: keeping the viewer watching, which is what recommendations reward.
- **Generic AI script tools** give opinions without measured evidence or validation. We publish our accuracy against baselines.

### "What's genuinely novel here?"

1. A **validated, public-data retention model** that works on **scripts before shooting**, in **English, Hindi and Hinglish**.
2. **Counterfactual simulation:** apply an edit, re-time the script, re-run the model, and measure the gain in viewers at the payoff, not inflated APV.
3. **The LLM writes, the model judges:** hooks and fixes are generated, then scored by a model trained on real viewers.
4. **Built-in honesty:** blind tests on held-out channels, confidence levels backed by evidence, explanations when it's wrong, and a zero-shot LLM baseline in the product.

### "How do you know it isn't overfitting?"

The evaluation is **GroupKFold by channel**: every score is on a creator the model never trained on, so it can't memorize a creator's style. The model is deliberately small and regularized (200 shallow trees with 7 leaves, minimum 60 samples per leaf, L2 regularization) and smoothed over neighbouring bins. Results hold with tight confidence intervals across 338 videos, and the Blind test lets anyone check a video themselves.

### "Are the '+X viewers' gains real?"

They're **model estimates** from re-simulating the edited script, not guarantees, and the UI says so. We report **viewers who reach the payoff**, intro retention and total watch time, because APV rises whenever you cut time. We also **drop any fix with no predicted gain on those measures**. The absolute numbers are uncalibrated; the direction and relative size are what the model has evidence for.

### "Why should a creator trust this?"

Because it shows its work. Every flag has a quoted line and measured signals; every prediction has a confidence level based on held-out results for similar videos; low confidence comes with a disclaimer; the Blind test and the vs-YouTube view show where it was right and wrong, and why. And the Studio check lets creators test it against their own real retention.

---

## 9. Panel Q&A: technical deep dives

### "Walk us through the model."

Three parts:
1. **Position prior:** the average shape of attention across videos (everyone watches the start, interest sags in the middle).
2. **A LightGBM residual model** on 18 text features: what this script adds or loses on top of the prior. The top signals by importance are concrete numbers, speaking pace, repetition, new information, direct address, fit to the title's promise, topic drift and jargon.
3. **A light expert prior** (weight 0.3) for rare, well-understood events (asks, sponsor reads, wrap-ups, greetings, hooks, loops), which appear too rarely in the training data for the model to price alone.

The result is smoothed over 7 bins and turned into a retention curve by a **discrete-time hazard integrator**: `h_i = 1 − (1 − h0_i)^exp(−β·interest_i)` and `R_i = Π(1 − h_j)`, where `h0` is the category baseline (intro cliff, steady decay, end-screen exit).

### "Why LightGBM and not deep learning or a transformer?"

- **Data size:** 338 videos. Deep models need far more and would overfit.
- **Explainability:** LightGBM gives exact per-feature SHAP contributions, which power the flags ("this drop is driven by repetition"). A neural net would be a black box.
- **Speed:** training takes seconds and inference milliseconds, so every fix can be re-simulated live.
- **Honesty:** with a small, regularized model, the gains over baselines are real signal, not memorization.

A temporal neural model is on the roadmap as a challenger; we'd ship whichever wins on the held-out set.

### "How do you handle Hindi and Hinglish?"

Language detection across Devanagari and romanized text; filler lexicons in both scripts (*um, basically, matlab, toh, यानी*); question words in both (*kya, kyun, kaise, क्या, क्यों*); and a **script-agnostic similarity method** (hashed character n-grams) that compares Latin and Devanagari text without downloading models. Hindi audio is transcribed with Whisper large-v3. Fixes are written in the script's own language. Accuracy is reported per language: Hindi education and vlogs are among our best groups; Hindi tech is our weakest, and the product says so with a low confidence level.

### "How do you get transcripts when YouTube blocks captions?"

Public data via yt-dlp. When captions are rate-limited or missing, we download only the audio to a temporary folder, transcribe it with **Whisper large-v3** (locally on a GPU, or via Groq), and delete the audio immediately. Most of our training transcripts (319 of 338) were made this way, on a local RTX GPU.

### "How is timing estimated for a script that hasn't been recorded?"

From speaking rate per language (words per second plus pauses at sentence ends). This is less accurate than real timing, so **script-mode predictions are automatically one confidence level lower**, with that reason shown.

### "How do flags get their severity?"

Counterfactually: for each flag we neutralize the negative contributions of its signals in the affected bins, re-integrate the hazard, and measure the difference in viewers lost per 1,000 starters.

### "What does the LLM actually do, and what if it hallucinates?"

It returns structured JSON (validated with Pydantic): segment roles (hook, payoff, tangent, sponsor, ask, outro), promises, open and closed loops, section titles; and it writes fix text and hooks. It is guarded against invented timings and content. Its output only adjusts feature labels or proposes text, and **every proposed fix is re-simulated by the model**: a fix that doesn't help is dropped. If no LLM is available, keyword rules take over and the UI says so.

### "How do you measure accuracy for one video?"

Spearman rank correlation between the predicted interest and YouTube's curve across the 100 bins (the shape), plus the share of the 10 most-replayed and 10 least-replayed moments found within ±1%. Rank-based metrics don't depend on scale, which matters because "Most replayed" is relative.

### "What happens with rough cuts? Can it see the video?"

It measures **shot cuts** (ffmpeg scene detection) and **silences** (ffmpeg silence detection). These add static-shot and dead-air flags, cut-rate and silence lanes. There is no training data for visual features yet, so they're scored with expert rules at half weight, and the product labels this. It doesn't yet recognize faces, on-screen text or visual content; that's on the roadmap.

### "How fast is it, and what does it cost?"

A script analysis takes a few seconds, most of it the optional LLM read (~3.5 s on Groq). The model itself runs in milliseconds. A YouTube link takes 20–40 seconds including the transcript. Training takes seconds on a laptop. Running costs: Groq's free tier covers the LLM calls; Whisper can run locally on a GPU at no cost.

### "How is the software engineered?"

A monorepo: Next.js web app, FastAPI service, a shared Python core (contract, features, engine, flags, simulator, trust), and an offline ML package (collection, transcription, training, evaluation). One Pydantic contract generates the JSON Schema and TypeScript types. Analyses stream progress over server-sent events. 60 automated tests cover the core and API, plus Playwright browser flows for every feature. One command (`start.cmd` / `start.sh`) installs and starts everything.

---

## 10. Panel Q&A: data, ethics and legality

### "Where does your data come from?"

Public YouTube videos (5–15 minutes, at least a month old, with a "Most replayed" curve) across 6 groups: tech, education and vlogs, each in English and Hindi. 609 videos collected, 338 with transcripts, from 64 channels. Plus SponsorBlock's public sponsor-segment labels.

### "Is scraping YouTube legal? What about the terms of service?"

We use only **publicly visible** data (metadata, captions, the public "Most replayed" curve) for **research**. Audio is downloaded only to transcribe and is **deleted immediately**; videos are never redistributed. We're aware that YouTube's terms restrict automated access. For a production product, the path is the official YouTube Data API plus **"Connect your channel" (YouTube Analytics OAuth)**, which would also give creators exact retention curves. Studio check already lets creators share their own data voluntarily.

### "What biases does the dataset have?"

We document them in the data card:
- **Survivorship:** YouTube only shows "Most replayed" on videos with enough views, so the data skews to older, more-watched uploads.
- **Channel concentration:** some channels contribute many videos. That's why we split by channel, never by video.
- **Big creators** already retain well, so the model has seen fewer examples of truly bad videos.
- **Uneven groups:** tech/English has 150 videos; Hindi education has 13. Confidence levels reflect this.

### "What about privacy for creators who upload unreleased cuts?"

Uploads and analyses are stored locally on the machine running the API. To transcribe a rough cut, a small mono audio track is sent to Groq's Whisper; the video itself never leaves the machine, and no upload is used for training. For full privacy, transcription can run locally on a GPU with Whisper (the training pipeline already does this).

---

## 11. Panel Q&A: product, market and business

### "Who would pay for this?"

Solo and small-team creators (the long tail of YouTube, especially fast-growing Hindi and Hinglish creators), editors and agencies who edit for many channels, and brands and strategists studying competitors (Channel X-Ray). A natural model is freemium: free script checks; paid rough-cut analysis, Hook Lab, Shorts rendering, X-Ray and exports.

### "What's the moat?"

The **validated model and the data pipeline** behind it (collection, transcription, evaluation by channel), multilingual support for an underserved market, and a growing dataset of real Studio curves through the Studio check. Prompts can be copied; a trained, evaluated model and its data can't be copied as quickly.

### "What if YouTube removes the 'Most replayed' curve?"

The trained model keeps working; only new training data from that source stops. The roadmap's other sources take over: creator-shared Studio screenshots (already built) and channel connection via OAuth, both of which give *real* retention, a better signal than "Most replayed".

### "Why only 5–15 minute videos?"

That's the core of YouTube long-form for tech, education and vlogs, and where retention matters most for recommendations. We tested on that range, so we say so: longer or shorter inputs get a lower confidence level and a stated reason instead of silent acceptance. Shorts are handled differently: Shorts Finder cuts them *from* long videos.

### "What's next?"

1. **Calibrate absolute retention** on real Studio curves (from the Studio check), turning "uncalibrated" into calibrated.
2. **Connect your channel** (YouTube Analytics OAuth) for exact curves and personalized models.
3. **Visual understanding** for rough cuts: faces, on-screen text, b-roll vs talking head.
4. **More data in weak groups** (Hindi tech first), more channels, mid-size creators.
5. A **browser extension** that overlays the prediction on any YouTube page; a **live script editor** that underlines risky lines as you type; Title Fit; Chapter Advisor.

---

## 12. Panel Q&A: trap questions and honest limits

**Answer limits plainly. Experienced judges respect honesty more than overclaiming.**

| Question | Honest answer |
|---|---|
| "So your absolute percentages are made up?" | They come from a category baseline that hasn't been fitted on real Studio curves yet, which is why the UI labels them **uncalibrated**. The validated part is the shape: where attention rises and falls. Calibration is the next step, and the Studio check collects the data for it. |
| "Your model is bad at Hindi tech." | Yes: +0.08, our weakest group, and the product tells the user with a **Low confidence** level and a disclaimer. It's also the group we're collecting more data for first. |
| "Some Blind test videos are clear misses." | About 16% of held-out videos have negative correlation. We show them anyway, explain why (often visual moments a transcript can't see), and say before the reveal when confidence is low. Hiding misses would make the accuracy page meaningless. |
| "Timing alone beats your model on some videos." | On 30% of them. On average the model is clearly ahead (+0.24 vs +0.18, non-overlapping confidence intervals), and the Blind test shows the timing-only score next to ours on every video. |
| "Can a creator game it, writing to the model instead of to viewers?" | The features reward things viewers reward: new information, paying off the title's promise, less repetition and filler, earlier hooks. Gaming those *is* writing a better video. We'd still validate any change against real curves before trusting it. |
| "Isn't the gain from a fix circular, since your model judges its own suggestions?" | Partly, which is why we label gains as model estimates, measure viewers at the payoff instead of APV, and drop fixes with no predicted gain. The independent check is the held-out evaluation and, going forward, real before/after curves. |
| "61 videos last week, 338 now. Isn't that tiny?" | It's small for deep learning, which is why we use a small, regularized model and evaluate by channel with confidence intervals. The accuracy doubled with that data growth, and we publish the numbers either way. |
| "Did you hand-pick the demo videos?" | No. The Blind test lists all 338 held-out videos, alphabetically, filterable by group. Pick any one. |

---

## Numbers cheat sheet

| Fact | Value |
|---|---|
| Videos collected / with transcripts | 609 / 338 |
| Channels in evaluation | 64 |
| Groups | Tech, Education, Vlog × English, Hindi/Hinglish |
| Evaluation | 5-fold GroupKFold by channel |
| Shape match: model / timing / rules / random | +0.244 / +0.176 / +0.094 / −0.007 |
| Model 95% CI | +0.22 to +0.27 |
| Beats timing-only / rules / random | 70% / 73% / 82% of videos |
| Quietest stretches found: model vs random | 47% vs 17% (2.8×) |
| Top peaks found: model vs random | 31% vs 18% |
| vs zero-shot LLM (40 videos) | +0.186 vs +0.038 (LLM CI includes zero); model wins 63% |
| Best groups | Hindi education +0.41, English education +0.33, Hindi vlog +0.31 |
| Weakest group | Hindi tech +0.08 |
| Previous model (61 videos, 18 channels) | +0.12 |
| Confidence across held-out videos | 106 high, 187 medium, 45 low |
| Videos where the model misses (ρ ≤ 0) | ≈16% |
| Model | Position prior + LightGBM (200 trees, 7 leaves) on 18 text features + expert prior; SHAP explanations |
| Transcripts | 319 Whisper large-v3 (local GPU), 14 creator captions, 5 auto captions |
| Flag detectors | 11 (9 script, 2 rough cut) |
| Tests | 60 automated (core + API) + Playwright browser flows |

---

## Before you present: checklist and fallbacks

**The day before**
- [ ] Run `start.cmd` / `sh start.sh` once on the demo laptop; confirm the banner "Retent AI is running".
- [ ] `GROQ_API_KEY` in `.env` (the LLM read, fixes, Hook Lab, Shorts packaging, Whisper for links without captions).
- [ ] ffmpeg installed (rough cuts, Studio overlays, Shorts rendering).
- [ ] Pre-test 2–3 YouTube links with a "Most replayed" curve for the live demo.
- [ ] Pick your Blind test videos: one **high-confidence strong match** (Education · English) and one **low-confidence** video (Tech · Hindi) to show the honesty features.

**One hour before**
- [ ] Stop any background transcription or training (saves Groq quota and CPU).
- [ ] Open tabs in order: `/` · `/a/sample-hinglish-tech` · `/hooks` · `/blind` · `/lab` · `/xray` · `/new`.
- [ ] Laptop plugged in, notifications off, browser zoom 100%.

**If something breaks**
| Problem | Fallback |
|---|---|
| YouTube blocks a link ("confirm you're not a bot") | "YouTube rate-limits per connection." Switch to the Blind test (no network needed). |
| LLM slow or out of quota | The app falls back to keyword rules and says so; the sample workspace and Blind test are precomputed. |
| A port is busy at start | The launcher names the port. Close the other copy and rerun. |
| A Blind test video misses badly | Use it: "This is why we show confidence before the reveal, and here's why it differs." That's a strength, not a failure. |
