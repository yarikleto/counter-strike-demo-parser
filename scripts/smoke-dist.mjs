/**
 * scripts/smoke-dist.mjs
 *
 * Loads every published entry point from `dist/` the way a consumer would —
 * ESM `import()` and CJS `require()` through the package's own "exports" map
 * (self-reference by package name) — checks the expected exports exist, and
 * parses the head of the fixture demo through each one.
 *
 * Regression guard for "dist/index.js fails with ERR_MODULE_NOT_FOUND"
 * (extensionless `protobufjs/minimal` import). Unit tests run against `src/`
 * through Vite's resolver and cannot catch that class of bug.
 *
 * Run after a build: `npm run build && node scripts/smoke-dist.mjs`
 * (wired up as `npm run test:dist`).
 */
import { createRequire } from "node:module";
import { existsSync, openSync, readSync, closeSync } from "node:fs";

const require = createRequire(import.meta.url);
const failures = [];

// The first 4 MB of the fixture cover signon: protobuf decoding, snappy
// string tables, datatables and early entities. Skipped without Git LFS.
const FIXTURE = new URL("../test/fixtures/de_nuke.dem", import.meta.url);
let head;
if (existsSync(FIXTURE)) {
  head = new Uint8Array(4 * 1024 * 1024);
  const fd = openSync(FIXTURE, "r");
  const n = readSync(fd, head, 0, head.length, 0);
  closeSync(fd);
  head = head.subarray(0, n);
  if (n < 1072) head = undefined; // LFS pointer, not the demo
}

/** Parse the fixture head and check signon produced real state. */
function exercise(mod) {
  if (head === undefined) return;
  const parser = new mod.DemoParser(head.slice());
  let tables = 0;
  parser.on("stringTableCreated", () => tables++);
  parser.parseAll();
  if (parser.header?.mapName !== "de_nuke") throw new Error("header not parsed");
  if (tables < 10) throw new Error(`only ${tables} string tables decoded`);
  if (parser.modelPrecache.size === 0) throw new Error("modelprecache empty (snappy?)");
}

async function check(label, load, expected) {
  try {
    const mod = await load();
    for (const name of expected) {
      if (mod[name] === undefined) failures.push(`${label}: missing export "${name}"`);
    }
    exercise(mod);
    console.log(`ok   ${label}`);
  } catch (err) {
    failures.push(`${label}: ${err.code ?? ""} ${err.message}`);
    console.log(`FAIL ${label}`);
  }
}

const core = ["DemoParser", "parseDemo"];

await check("esm  counter-strike-demo-parser", () => import("counter-strike-demo-parser"), core);
await check("cjs  counter-strike-demo-parser", () => require("counter-strike-demo-parser"), core);
await check(
  "esm  counter-strike-demo-parser/browser",
  () => import("counter-strike-demo-parser/browser"),
  core,
);
await check(
  "cjs  counter-strike-demo-parser/browser",
  () => require("counter-strike-demo-parser/browser"),
  core,
);
await check(
  "esm  counter-strike-demo-parser/node",
  () => import("counter-strike-demo-parser/node"),
  core,
);
await check(
  "cjs  counter-strike-demo-parser/node",
  () => require("counter-strike-demo-parser/node"),
  core,
);

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("\nAll dist entry points load.");
