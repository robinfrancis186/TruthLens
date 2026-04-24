import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const appUrl = process.env.TRUTHLENS_WEB_URL ?? "http://127.0.0.1:3000";
const chromePath =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const screenshotPath = process.env.TRUTHLENS_SMOKE_SCREENSHOT ?? "/tmp/truthlens-smoke-text.png";
const imageFixture = "/tmp/truthlens-smoke-image.png";
const videoFixture = "/tmp/truthlens-smoke-video.webm";

writeFileSync(imageFixture, Buffer.from("\x89PNG\r\n\x1a\ntruthlens generated sample image bytes"));

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
  args: ["--disable-extensions", "--disable-gpu", "--no-first-run", "--no-proxy-server", "--proxy-bypass-list=<-loopback>"]
});

async function writeBrowserGeneratedVideo() {
  const fixturePage = await browser.newPage();
  try {
    const bytes = await fixturePage.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      const stream = canvas.captureStream(8);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.start();
      for (let frame = 0; frame < 18; frame += 1) {
        context.fillStyle = frame % 2 ? "#d6f4f4" : "#f7f9fb";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#111827";
        context.fillRect(24 + frame * 4, 50, 80, 80);
        context.fillStyle = "#be123c";
        context.fillRect(150, 30 + frame * 2, 90, 90);
        await new Promise((resolve) => setTimeout(resolve, 70));
      }
      await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.stop();
      });
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: "video/webm" });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    writeFileSync(videoFixture, Buffer.from(bytes));
  } finally {
    await fixturePage.close();
  }
}

await writeBrowserGeneratedVideo();

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const cdpSession = await page.context().newCDPSession(page);
const failures = [];

async function gotoReady(url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
  } catch (error) {
    if (error.name !== "TimeoutError") {
      throw error;
    }
    await cdpSession.send("Page.stopLoading").catch(() => undefined);
  }
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
}

function isIgnoredConsoleError(message) {
  const text = message.text();
  return text.includes("hydrated") && text.includes("webcrx");
}

page.on("console", (message) => {
  if (message.type() === "error" && !isIgnoredConsoleError(message)) {
    failures.push(`console error: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  failures.push(`page error: ${error.message}`);
});

try {
  await gotoReady(appUrl);
  await page.getByRole("heading", { name: /check content authenticity/i }).waitFor();
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.getByText(/Signal Breakdown/i).waitFor({ timeout: 10000 });
  await page.getByText(/LIKELY AI|AI GENERATED|UNCERTAIN|LIKELY HUMAN|HUMAN/i).waitFor();
  await page.getByText(/Sentence Signals/i).waitFor();
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const permalinkUrl = page.url();
  await gotoReady(permalinkUrl);
  await page.getByRole("heading", { name: /analysis report/i }).waitFor({ timeout: 10000 });
  await page.getByText(/Signal Breakdown/i).waitFor();

  await gotoReady(appUrl);
  await page.getByRole("heading", { name: /check content authenticity/i }).waitFor();
  await page.getByRole("button", { name: "Image" }).click();
  await page.locator("#truthlens-file").setInputFiles(imageFixture);
  await page.getByRole("button", { name: "Analyze" }).click();
  await page.getByText(/Image Heatmap/i).waitFor({ timeout: 10000 });

  await gotoReady(appUrl);
  await page.getByRole("heading", { name: /check content authenticity/i }).waitFor();
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
