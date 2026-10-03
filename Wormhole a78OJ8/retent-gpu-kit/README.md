# Retent AI GPU kit

Hi! This folder is one job for your laptop (RTX 5050, 24 GB RAM). It uses your GPU and your internet connection to turn our collected YouTube videos into training data. You run **one command**, leave it running (overnight is ideal), then send back **one file: `RETURN.zip`**.

## What it does

| Step | What happens | Roughly |
|---|---|---|
| Setup | Installs Python packages, including CUDA PyTorch (first run only) | 10–20 min |
| Merge | Adds the videos you collected earlier (optional, see below) | 1 min |
| New videos | Finds more vlog, Hindi and education videos that have YouTube's "Most replayed" curve | 90 min |
| Captions | Downloads captions from your connection. YouTube limits these per connection, so yours gets ones the Mac couldn't | 45 min |
| Whisper on GPU | Transcribes every video still missing text, with Whisper large-v3 on your RTX 5050 (Hindi ~7x real time, English ~19x) | 8–10 h for ~600 videos |
| SponsorBlock | Looks up sponsor segments for every video | 10 min |
| Report + pack | Checks data quality and writes `RETURN.zip` | 1 min |

Total: about **12–15 hours**. Every step is **safe to stop (Ctrl+C) and resume**: run the same command again and it continues.

## Before you start (once)

1. **Unzip this folder to a short path** such as `C:\retent-gpu-kit`. Avoid OneDrive or synced Desktop folders.
2. **Install uv** (Python manager). In PowerShell:
   ```powershell
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```
   Then **close and reopen** PowerShell.
3. **Install Node.js LTS** from https://nodejs.org (yt-dlp needs it to read YouTube pages).
4. **Update the NVIDIA driver** (GeForce Experience or nvidia.com). The RTX 5050 needs a recent driver for CUDA 12.8.
5. **Keep the laptop awake:** plug it in, and set *Settings → System → Power → When plugged in, put my device to sleep after → Never* while it runs.
6. **Free disk space:** about **12 GB** (CUDA PyTorch ~3 GB, the Whisper model ~3 GB, packages and data).

Optional: copy `.env.example` to `.env` and add a `GROQ_API_KEY`. It's only used if the GPU can't be used.

## Run it

Open PowerShell **in this folder** (in File Explorer, type `powershell` in the address bar and press Enter), then:

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1 -ExistingData "C:\path\to\your\retent\data\raw\d1"
```

`-ExistingData` points at the videos you collected before (your old clone of the repo, folder `data\raw\d1`). If you don't have that folder any more, leave the option out:

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

On Linux or WSL2, use `bash run.sh --existing /path/to/data/raw/d1`.

### Options

| Option | Default | Meaning |
|---|---|---|
| `-ExistingData "<path>"` | none | Your earlier `data\raw\d1` folder, merged in first |
| `-CollectMinutes 90` | 90 | Time spent finding new videos; `0` skips it |
| `-CaptionMinutes 45` | 45 | Time spent downloading captions |
| `-WhisperModel large-v3` | large-v3 | Use `large-v3-turbo` if it's too slow |

## While it runs

- Progress prints in the window and goes to `outputs\run.log`. Each step also has a log in `outputs\logs\`.
- In Task Manager → Performance → GPU, the "CUDA" graph should be busy during the Whisper step.
- Lines like `429 — backing off` are normal: YouTube is rate-limiting, and the script waits and retries.

## When it's done

You'll see **"All done. Send RETURN.zip back."** Send **`RETURN.zip`** from this folder (about 10–40 MB) to Tushar. That's all.

If something went wrong, send `RETURN.zip` anyway (run `uv run --no-sync python -m retent_ml.kit pack` to make it) together with `outputs\run.log`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `PyTorch: False ...` or "CUDA not available" | Update the NVIDIA driver and run again. Check with `uv run --no-sync python -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())"`. It should say `+cu128 12.8 True`. |
| Whisper step fails with a cuBLAS/CUDA error | Run again with `-WhisperModel large-v3-turbo`. If it still fails, add a `GROQ_API_KEY` to `.env` and run again (it falls back to Groq). |
| Many "Sign in to confirm you're not a bot" errors | YouTube is blocking this connection for now. Run with `-CollectMinutes 0` and the GPU step still works on the existing videos. |
| "path too long" errors | Move the folder to `C:\retent-gpu-kit`. |
| Laptop slept and the window stopped | Run the same command again; it picks up where it stopped. |

## What it touches

- Only this folder, plus the uv package cache and the Hugging Face model cache in your user folder.
- It reads public YouTube data only. Audio is downloaded to a temporary folder and **deleted right after** transcription.
- No API keys are included in this kit. Nothing is uploaded anywhere, except to Groq if you add your own key and the GPU fails.
