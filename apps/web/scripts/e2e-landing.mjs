import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(2200);
await page.screenshot({ path: "../../.impeccable/review/landing-1.png" });
const h = await page.evaluate(() => window.innerHeight);
for (const [i, f] of [[2, 1.6], [3, 2.6], [4, 3.6]]) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(h * f));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `../../.impeccable/review/landing-${i}.png` });
}
await browser.close();
