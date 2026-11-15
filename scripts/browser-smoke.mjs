/**
 * scripts/browser-smoke.mjs
 *
 * Proves the browser build works where it matters: inside a Web Worker in
 * real Chrome, bundled by Vite from the package's "browser" export.
 *
 *   1. Production-builds test/browser (a page + module worker that imports
 *      "counter-strike-demo-parser" by name) with Vite.
 *   2. Serves it with `vite preview`, plus the demo file at /demo.dem.
 *   3. Runs installed Google Chrome (headless) through playwright-core.
 *   4. Checks the worker's rounds / kills / grenades / shots / hits / voice
 *      against a Node parse of the same file, that positions, shots, hits and
 *      voice arrived as transferred typed arrays,
 *      and that cancelling mid-parse rejects with AbortError.
 *   5. Reports fetch + parse time and the peak RSS of the page's renderer
 *      process (which hosts the worker), sampled every 100 ms.
 *
 * Usage (after `npm run build`; wired as `npm run test:browser`):
 *   node scripts/browser-smoke.mjs [path/to/demo.dem]
 * Defaults to the de_nuke fixture. Set CHROME_PATH to use another binary.
 */
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import { chromium } from "playwright-core";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pageRoot = join(repo, "test", "browser");
const demoPath = resolve(process.argv[2] ?? join(repo, "test", "fixtures", "de_nuke.dem"));
if (!existsSync(demoPath) || statSync(demoPath).size < 1072) {
  console.log(`skip: demo not available at ${demoPath}`);
  process.exit(0);
}
if (!existsSync(join(repo, "dist", "browser.js"))) {
  console.error("dist/browser.js missing — run `npm run build` first");
  process.exit(1);
}

// Resolve the package by name, exactly like a consumer project would.
const link = join(pageRoot, "node_modules", "counter-strike-demo-parser");
mkdirSync(dirname(link), { recursive: true });
if (!existsSync(link)) symlinkSync(repo, link, "dir");

// Expected values from the Node build.
const { parseDemo } = await import(join(repo, "dist", "index.js"));
const expected = await parseDemo(demoPath, { collectVoice: true });

const outDir = mkdtempSync(join(tmpdir(), "csdp-browser-"));
const serveDemo = {
  name: "serve-demo",
  configurePreviewServer(server) {
    server.middlewares.use("/demo.dem", (_req, res) => {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", statSync(demoPath).size);
      createReadStream(demoPath).pipe(res);
    });
  },
};

await build({ root: pageRoot, logLevel: "warn", build: { outDir, emptyOutDir: true } });
const server = await preview({
  root: pageRoot,
  logLevel: "warn",
  build: { outDir },
  preview: { port: 0, host: "127.0.0.1" },
  plugins: [serveDemo],
});
const baseUrl = server.resolvedUrls.local[0];

const browserServer = await chromium.launchServer({
  channel: process.env.CHROME_PATH ? undefined : "chrome",
  executablePath: process.env.CHROME_PATH,
  headless: true,
});
const browser = await chromium.connect(browserServer.wsEndpoint());
const failures = [];

/** Sum of RSS (MB) of the browser's renderer processes. */
function rendererRssMb(rootPid) {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,rss=,command="])
    .toString()
    .trim()
    .split("\n")
    .map((line) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
      return m && { pid: +m[1], ppid: +m[2], rss: +m[3], command: m[4] };
    })
    .filter(Boolean);
  const descendants = new Set([rootPid]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of rows) {
      if (!descendants.has(r.pid) && descendants.has(r.ppid)) {
        descendants.add(r.pid);
        grew = true;
      }
    }
  }
  return (
    rows
      .filter((r) => descendants.has(r.pid) && r.command.includes("--type=renderer"))
      .reduce((sum, r) => sum + r.rss, 0) / 1024
  );
}

async function run(query) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let peakRss = 0;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, rendererRssMb(browserServer.process().pid));
  }, 100);
  await page.goto(`${baseUrl}${query}`);
  await page.waitForFunction(() => window.smoke?.status !== "running", null, {
    timeout: 300_000,
  });
  clearInterval(sampler);
  const summary = await page.evaluate(() => window.smoke);
  await page.close();
  return { summary: { ...summary, peakRendererRssMb: Math.round(peakRss) }, errors };
}

try {
  const full = await run("?demo=/demo.dem");
  console.log("parse in Web Worker:", full.summary);
  const s = full.summary;
  const check = (label, ok) => ok || failures.push(label);
  check(`status done (got ${s.status}: ${s.error ?? ""})`, s.status === "done");
  check("no page errors", full.errors.length === 0);
  check(`rounds ${s.rounds} === ${expected.rounds.length}`, s.rounds === expected.rounds.length);
  check(`kills ${s.kills} === ${expected.kills.length}`, s.kills === expected.kills.length);
  check(
    `grenades ${s.grenades} === ${expected.grenades.length}`,
    s.grenades === expected.grenades.length,
  );
  check(`shots ${s.shots} === ${expected.shots.length}`, s.shots === expected.shots.length);
  check(`hits ${s.hits} === ${expected.hits.length}`, s.hits === expected.hits.length);
  check(
    `voice ${s.voiceMessages}/${s.voiceBytes} B === ${expected.voice.length}/${expected.voice.data.length} B`,
    s.voiceMessages === expected.voice.length && s.voiceBytes === expected.voice.data.length,
  );
  check("progress reported", s.progressMessages > 1);
  check("positions, shots, hits and voice arrived as typed arrays", s.receivedTypedArray === true);
  check("columns transferred, not copied", s.workerBytesAfterTransfer === 0);

  const cancelled = await run("?demo=/demo.dem&cancel=1");
  console.log("cancel after first progress:", cancelled.summary);
  check(
    `cancel → AbortError (got ${cancelled.summary.status})`,
    cancelled.summary.status === "cancelled",
  );
} finally {
  await browser.close();
  await browserServer.close();
  server.httpServer.close();
  rmSync(outDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\nFAILED:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nBrowser smoke test passed.");
