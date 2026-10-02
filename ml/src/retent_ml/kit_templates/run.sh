#!/usr/bin/env bash
# Retent AI GPU kit for Linux / WSL2 (same steps as run.ps1). Run from this folder:
#   bash run.sh [--existing PATH] [--collect-minutes 90] [--caption-minutes 45] [--model large-v3]
# Safe to stop (Ctrl+C) and run again: every step continues where it left off.
set -u
cd "$(dirname "$0")"
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8

EXISTING=""; COLLECT=90; CAPTIONS=45; MODEL="large-v3"
while [ $# -gt 0 ]; do
  case "$1" in
    --existing) EXISTING="$2"; shift 2 ;;
    --collect-minutes) COLLECT="$2"; shift 2 ;;
    --caption-minutes) CAPTIONS="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    *) echo "unknown option $1"; exit 1 ;;
  esac
done

mkdir -p outputs/logs
say() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a outputs/run.log; }
step() {
  local name="$1"; shift
  say "START $name"
  if uv run --no-sync python "$@" 2>&1 | tee -a "outputs/logs/$name.log"; then say "DONE  $name"
  else say "WARN  $name stopped (details in outputs/logs/$name.log); moving on"; fi
}

command -v uv >/dev/null || { say "Install uv first: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
command -v node >/dev/null || command -v deno >/dev/null || { say "Install Node.js (YouTube pages run JavaScript)"; exit 1; }
command -v nvidia-smi >/dev/null && nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader | tee outputs/logs/gpu.log
[ -f .env ] || cp .env.example .env

say "Installing packages (first run downloads about 3 GB of CUDA PyTorch)"
uv sync --all-packages --all-extras 2>&1 | tee -a outputs/logs/setup.log
uv pip install --upgrade "yt-dlp[default,curl-cffi]" 2>&1 | tee -a outputs/logs/setup.log

ENGINE=local
if ! uv run --no-sync python -c "import torch, sys; sys.exit(0 if torch.cuda.is_available() else 1)" 2>/dev/null; then
  if grep -q '^GROQ_API_KEY=.\+' .env; then ENGINE=groq; say "CUDA not available: using Groq Whisper"
  else ENGINE=none; say "CUDA not available and no GROQ_API_KEY: transcription skipped"; fi
fi

step report-before -m retent_ml.kit report
cp outputs/report.json outputs/report-before.json 2>/dev/null || true
[ -n "$EXISTING" ] && step merge-existing -m retent_ml.kit absorb "$EXISTING"
[ "$COLLECT" -gt 0 ] && step collect-new-videos -m retent_ml.collect --only vlog/en,vlog/hi,education/en,education/hi,tech/hi --max-minutes "$COLLECT" --sleep 2.5
step captions -m retent_ml.collect --captions --max-minutes "$CAPTIONS" --sleep 3
case "$ENGINE" in
  local) step whisper-gpu -m retent_ml.asr --include-pending --engine local --model "$MODEL" ;;
  groq) step whisper-groq -m retent_ml.asr --include-pending --max-minutes 110 ;;
esac
step sponsorblock -m retent_ml.sponsorblock
step audit -m retent_ml.audit
step datacard -m retent_ml.datacard
step report -m retent_ml.kit report
step pack -m retent_ml.kit pack
say "All done. Send RETURN.zip back."
