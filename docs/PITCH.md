# Retent AI: pitch and demo kit

Numbers below are from the current evaluation (`models/eval_report.json`, run `lgbm-20261002-2217`). **After retraining on the friend's data, read the fresh numbers off `/lab` and update the lines marked ⟳.**

## One-liner

> **Retent AI reads your script before you shoot, predicts where viewers will leave, circles the lines that cause it, and rewrites the fix in your voice, in English, Hindi or Hinglish. And it proves its accuracy on real YouTube data.**

## Before you present (checklist)

- [ ] API running (`pnpm dev:api`) and web running (`pnpm dev:web`); open `http://localhost:3000` in a fresh browser window, zoom 100%.
- [ ] **Stop the background Groq transcription loop about 1 hour before judging**, so the live YouTube demo has quota.
- [ ] Pre-test 2–3 YouTube links you might use live (each costs about 10 min of Groq audio quota). Keep the ones with a "Most replayed" curve.
- [ ] Open these tabs in order: `/` · `/a/sample-hinglish-tech` · `/hooks` · `/blind` · `/lab` · `/new` (Published video tab).
- [ ] Laptop plugged in. No collection, transcription or training running.

## The 3-minute demo

| Time | Show | Say |
|---|---|---|
| 0:00 | **Landing** `/`, scroll slowly | "YouTube ranks videos by retention, but creators only see where viewers left *after* publishing. Retent AI shows it before you shoot." Scroll: curve draws → red pen circles the drop → Blue revision rises. |
| 0:30 | **Workspace** `/a/sample-hinglish-tech` | "A Hinglish phone-review script. Within 5 seconds you see the biggest drop: *no clear hook*, about 80 of every 1,000 viewers gone in the intro. Every flag comes with the exact lines and the signals behind it." Click a flag to open evidence, why, and the fix. |
| 1:00 | **Apply 2–3 fixes** | "The fixes are written in the creator's own Hinglish by an LLM, then re-simulated by our model. Apply them and you get a Blue revision, like a real shooting script: changed lines marked, intro retention up about 10 points, ~95 more viewers per 1,000 reaching the verdict." Click Export → DaVinci markers. |
| 1:30 | **Hook Lab** `/hooks` | "The first 30 seconds decide most of the curve. The AI pitches five openings; our model ranks them by viewers kept." |
| 1:50 | **Blind test** `/blind` | Pick a video → *Predict blind* → *Reveal*. "The model never saw this channel. Black is our prediction from the transcript alone, violet is YouTube's real Most replayed curve." Toggle *Compare with AI alone*. |
| 2:20 | **Accuracy** `/lab` | "Tested blind on ⟳ 61 public videos from 18 channels. We beat the position baseline on ⟳ 66% of videos, and on the same 26 videos we beat a large language model asked directly, ⟳ +0.16 vs +0.08. That's why this needs a trained model, not a prompt." |
| 2:45 | **Live**: `/new` → Published video, paste a judge's link | "Give us any YouTube link." It takes ~30 s: fetch → transcribe → predict → reveal YouTube's curve. |
| 3:00 | Close | "Predict the drop. Fix the video. Keep them watching." |

**If anything fails live:** YouTube blocks a link → say "YouTube rate-limits per connection" and use `/blind` instead (it needs no network). Groq slow → the sample workspace and Blind Test are fully cached.

## What's real (say this with confidence)

- **Data:** public YouTube videos with YouTube's own "Most replayed" curve, transcripts from captions or Groq Whisper, English and Hindi, tech/education/vlog.
- **Model:** a position prior (people watch the start) plus a LightGBM model on what the script adds: promise payoff, repetition, new information, pace, numbers, fillers. Explanations come from its SHAP values.
- **Honest evaluation:** split by channel (no creator in both train and test), 95% confidence intervals, compared against position-only, rules, random and a zero-shot LLM. Failure cases are shown on `/lab`.
- **LLM role:** reads the script (hooks, promises, loops, sections) and writes fixes in the creator's voice. **It never draws the curve.**

## Judge Q&A

| Question | Answer |
|---|---|
| "Most replayed" isn't retention. | Correct, and we say so on every page. It's YouTube's public signal of *relative* interest within a video, so it trains the *shape*: where attention rises and falls. The absolute level is labelled uncalibrated until it's fitted on real Studio curves, which is the next step (screenshot import). |
| Why not just ask ChatGPT? | We tested exactly that. On the same 26 held-out videos, a large LLM asked directly scores ⟳ +0.08 shape match, and its confidence interval includes zero. Our trained model scores ⟳ +0.16. LLMs read scripts well; knowing where real viewers rewatch takes training on what viewers did. |
| The correlation looks small. | Per-second "Most replayed" is noisy (it includes rewatches), and position alone only gets ⟳ +0.08. We're consistently ahead of every baseline, find ⟳ 39% of the quietest stretches against 17% by chance, and improve as data grows. Training takes 5 seconds. |
| How much data? | ⟳ 61 videos with transcripts from 18 channels in the evaluation, with ~600 more collected and being transcribed. Channels are mixed (big and mid-size) across 6 language × category cells. |
| Data leakage? | The split is GroupKFold by channel, so a creator's style can never appear in both training and test. |
| How do you get transcripts if YouTube blocks captions? | yt-dlp for public data; when captions are rate-limited, we download only the audio, transcribe it with Groq Whisper, and delete it. |
| Hindi / Hinglish? | Language detection, Devanagari + romanized filler lexicons, Whisper large-v3 for Hindi, fixes written in the script's own script and language. Results are reported per language on `/lab`. |
| Are the "+X viewers" gains real? | They're model estimates from re-simulating the edited script, not guarantees, and the UI says so. We report viewers kept at the payoff, not just APV, because cutting time inflates APV on its own. |
| What's next? | Calibrating absolute retention on public Studio screenshots, Channel X-Ray for competitor channels, rough-cut video features (shot cuts, energy), and a browser extension that overlays predictions on YouTube. |

## Deck outline (6 slides)

1. **Problem:** retention drives recommendations; creators find drop-offs only after publishing.
2. **Product:** script → curve → red-pen flags → fixes in your voice → re-simulated gain (screenshot of the workspace).
3. **How it works:** LLM reads, model predicts; diagram: transcript → features → position prior + LightGBM → hazard curve → SHAP flags → simulated fixes.
4. **Proof:** the `/lab` table, plus "beats a plain LLM" (⟳ numbers).
5. **Live demo:** paste any YouTube link.
6. **Roadmap and team.**
