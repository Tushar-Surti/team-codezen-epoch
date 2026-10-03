import { chromium } from "@playwright/test";
// Channel X-Ray: run a dataset channel end to end, then screenshot desktop (full page) and phone.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000/xray", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Marques Brownlee/ }).click();
await page.waitForSelector("text=For the next video", { timeout: 120000 });
await page.waitForTimeout(800);
await page.evaluate(async () => {
  const el = document.querySelector(".overflow-y-auto");
  for (let y = 0; y < el.scrollHeight; y += 500) { el.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
  el.scrollTo(0, 0);
});
await page.waitForTimeout(1200);
const h = await page.evaluate(() => document.querySelector(".overflow-y-auto").scrollHeight);
await page.setViewportSize({ width: 1440, height: h + 40 });
await page.waitForTimeout(800);
await page.screenshot({ path: "../../.impeccable/review/xray-desktop.png" });
const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await phone.goto(page.url(), { waitUntil: "networkidle" });
await phone.waitForSelector("text=For the next video", { timeout: 60000 });
await phone.waitForTimeout(1200);
await phone.screenshot({ path: "../../.impeccable/review/xray-phone.png" });
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log("url", page.url(), "phone horizontal overflow:", overflow);
await browser.close();
