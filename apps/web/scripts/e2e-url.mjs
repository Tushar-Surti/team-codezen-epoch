import { chromium } from "@playwright/test";
const [, , url = "https://www.youtube.com/watch?v=hZ5mobRcXAU", cat = "Education"] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3000/new", { waitUntil: "networkidle" });
await page.getByRole("tab", { name: /Published video/ }).click();
await page.getByPlaceholder("https://www.youtube.com/watch?v=…").fill(url);
await page.getByRole("radio", { name: cat }).click();
await page.getByRole("button", { name: /Predict the drop/ }).click();
await page.waitForTimeout(6000);
await page.screenshot({ path: "../../.impeccable/review/url-progress.png" });
await page.waitForURL(/\/a\//, { timeout: 120000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "../../.impeccable/review/url-workspace.png" });
const tab = page.getByRole("tab", { name: "vs YouTube" });
if (await tab.count()) {
  await tab.click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Reveal YouTube/ }).click();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: "../../.impeccable/review/url-youtube.png" });
  console.log("revealed");
}
console.log("landed", page.url());
await browser.close();
