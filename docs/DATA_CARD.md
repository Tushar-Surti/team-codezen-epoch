# Data card: Retent AI datasets

Generated 2026-10-02 19:13 UTC by `python -m retent_ml.datacard` from `data/raw/` on this machine. Every number below is computed; run `hub pull` first to describe the whole team's data.

## Sources

| Set | What | Source |
|---|---|---|
| D1 | 5–15 min public videos with YouTube's "Most replayed" curve, captions (or Groq Whisper transcripts) and chapters | yt-dlp on public watch pages |
| D2 | Public YouTube Studio retention screenshots, digitized; each keeps its source URL | Creators' public posts, digitized with `retent_ml.digitize` |
| D3 | Sponsor, self-promo and reminder segments for D1 videos | SponsorBlock public API |

## D1: public interest curves

Filters: duration 5–15 min, uploaded at least 30 days before collection, "Most replayed" present (≥ 50 points).

**108 videos kept, 107 with usable text** (target ≈ 200 per cell, 1200 total).

| Cell | Kept | Usable text | Channels | Median length | Median views | Caption sources |
|---|---|---|---|---|---|---|
| tech/en | 8 | 8 | 2 | 11 min | 3,857,857 | manual:en 8 |
| tech/hi | 93 | 92 | 6 | 10 min | 310,752 | auto:hi 63, auto:en 19, manual:en 10 |
| education/en | 2 | 2 | 1 | 10 min | 67,872 | manual:en 2 |
| education/hi | 5 | 5 | 1 | 13 min | 9,094,690 | manual:hi 4, auto:hi 1 |
| vlog/en | 0 | 0 | 0 | – min | – | – |
| vlog/hi | 0 | 0 | 0 | – min | – | – |

Waiting for text: 1 empty (`pending` = caption download rate-limited, pass B; `none`/`empty` = pass C, Groq Whisper).

### Yield (from the probe log)

YouTube serves "Most replayed" only for some videos, so the collector probes more than it keeps.

| Cell | Probed | Kept | No curve | Too recent | Wrong length | Errors |
|---|---|---|---|---|---|---|
| tech/en | 30 | 9 (30%) | 0 | 7 | 14 | 0 |
| tech/hi | 260 | 93 (36%) | 30 | 59 | 77 | 1 |
| education/en | 12 | 2 (17%) | 6 | 4 | 0 | 0 |
| education/hi | 36 | 5 (14%) | 0 | 2 | 29 | 0 |
| vlog/en | 36 | 0 (0%) | 0 | 0 | 36 | 0 |
| vlog/hi | 14 | 0 (0%) | 1 | 9 | 4 | 0 |

### Biases and caveats

- **Channel concentration:** the top channel (Technology Gyan) supplies 23% of D1; the top five supply 83%. Training and evaluation split by channel (GroupKFold), never by video.
- **Channel size:** 108 videos from named big creators, 0 from channels found by topic search (mostly mid-sized). Big channels already retain well, so the mix matters.
- **Audience size:** median channel has 15,600,000 subscribers.
- **Language mismatch:** 29 videos from Hindi channels have only English captions (usually creator-uploaded translations). Their text features describe a translation, not the speech.
- **Survivorship:** only videos YouTube shows a "Most replayed" curve for are kept; these skew to older, more-watched uploads.
- **What the label means:** "Most replayed" is *relative* interest within a video (it includes rewatches), not the share of viewers remaining. It trains the curve's shape; D2 sets the absolute level.
- **Timing:** caption and Whisper timestamps are measured; scripts pasted by users are timed by estimated speaking rate.

## D2: absolute retention (digitized Studio screenshots)

0 curves digitized, 0 reviewed against their overlay. Each keeps its `source_url`; unreviewed curves are not used for fitting.

## D3: SponsorBlock segments

107 D1 videos looked up; 39 have at least one segment (outro 26, intro 25, interaction 16, selfpromo 14, sponsor 8, preview 2, filler 1).
SponsorBlock is crowd-labelled and skews to English channels with large audiences.

## Use and licensing

Public metadata, captions and derived features, used for research. Videos and audio are never redistributed; media downloaded for video-mode features stays on the machine that collected it. Shared through a private Hugging Face dataset repo (`retent_ml.hub`).
