# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Delegated: Next.js (App Router) + TypeScript frontend; FastAPI (Python 3.12) backend; LightGBM/SHAP retention model; Claude (Opus 5.5) and Groq (Whisper large-v3, GPT-OSS) behind one LLM router. Motion: GSAP (ScrollTrigger, DrawSVG, MorphSVG, SplitText, Flip), Motion (formerly Framer Motion), Lenis. Charts: D3 with custom SVG/Canvas marks. Rationale lives in docs/PLAN.md §7.

## Users
**Primary:** solo or small-team YouTube creators making 5–15 minute tech reviews, explainers/education, or vlogs in English, Hindi or Hinglish, usually without a dedicated editor. They arrive with a script before shooting, or a rough cut before publishing, and want to know where viewers will leave and what to change.
**Secondary:** the editor who receives the hand-off (timeline markers, revised script); analysts and strategists studying public channels (Channel X-Ray).
**Evaluators:** hackathon judges who are likely experienced in social-media analytics. They know YouTube Studio's retention vocabulary and will check every claim.

## Product Purpose
Retent AI predicts a video's audience-retention curve from its script or rough cut, before publishing. It flags each likely drop-off with quoted evidence and the signals that caused it, writes the specific edit that fixes it, and re-simulates the edited version to show the expected gain. Success means the creator fixes the biggest drop before publishing, and a skeptical analyst trusts the numbers because the accuracy is shown openly.

## Positioning
A trained, validated model predicts the curve; LLMs only read the script and write fixes. Every flag traces back to measured signals. Accuracy is shown openly against baselines (including "just ask an LLM") on channels the model never saw, plus a live blind test on any public video. It works on Hindi and Hinglish as well as English, and on scripts before anything is shot.

## Operating Context
- Creators work on laptops (MacBook / Windows), often late in the edit or while writing a script, alongside their editing software (DaVinci Resolve, Premiere, Final Cut) and YouTube Studio.
- Metric vocabulary must match YouTube Studio: Intro retention (0:30), APV, AVD, Key moments (dips, spikes), "typical" range.
- Edits leave the product as timeline markers (EDL/FCPXML), revised scripts, and YouTube chapters.
- Judges see a live demo on the MacBook Air M3, and may paste their own video or channel URL.

## Capabilities and Constraints
- Scope: English and Hindi (including code-mixed Hinglish, Devanagari and romanized), videos 5–15 minutes long, in tech reviews, education and vlogs. Inputs outside this scope are warned about, not silently accepted.
- Ground truth is public only: YouTube "Most replayed" (relative interest), digitized publicly shared Studio retention screenshots (absolute level), and SponsorBlock segments. The team has no channel of its own.
- Two LLM engines: Claude (deep) and Groq (fast). Every AI-written output carries a provenance badge.
- Undecided: final product name (Retent AI is the working name and may change).

## Brand Commitments
- Working name **Retent AI**; tagline "Predict the drop. Fix the video. Keep them watching."
- **Binding (user requirement):** the UI must be beautiful, good-looking and attractive, with high-quality animation. GSAP, Lenis and Motion are approved tools.
- **Voice: sharp editor.** Direct and specific, evidence before advice, a little dry wit, never fluffy. Example: "Your hook lands at 0:45. Viewers start leaving at 0:20."
- **Anti-goals (user-confirmed):** must not look like a generic SaaS analytics dashboard; must not be so flashy that analytics experts stop trusting it; must not overwhelm a non-analyst creator with chart walls; must not copy YouTube's red/white look.

## Evidence on Hand
- No validation results exist yet. Every accuracy number must come from `models/eval_report.json`, produced by the evaluation pipeline. No invented metrics, testimonials, customer logos or benchmarks.
- Demo data during development is fixture data built from real public transcripts and is labelled synthetic wherever shown.

## Product Principles
1. **Biggest drop first.** Within 5 seconds the creator sees the steepest predicted cliff, its cause, and the one fix that matters most. Everything else is progressive detail.
2. **Evidence before advice.** Every flag shows its quote, its signals and its confidence before it suggests a change.
3. **Show the gain, honestly.** Fixes are judged by viewers kept and watch time, not by percentages that rise just because the video got shorter.
4. **Earn the expert's trust.** Studio vocabulary, uncertainty shown, baselines published, limits stated.
5. **Speak the creator's language.** Hindi, Hinglish and English are equally supported in content, examples and fixes.

## Accessibility & Inclusion
WCAG 2.2 AA. The timeline and curve must work with the keyboard, and the curve data must also be available as text. Motion respects `prefers-reduced-motion`. Devanagari text must render correctly in every typeface used.
