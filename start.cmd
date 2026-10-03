@echo off
rem Start Retent AI (API + web app). Double-click this file, or run start.cmd from a terminal.
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js 20+ is needed. Install it from https://nodejs.org, then run this again.
  pause
  exit /b 1
)
node scripts\start.mjs %*
if errorlevel 1 pause
