// Usage: node scripts/shot.mjs <path> <outfile> [width] [height] [waitMs] [clickSelector]
import { chromium } from "@playwright/test";
const [, , path = "/", out = "shot.png", w = "1440", h = "900", wait = "2500", click] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`http://localhost:3000${path}`, { waitUntil: "networkidle" });
if (click) { await page.click(click); }
await page.waitForTimeout(+wait);
await page.screenshot({ path: out, fullPage: false });
if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
await browser.close();
