<#
  Retent AI GPU kit: one command, run from this folder in PowerShell:

      powershell -ExecutionPolicy Bypass -File .\run.ps1

  Optional:
      -ExistingData "C:\path\to\retent\data\raw\d1"   your earlier collection, merged in first
      -CollectMinutes 90      time for finding new videos (0 to skip)
      -CaptionMinutes 45      time for downloading captions
      -WhisperModel large-v3  Whisper model on the GPU

  Safe to stop (Ctrl+C) and run again: every step continues where it left off.
#>
param(
  [string]$ExistingData = "",
  [int]$CollectMinutes = 90,
  [int]$CaptionMinutes = 45,
  [string]$WhisperModel = "large-v3"
)

$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
New-Item -ItemType Directory -Force -Path "outputs\logs" | Out-Null
$RunLog = "outputs\run.log"

function Say([string]$msg, [string]$color = "Cyan") {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Write-Host $line -ForegroundColor $color
  Add-Content -Path $RunLog -Value $line -Encoding UTF8
}

function Run-Step([string]$name, [string[]]$pyArgs) {
  Say "START $name"
  $log = "outputs\logs\$name.log"
  & uv run --no-sync python @pyArgs 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $log -Append
  if ($LASTEXITCODE -ne 0) { Say "WARN  $name stopped with code $LASTEXITCODE (details in $log); moving on" "Yellow" }
  else { Say "DONE  $name" "Green" }
}

Say "Retent AI GPU kit starting on $env:COMPUTERNAME"

# ── Preflight ──────────────────────────────────────────────────────────────
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
  Say "uv is not installed. Install it, open a NEW PowerShell window, and run this script again:" "Yellow"
  Write-Host '  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
  exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue) -and -not (Get-Command deno -ErrorAction SilentlyContinue)) {
  Say "Node.js is needed (YouTube pages run JavaScript). Install the LTS from https://nodejs.org and run again." "Yellow"
  exit 1
}
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  $gpu = nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
  Say "GPU: $gpu"
  $gpu | Out-File -FilePath "outputs\logs\gpu.log" -Encoding UTF8
} else {
  Say "nvidia-smi not found: the NVIDIA driver may be missing. Transcription will fall back if possible." "Yellow"
}
if (-not (Test-Path ".env")) { Copy-Item ".env.example" ".env" }

Say "Installing packages (first run downloads about 3 GB of CUDA PyTorch; later runs are instant)"
& uv sync --all-packages --all-extras 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath "outputs\logs\setup.log" -Append
# YouTube changes often; the newest yt-dlp keeps extraction working.
& uv pip install --upgrade "yt-dlp[default,curl-cffi]" 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath "outputs\logs\setup.log" -Append

$cuda = (& uv run --no-sync python -c "import torch; print(torch.cuda.is_available(), torch.__version__)" 2>$null) -join " "
Say "PyTorch: $cuda"
$Engine = "local"
if ($cuda -notmatch "^True") {
  if (Select-String -Path ".env" -Pattern "^GROQ_API_KEY=.+" -Quiet) {
    $Engine = "groq"; Say "CUDA not available: using Groq Whisper instead (slower, quota-limited)" "Yellow"
  } else {
    $Engine = "none"; Say "CUDA not available and no GROQ_API_KEY in .env: transcription will be skipped" "Yellow"
  }
}

# ── The work ───────────────────────────────────────────────────────────────
Run-Step "report-before" @("-m", "retent_ml.kit", "report")
Copy-Item "outputs\report.json" "outputs\report-before.json" -Force -ErrorAction SilentlyContinue

if ($ExistingData -ne "") {
  if (Test-Path $ExistingData) { Run-Step "merge-existing" @("-m", "retent_ml.kit", "absorb", $ExistingData) }
  else { Say "ExistingData path not found: $ExistingData (skipped)" "Yellow" }
}
if ($CollectMinutes -gt 0) {
  Run-Step "collect-new-videos" @("-m", "retent_ml.collect", "--only", "vlog/en,vlog/hi,education/en,education/hi,tech/hi",
                                  "--max-minutes", "$CollectMinutes", "--sleep", "2.5")
}
Run-Step "captions" @("-m", "retent_ml.collect", "--captions", "--max-minutes", "$CaptionMinutes", "--sleep", "3")
if ($Engine -eq "local") {
  Run-Step "whisper-gpu" @("-m", "retent_ml.asr", "--include-pending", "--engine", "local", "--model", $WhisperModel)
} elseif ($Engine -eq "groq") {
  Run-Step "whisper-groq" @("-m", "retent_ml.asr", "--include-pending", "--max-minutes", "110")
}
Run-Step "sponsorblock" @("-m", "retent_ml.sponsorblock")
Run-Step "audit" @("-m", "retent_ml.audit")
Run-Step "datacard" @("-m", "retent_ml.datacard")
Run-Step "report" @("-m", "retent_ml.kit", "report")
Run-Step "pack" @("-m", "retent_ml.kit", "pack")

Say "All done. Send RETURN.zip (in this folder) back. Running this script again continues any unfinished work." "Green"
