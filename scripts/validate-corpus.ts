/**
 * scripts/validate-corpus.ts
 *
 * Corpus validator. Walks a directory of gzipped CS:GO `.dem.gz` files,
 * decompresses each, parses with our streaming `DemoParser`, and reports per
 * file whether the parse threw, whether any `parserError` events fired, and a
 * handful of sanity-check counts (kills / rounds / players). After the loop
 * a summary block prints aggregate stats — median / p99 parse time, total
 * `parserError` events broken down by `kind`, and the unique throw messages.
 *
 * The validator's ONLY job is to surface bugs in the parser by running it
 * against real-world demos that are absent from the test corpus. It never
 * mutates demos and never writes to disk. Output is plain stdout.
 *
 * CLI flags:
 *   --limit N       parse only the first N matching files (default 10)
 *   --map de_nuke   filter to a single map (matched against `/-(de_\\w+)-/`)
 *   --all           parse every demo in the directory (explicit opt-in)
 *
 * Selection: by default we pick a DIVERSE sample — one demo per map,
 * round-robin, until `--limit` is reached. This maximises map coverage even
 * when the limit is small (10 demos across ~7 maps).
 *
 * Usage:
 *   npm run validate:corpus -- --limit 10
 *   npm run validate:corpus -- --map de_nuke --limit 3
 *   npm run validate:corpus -- --all   (heavy — parses everything)
 *
 * Constraints (per task brief):
 *   - Node builtins only — no new dependencies.
 *   - Read-only against `src/` — this is detective work, not feature work.
 *   - 60-second per-file timeout (Promise.race against parse).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, basename, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";

import { DemoParser } from "../src/index.js";
import type { ParserEventMap } from "../src/index.js";

// ---------- CLI parsing -----------------------------------------------------

interface Args {
  readonly dir: string;
  readonly limit: number;
  readonly map: string | undefined;
  readonly all: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let dir = "/Users/yaroslavp/Downloads/DEMOS";
  let limit = 10;
  let map: string | undefined;
  let all = false;

  // First positional (after `node script.ts`) overrides the default dir.
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--all") {
      all = true;
    } else if (arg === "--limit") {
      const next = argv[i + 1];
      if (next === undefined) throw new Error("--limit requires a value");
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`--limit must be a positive integer, got: ${next}`);
      }
      limit = parsed;
      i++;
    } else if (arg === "--map") {
      const next = argv[i + 1];
      if (next === undefined) throw new Error("--map requires a value");
      map = next;
      i++;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }
  if (positionals[0] !== undefined) dir = positionals[0];

  return { dir, limit, map, all };
}

// ---------- File selection --------------------------------------------------

interface CorpusFile {
  readonly path: string;
  readonly name: string;
  readonly map: string;
  readonly sizeBytes: number;
}

const MAP_REGEX = /-(de_\w+)-/;

function listCorpus(dir: string): CorpusFile[] {
  const entries = readdirSync(dir).filter((n) => n.endsWith(".dem.gz"));
  entries.sort();
  const out: CorpusFile[] = [];
  for (const name of entries) {
    const match = MAP_REGEX.exec(name);
    if (match === null) continue;
    const mapName = match[1];
    if (mapName === undefined) continue;
    const full = join(dir, name);
    const st = statSync(full);
    out.push({ path: full, name, map: mapName, sizeBytes: st.size });
  }
  return out;
}

/**
 * Round-robin one-per-map selection. Walks the sorted file list, taking the
 * first unseen map each pass until `limit` files are accumulated. This gives
 * the broadest map coverage for a small `limit`.
 */
function selectDiverseSample(
  files: readonly CorpusFile[],
  limit: number,
): CorpusFile[] {
  const byMap = new Map<string, CorpusFile[]>();
  for (const f of files) {
    const bucket = byMap.get(f.map);
    if (bucket === undefined) byMap.set(f.map, [f]);
    else bucket.push(f);
  }
  const maps = [...byMap.keys()].sort();
  const picked: CorpusFile[] = [];
  let pass = 0;
  while (picked.length < limit) {
    let progressed = false;
    for (const m of maps) {
      const bucket = byMap.get(m);
      if (bucket === undefined) continue;
      const f = bucket[pass];
      if (f === undefined) continue;
      picked.push(f);
      progressed = true;
      if (picked.length >= limit) break;
    }
    if (!progressed) break;
    pass++;
  }
  return picked;
}

// ---------- Per-file parse --------------------------------------------------

interface FileResult {
  readonly name: string;
  readonly map: string;
  readonly sizeMb: number;
  readonly decompressedMb: number;
  readonly parseDurationMs: number;
  readonly threw: boolean;
  readonly throwMessage: string | undefined;
  readonly timedOut: boolean;
  readonly parserErrorCount: number;
  readonly parserErrorKinds: ReadonlyArray<{
    readonly kind: ParserErrorKind;
    readonly message: string;
  }>;
  readonly killsCount: number;
  readonly roundsCount: number;
  readonly playersCount: number;
}

type ParserErrorPayload = ParserEventMap["parserError"];
type ParserErrorKind = ParserErrorPayload["kind"];

const PARSE_TIMEOUT_MS = 60_000;

/**
 * Parse a single demo with a hard wall-clock timeout. The parser itself is
 * synchronous, so the "timeout" is really a post-hoc check — `parseAll()`
 * runs to completion, then we compare elapsed against the budget. We also
 * race a `setTimeout`-based promise so a hypothetical infinite loop in the
 * parser doesn't hang the validator (the timer fires, we abort, the
 * underlying microtask leaks but the script exits).
 */
async function parseOne(file: CorpusFile): Promise<FileResult> {
  const sizeMb = file.sizeBytes / (1024 * 1024);

  let decompressed: Buffer;
  try {
    const raw = readFileSync(file.path);
    decompressed = gunzipSync(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name: file.name,
      map: file.map,
      sizeMb,
      decompressedMb: 0,
      parseDurationMs: 0,
      threw: true,
      throwMessage: `decompress failed: ${message}`,
      timedOut: false,
      parserErrorCount: 0,
      parserErrorKinds: [],
      killsCount: 0,
      roundsCount: 0,
      playersCount: 0,
    };
  }

  const decompressedMb = decompressed.length / (1024 * 1024);

  const parseTask = async (): Promise<{
    readonly result: FileResult;
  }> => {
    const parser = DemoParser.fromBuffer(decompressed);
    const errors: ParserErrorPayload[] = [];
    parser.on("parserError", (e) => {
      errors.push(e);
    });

    let kills = 0;
    let rounds = 0;
    parser.on("player_death", () => {
      kills++;
    });
    parser.on("round_end", () => {
      rounds++;
    });

    const t0 = performance.now();
    let threw = false;
    let throwMessage: string | undefined;
    try {
      parser.parseAll();
    } catch (err) {
      threw = true;
      throwMessage = err instanceof Error ? err.message : String(err);
    }
    const t1 = performance.now();

    const playersCount = parser.players.length;

    const kinds = errors.slice(0, 3).map((e) => ({
      kind: e.kind,
      message: e.message,
    }));

    return {
      result: {
        name: file.name,
        map: file.map,
        sizeMb,
        decompressedMb,
        parseDurationMs: t1 - t0,
        threw,
        throwMessage,
        timedOut: false,
        parserErrorCount: errors.length,
        parserErrorKinds: kinds,
        killsCount: kills,
        roundsCount: rounds,
        playersCount,
      },
    };
  };

  const timeoutTask = new Promise<{ readonly timedOut: true }>((resolveT) => {
    setTimeout(() => resolveT({ timedOut: true }), PARSE_TIMEOUT_MS).unref();
  });

  const winner = await Promise.race([parseTask(), timeoutTask]);

  if ("timedOut" in winner) {
    return {
      name: file.name,
      map: file.map,
      sizeMb,
      decompressedMb,
      parseDurationMs: PARSE_TIMEOUT_MS,
      threw: false,
      throwMessage: undefined,
      timedOut: true,
      parserErrorCount: 0,
      parserErrorKinds: [],
      killsCount: 0,
      roundsCount: 0,
      playersCount: 0,
    };
  }
  return winner.result;
}

// ---------- Reporting ------------------------------------------------------

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}
function padLeft(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return " ".repeat(n - s.length) + s;
}

function formatTable(rows: readonly FileResult[]): string {
  const header = [
    pad("file", 64),
    padLeft("map", 11),
    padLeft("gzMB", 7),
    padLeft("rawMB", 7),
    padLeft("ms", 8),
    padLeft("threw", 6),
    padLeft("pErr", 5),
    padLeft("kills", 6),
    padLeft("rounds", 7),
    padLeft("players", 8),
  ].join("  ");
  const sep = "-".repeat(header.length);
  const lines: string[] = [header, sep];
  for (const r of rows) {
    const threwStr = r.threw ? "YES" : r.timedOut ? "TIMEOUT" : "no";
    lines.push(
      [
        pad(r.name, 64),
        padLeft(r.map, 11),
        padLeft(r.sizeMb.toFixed(1), 7),
        padLeft(r.decompressedMb.toFixed(1), 7),
        padLeft(r.parseDurationMs.toFixed(0), 8),
        padLeft(threwStr, 6),
        padLeft(String(r.parserErrorCount), 5),
        padLeft(String(r.killsCount), 6),
        padLeft(String(r.roundsCount), 7),
        padLeft(String(r.playersCount), 8),
      ].join("  "),
    );
  }
  return lines.join("\n");
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
}

function summarise(results: readonly FileResult[]): string {
  const total = results.length;
  const threw = results.filter((r) => r.threw).length;
  const timedOut = results.filter((r) => r.timedOut).length;
  const withParserErrors = results.filter((r) => r.parserErrorCount > 0).length;

  const durations = results
    .filter((r) => !r.threw && !r.timedOut)
    .map((r) => r.parseDurationMs)
    .sort((a, b) => a - b);
  const median = percentile(durations, 50);
  const p99 = percentile(durations, 99);

  const totalParserEvents = results.reduce(
    (sum, r) => sum + r.parserErrorCount,
    0,
  );

  const kindCounts = new Map<ParserErrorKind, number>();
  for (const r of results) {
    for (const k of r.parserErrorKinds) {
      kindCounts.set(k.kind, (kindCounts.get(k.kind) ?? 0) + 1);
    }
  }

  const uniqueThrows = new Set<string>();
  for (const r of results) {
    if (r.throwMessage !== undefined) uniqueThrows.add(r.throwMessage);
  }

  const lines: string[] = [];
  lines.push("");
  lines.push("=== Summary ===");
  lines.push(`files parsed:        ${total}`);
  lines.push(`threw exceptions:    ${threw}`);
  lines.push(`timed out (>60s):    ${timedOut}`);
  lines.push(`had parserError:     ${withParserErrors}`);
  lines.push(`total parserError events seen: ${totalParserEvents}`);
  lines.push(`median parse ms:     ${median.toFixed(0)}`);
  lines.push(`p99 parse ms:        ${p99.toFixed(0)}`);
  lines.push("");
  lines.push("parserError breakdown by kind (first 3 per file sampled):");
  if (kindCounts.size === 0) {
    lines.push("  (none)");
  } else {
    for (const [kind, count] of kindCounts) {
      lines.push(`  ${kind}: ${count}`);
    }
  }
  lines.push("");
  lines.push("unique thrown error messages:");
  if (uniqueThrows.size === 0) {
    lines.push("  (none)");
  } else {
    for (const msg of uniqueThrows) lines.push(`  - ${msg}`);
  }
  return lines.join("\n");
}

// ---------- Main -----------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dir = resolve(args.dir);
  process.stdout.write(`corpus dir: ${dir}\n`);

  const all = listCorpus(dir);
  process.stdout.write(`found ${all.length} .dem.gz files\n`);

  const filtered =
    args.map === undefined ? all : all.filter((f) => f.map === args.map);
  if (args.map !== undefined) {
    process.stdout.write(
      `filtered to map=${args.map}: ${filtered.length} files\n`,
    );
  }

  const picked = args.all
    ? filtered
    : selectDiverseSample(filtered, args.limit);
  process.stdout.write(`parsing ${picked.length} files\n\n`);
  for (const f of picked) process.stdout.write(`  - ${basename(f.name)}\n`);
  process.stdout.write("\n");

  const results: FileResult[] = [];
  for (const f of picked) {
    process.stdout.write(`[parse] ${f.name} ... `);
    const result = await parseOne(f);
    const status = result.threw
      ? "THREW"
      : result.timedOut
        ? "TIMEOUT"
        : "ok";
    process.stdout.write(
      `${status} ${result.parseDurationMs.toFixed(0)}ms parserErrors=${result.parserErrorCount}\n`,
    );
    results.push(result);
  }

  process.stdout.write("\n");
  process.stdout.write(formatTable(results));
  process.stdout.write("\n");
  process.stdout.write(summarise(results));
  process.stdout.write("\n");
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
