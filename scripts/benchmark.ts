/**
 * scripts/benchmark.ts
 *
 * Benchmark harness for `DemoParser.parse()`. Measures wall-clock parse time,
 * peak RSS, and throughput (MB/s) across multiple iterations of the same
 * fixture and reports mean / median / p99 / min / max for each metric. A
 * machine-readable JSON record of every run is written to
 * `bench/results-<timestamp>.json` for tracking over time.
 *
 * I/O is intentionally NOT measured: the demo file is read into a Buffer ONCE
 * up-front and the same Buffer is handed to `DemoParser.parse(buffer)` for
 * every iteration. The number we care about is decode throughput, not the
 * filesystem.
 *
 * Run:
 *   npm run bench
 *   npx tsx scripts/benchmark.ts
 *   npx tsx scripts/benchmark.ts test/fixtures/de_nuke.dem --iterations 20
 *
 * Tip — for stabler memory numbers, run with `--expose-gc` so the harness
 * can force a GC between iterations:
 *   node --expose-gc --import tsx scripts/benchmark.ts
 *
 * No new dependencies — Node builtins only.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { arch, cpus } from "node:os";

import { DemoParser } from "../src/index.js";

interface CliOptions {
  fixture: string;
  iterations: number;
  warmup: number;
  smoke: boolean;
}

interface IterationSample {
  iteration: number;
  durationMs: number;
  peakRssMb: number;
  throughputMbPerSec: number;
}

interface MetricSummary {
  mean: number;
  median: number;
  p99: number;
  min: number;
  max: number;
}

interface ResultRecord {
  timestamp: string;
  fixture: string;
  fixtureSizeBytes: number;
  iterations: number;
  warmup: number;
  hardware: {
    nodeVersion: string;
    arch: string;
    cpuModel: string;
  };
  samples: IterationSample[];
  summary: {
    durationMs: MetricSummary;
    peakRssMb: MetricSummary;
    throughputMbPerSec: MetricSummary;
  };
}

const HELP_TEXT = `Usage: npx tsx scripts/benchmark.ts [fixture] [options]

Arguments:
  fixture                  Path to a .dem file (default: test/fixtures/de_nuke.dem)

Options:
  --iterations N           Number of measured iterations (default: 10)
                           Also configurable via BENCH_ITERATIONS env var.
  --warmup M               Number of warmup iterations (default: 2)
                           Also configurable via BENCH_WARMUP env var.
  --smoke                  Run a single iteration and assert the JSON shape
                           (handy for CI / pre-commit smoke tests).
  --help, -h               Show this help.

Notes:
  - The demo is read into a Buffer ONCE; I/O is NOT included in the measured
    durations.
  - For stabler memory readings run with --expose-gc:
      node --expose-gc --import tsx scripts/benchmark.ts
  - Results are also written to bench/results-<timestamp>.json.
`;

function parseArgs(argv: readonly string[]): CliOptions {
  const positional: string[] = [];
  let iterations: number | undefined;
  let warmup: number | undefined;
  let smoke = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(HELP_TEXT);
      process.exit(0);
    } else if (arg === "--iterations") {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`--iterations requires a value`);
      iterations = parseIntStrict(next, "--iterations");
      i++;
    } else if (arg === "--warmup") {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`--warmup requires a value`);
      warmup = parseIntStrict(next, "--warmup");
      i++;
    } else if (arg === "--smoke") {
      smoke = true;
    } else if (arg.startsWith("--iterations=")) {
      iterations = parseIntStrict(arg.slice("--iterations=".length), "--iterations");
    } else if (arg.startsWith("--warmup=")) {
      warmup = parseIntStrict(arg.slice("--warmup=".length), "--warmup");
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  const envIterations = process.env["BENCH_ITERATIONS"];
  const envWarmup = process.env["BENCH_WARMUP"];

  return {
    fixture: positional[0] ?? "test/fixtures/de_nuke.dem",
    iterations:
      iterations ?? (envIterations !== undefined ? parseIntStrict(envIterations, "BENCH_ITERATIONS") : 10),
    warmup: smoke
      ? 0
      : warmup ?? (envWarmup !== undefined ? parseIntStrict(envWarmup, "BENCH_WARMUP") : 2),
    smoke,
  };
}

function parseIntStrict(raw: string, label: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error(`${label} must be a non-negative integer, got "${raw}"`);
  }
  return n;
}

function maybeGc(): void {
  // global.gc is only present when Node was launched with --expose-gc.
  const g = globalThis as { gc?: () => void };
  if (typeof g.gc === "function") {
    g.gc();
  }
}

async function runIteration(
  buffer: Buffer,
  iteration: number,
  fixtureSizeMb: number,
): Promise<IterationSample> {
  maybeGc();

  let peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peakRss) peakRss = rss;
  }, 50);
  // Don't keep the event loop alive solely for sampling.
  if (typeof sampler.unref === "function") sampler.unref();

  const start = performance.now();
  try {
    await DemoParser.parse(buffer);
  } finally {
    clearInterval(sampler);
  }
  const durationMs = performance.now() - start;

  // One last sample after the parse to catch a peak that landed between ticks.
  const finalRss = process.memoryUsage().rss;
  if (finalRss > peakRss) peakRss = finalRss;

  const peakRssMb = peakRss / 1_048_576;
  const throughputMbPerSec = fixtureSizeMb / (durationMs / 1000);

  return {
    iteration,
    durationMs,
    peakRssMb,
    throughputMbPerSec,
  };
}

function summarize(values: number[]): MetricSummary {
  if (values.length === 0) {
    return { mean: 0, median: 0, p99: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    mean: sum / sorted.length,
    median: percentile(sorted, 0.5),
    p99: percentile(sorted, 0.99),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
  };
}

function percentile(sorted: readonly number[], p: number): number {
  // Linear interpolation between adjacent ranks. `sorted` must be ascending.
  if (sorted.length === 1) return sorted[0]!;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const weight = idx - lo;
  return sorted[lo]! * (1 - weight) + sorted[hi]! * weight;
}

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits);
}

function pad(s: string, n: number): string {
  return s + " ".repeat(Math.max(0, n - s.length));
}

function padLeft(s: string, n: number): string {
  return " ".repeat(Math.max(0, n - s.length)) + s;
}

function printTable(record: ResultRecord): void {
  const rows: Array<[string, MetricSummary, string]> = [
    ["parse time (ms)", record.summary.durationMs, "ms"],
    ["throughput (MB/s)", record.summary.throughputMbPerSec, "MB/s"],
    ["peak RSS (MB)", record.summary.peakRssMb, "MB"],
  ];

  const header = ["metric", "mean", "median", "p99", "min", "max"];
  const widths = [22, 12, 12, 12, 12, 12];

  console.log("");
  console.log(
    header.map((h, i) => (i === 0 ? pad(h, widths[i]!) : padLeft(h, widths[i]!))).join("  "),
  );
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const [label, s] of rows) {
    console.log(
      [
        pad(label, widths[0]!),
        padLeft(fmt(s.mean), widths[1]!),
        padLeft(fmt(s.median), widths[2]!),
        padLeft(fmt(s.p99), widths[3]!),
        padLeft(fmt(s.min), widths[4]!),
        padLeft(fmt(s.max), widths[5]!),
      ].join("  "),
    );
  }
  console.log("");
}

function assertResultShape(record: ResultRecord): void {
  // Smoke-test guard: cheap sanity check that nothing structural drifted.
  const { summary, samples } = record;
  if (samples.length === 0) throw new Error("smoke: no samples recorded");
  for (const key of ["durationMs", "peakRssMb", "throughputMbPerSec"] as const) {
    const s = summary[key];
    if (
      typeof s.mean !== "number" ||
      typeof s.median !== "number" ||
      typeof s.p99 !== "number" ||
      typeof s.min !== "number" ||
      typeof s.max !== "number"
    ) {
      throw new Error(`smoke: malformed summary for ${key}`);
    }
    if (!Number.isFinite(s.mean) || s.mean <= 0) {
      throw new Error(`smoke: non-finite mean for ${key}`);
    }
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const fixturePath = resolve(opts.fixture);
  if (!existsSync(fixturePath)) {
    process.stderr.write(`Fixture not found: ${fixturePath}\n`);
    process.exit(1);
  }

  const buffer = readFileSync(fixturePath);
  const fixtureSizeBytes = buffer.byteLength;
  const fixtureSizeMb = fixtureSizeBytes / 1_048_576;

  const iterations = opts.smoke ? 1 : opts.iterations;
  const warmup = opts.smoke ? 0 : opts.warmup;

  console.log(
    `Benchmarking DemoParser.parse() on ${fixturePath} (${fmt(fixtureSizeMb)} MB)`,
  );
  console.log(
    `iterations=${iterations} warmup=${warmup} node=${process.version} arch=${arch()} cpu="${cpus()[0]?.model ?? "unknown"}"`,
  );

  // Warmup — runs are not recorded; gives the JIT and any module-level caches
  // a chance to settle so the first measured iteration isn't an outlier.
  for (let w = 0; w < warmup; w++) {
    process.stdout.write(`  warmup ${w + 1}/${warmup}...`);
    const t0 = performance.now();
    await DemoParser.parse(buffer);
    process.stdout.write(` ${fmt(performance.now() - t0)} ms\n`);
  }

  const samples: IterationSample[] = [];
  for (let i = 0; i < iterations; i++) {
    process.stdout.write(`  iter ${i + 1}/${iterations}...`);
    const sample = await runIteration(buffer, i + 1, fixtureSizeMb);
    samples.push(sample);
    process.stdout.write(
      ` ${fmt(sample.durationMs)} ms (${fmt(sample.throughputMbPerSec)} MB/s, peak RSS ${fmt(sample.peakRssMb)} MB)\n`,
    );
  }

  const record: ResultRecord = {
    timestamp: new Date().toISOString(),
    fixture: fixturePath,
    fixtureSizeBytes,
    iterations,
    warmup,
    hardware: {
      nodeVersion: process.version,
      arch: arch(),
      cpuModel: cpus()[0]?.model ?? "unknown",
    },
    samples,
    summary: {
      durationMs: summarize(samples.map((s) => s.durationMs)),
      peakRssMb: summarize(samples.map((s) => s.peakRssMb)),
      throughputMbPerSec: summarize(samples.map((s) => s.throughputMbPerSec)),
    },
  };

  printTable(record);

  // Resolve `bench/` relative to the repo root (parent of scripts/), not the
  // shell's cwd, so `npm run bench` from any subdirectory still writes to the
  // same place.
  const here = dirname(fileURLToPath(import.meta.url));
  const benchDir = resolve(here, "..", "bench");
  if (!existsSync(benchDir)) {
    mkdirSync(benchDir, { recursive: true });
  }
  const stamp = record.timestamp.replace(/[:.]/g, "-");
  const outPath = join(benchDir, `results-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n", "utf8");
  console.log(`Wrote ${outPath}`);

  if (opts.smoke) {
    assertResultShape(record);
    console.log("smoke: ok");
  }
}

main().catch((err) => {
  process.stderr.write(`benchmark failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});

/*
 * ------------------------------------------------------------------------
 * Baseline (TASK-071) — captured on dev machine. Update on hardware change.
 *
 * Date:        2026-05-06
 * Node:        v22.22.2
 * CPU / arch:  Apple M4 Pro / arm64
 * Fixture:     test/fixtures/de_nuke.dem (80.17 MB, 84,065,934 bytes)
 * Iterations:  10 (warmup 2), no --expose-gc
 *
 *   metric                       mean       median       p99         min         max
 *   ----------------------  ---------  ---------  ---------  ---------  ---------
 *   parse time (ms)           1810.34    1793.25    1920.43    1782.15    1928.56
 *   throughput (MB/s)            44.31      44.71      44.98      41.57      44.99
 *   peak RSS (MB)               209.90     207.74     215.22     207.61     215.22
 * ------------------------------------------------------------------------
 */
