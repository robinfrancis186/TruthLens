import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const appUrl = process.env.TRUTHLENS_WEB_URL ?? "http://127.0.0.1:3000";
const chromePath =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotPath = process.env.TRUTHLENS_SMOKE_SCREENSHOT ?? "/tmp/truthlens-smoke-text.png";
const imageFixture = "/tmp/truthlens-smoke-image.png";
const videoFixture = "/tmp/truthlens-smoke-video.mp4";

writeFileSync(imageFixture, Buffer.from("\x89PNG\r\n\x1a\ntruthlens generated sample image bytes"));
writeFileSync(videoFixture, Buffer.from("\x00\x00\x00 ftypmp42moovtruthlens generated sample video bytes"));

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--disable-extensions", "--disable-gpu", "--no-first-run"]
});

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const failures = [];

page.on("console", (message) => {
  if (message.type() === "error") {
    failures.push(`console error: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  failures.push(`page error: ${error.message}`);
});

try {
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /check content authenticity/i }).waitFor();
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.getByText(/Signal Breakdown/i).waitFor({ timeout: 10000 });
  await page.getByText(/LIKELY AI|AI GENERATED|UNCERTAIN|LIKELY HUMAN|HUMAN/i).waitFor();
  await page.getByText(/Sentence Signals/i).waitFor();
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const permalinkUrl = page.url();
  await page.goto(permalinkUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /analysis report/i }).waitFor({ timeout: 10000 });
  await page.getByText(/Signal Breakdown/i).waitFor();

  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Image" }).click();
  await page.locator("#truthlens-file").setInputFiles(imageFixture);
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.getByText(/Image Heatmap/i).waitFor({ timeout: 10000 });

  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Video" }).click();
  await page.locator("#truthlens-file").setInputFiles(videoFixture);
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.getByText(/Video Timeline/i).waitFor({ timeout: 10000 });

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  console.log(`TruthLens smoke passed: ${appUrl}`);
  console.log(`Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
