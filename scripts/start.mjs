#!/usr/bin/env node
// Start the whole project with one command: checks the tools, creates .env, installs what's
// missing or out of date, then runs the API and the web app together. Ctrl+C stops both.
//
//   node scripts/start.mjs            development mode (hot reload)
//   node scripts/start.mjs --prod     production build of the web app
//   node scripts/start.mjs --no-open  don't open the browser
//   node scripts/start.mjs --skip-install
//
// No dependencies: runs on a fresh clone before anything is installed.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIN = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const PROD = args.has("--prod");
const API_PORT = 8000;
const WEB_PORT = 3000;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

if (args.has("--help") || args.has("-h")) {
  console.log("Usage: node scripts/start.mjs [--prod] [--no-open] [--skip-install]");
  process.exit(0);
}

const color = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = color("1"), dim = color("2"), red = color("31"), green = color("32"), yellow = color("33"), cyan = color("36"), magenta = color("35");
const say = (msg) => console.log(`${cyan("[start]")} ${msg}`);
const warn = (msg) => console.log(`${yellow("[start]")} ${msg}`);
const fail = (msg) => {
  console.error(`${red("[start]")} ${msg}`);
  process.exit(1);
};

// Corepack asks before downloading pnpm the first time; answer for the user.
const ENV = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };

function works(cmd, cmdArgs = ["--version"]) {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, env: ENV, shell: WIN, stdio: "ignore" });
  return r.status === 0;
}

function run(title, cmd, cmdArgs) {
  say(title);
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, env: ENV, shell: WIN, stdio: "inherit" });
  if (r.status !== 0) fail(`"${cmd} ${cmdArgs.join(" ")}" failed (exit ${r.status}). Fix the error above and run again.`);
}

const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);

// 1. Tools ------------------------------------------------------------------------------------

const [major] = process.versions.node.split(".").map(Number);
if (major < 20) fail(`Node.js 20 or newer is needed (this is ${process.versions.node}). Get it from https://nodejs.org`);
if (!works("uv")) {
  fail("uv (the Python manager) isn't installed. Install it, open a new terminal, and run this again:\n" +
    (WIN ? '  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
      : "  curl -LsSf https://astral.sh/uv/install.sh | sh"));
}
if (!works("corepack")) fail("corepack isn't available. It ships with Node.js 20+; reinstall Node from https://nodejs.org");
if (!works("ffmpeg", ["-version"])) {
  warn(yellow("ffmpeg not found: rough-cut uploads, Studio overlays and Shorts rendering won't work until it's installed ") +
    dim(WIN ? "(winget install Gyan.FFmpeg)" : process.platform === "darwin" ? "(brew install ffmpeg)" : "(sudo apt install ffmpeg)"));
}

// 2. Settings ---------------------------------------------------------------------------------

const envPath = path.join(ROOT, ".env");
if (!existsSync(envPath)) {
  copyFileSync(path.join(ROOT, ".env.example"), envPath);
  say(`Created ${bold(".env")} from .env.example`);
}
const envText = readFileSync(envPath, "utf8");
const hasKey = (name) => new RegExp(`^${name}=\\s*\\S`, "m").test(envText);
if (!hasKey("GROQ_API_KEY") && !hasKey("GROQ_API_KEYS") && !hasKey("ANTHROPIC_API_KEY")) {
  warn(yellow("No API keys in .env: scripts are analysed with keyword rules only, and YouTube links without captions, ") +
    yellow("uploads and LLM-written fixes need GROQ_API_KEY (free at https://console.groq.com)."));
}

// 3. Dependencies (fast no-ops when up to date) -----------------------------------------------

if (!args.has("--skip-install")) {
  // --inexact keeps extras someone installed on purpose (e.g. the GPU Whisper packages).
  run("Checking Python packages (uv sync)", "uv", ["sync", "--all-packages", "--inexact"]);
  const marker = path.join(ROOT, "node_modules", ".modules.yaml");
  const lock = path.join(ROOT, "pnpm-lock.yaml");
  if (!existsSync(path.join(ROOT, "apps", "web", "node_modules")) || mtime(lock) > mtime(marker)) {
    run("Installing web packages (pnpm install)", "corepack", ["pnpm", "install"]);
  }
  if (PROD) run("Building the web app (next build)", "corepack", ["pnpm", "--filter", "web", "build"]);
}

// 4. Ports ------------------------------------------------------------------------------------

function inUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => resolve(false));
  });
}
for (const [port, what] of [[API_PORT, "API"], [WEB_PORT, "web app"]]) {
  if (await inUse(port)) {
    fail(`Port ${port} (the ${what}) is already in use. Close whatever is using it (another copy of this project?) and run again.`);
  }
}

// 5. Run both ---------------------------------------------------------------------------------

const children = [];
let stopping = false;

function start(name, paint, cmd, cmdArgs) {
  // Own process group on macOS/Linux so Ctrl+C can stop uvicorn's and Next's own child processes.
  const child = spawn(cmd, cmdArgs, { cwd: ROOT, env: ENV, shell: WIN, detached: !WIN, stdio: ["ignore", "pipe", "pipe"] });
  const tag = paint(`[${name}]`.padEnd(6));
  for (const stream of [child.stdout, child.stderr]) {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) if (line.trim()) console.log(`${tag} ${line}`);
    });
  }
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${red("[start]")} The ${name} stopped (exit ${code}); stopping everything. See its output above.`);
      stop(1);
    }
  });
  children.push(child);
  return child;
}

function kill(child) {
  if (child.exitCode !== null || !child.pid) return;
  try {
    if (WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  say("Stopping the API and the web app...");
  children.forEach(kill);
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

say(`Starting the API on ${API_URL} and the web app on ${WEB_URL}${PROD ? " (production build)" : ""}`);
start("api", magenta, "uv", ["run", "--no-sync", "--package", "retent-api", "uvicorn", "retent_api.main:app",
  "--port", String(API_PORT), ...(PROD ? [] : ["--reload"])]);
start("web", green, "corepack", ["pnpm", "--filter", "web", PROD ? "start" : "dev"]);

async function waitFor(url, seconds) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until && !stopping) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

const [apiUp, webUp] = await Promise.all([waitFor(`${API_URL}/api/health`, 120), waitFor(WEB_URL, 180)]);
if (stopping) process.exitCode = 1;
else if (!apiUp || !webUp) {
  warn(`Still waiting for the ${!apiUp ? "API" : "web app"}; check its output above. Leaving both running.`);
} else {
  console.log(`\n  ${bold("Retent AI is running")}\n\n  App   ${cyan(WEB_URL)}\n  API   ${cyan(API_URL)}  ${dim(`(docs at ${API_URL}/docs)`)}\n\n  ${dim("Press Ctrl+C to stop both.")}\n`);
  if (!args.has("--no-open")) {
    const opener = WIN ? ["cmd", ["/c", "start", '""', WEB_URL]] : [process.platform === "darwin" ? "open" : "xdg-open", [WEB_URL]];
    spawn(opener[0], opener[1], { stdio: "ignore", detached: true, windowsVerbatimArguments: WIN }).on("error", () => {}).unref();
  }
}
