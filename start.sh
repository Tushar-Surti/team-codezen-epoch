#!/usr/bin/env sh
# Start Retent AI (API + web app) on macOS / Linux: sh start.sh
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is needed. Install it from https://nodejs.org, then run this again."; exit 1; }
exec node scripts/start.mjs "$@"
