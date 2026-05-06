/**
 * scripts/cross-validate.ts
 *
 * Cross-validates our golden snapshots against an export produced by
 * demoinfocs-golang (the de-facto reference parser written in Go). Run the
 * companion exporter first to refresh the input JSON:
 *
 *   cd scripts/demoinfocs-export && go run . ../../test/fixtures/de_nuke.dem
 *
 * That writes `bench/demoinfocs-export.json` which we diff here against
 * `test/golden/{header,kills,rounds}.json`. The script is intentionally
 * tolerant: different parsers consistently disagree on a few categories
 * (world-damage kills, warmup-round detection, enum naming, weapon strings,
 * bot/spectator slots), so we apply normalization and a generous tolerance
 * before declaring a divergence a real bug. See `bench/CROSS-VALIDATION.md`
 * for the catalogue of known differences.
 *
 * Decoupled from the Go side on purpose — this script only consumes JSON. If
 * the export is missing we print a one-line hint and exit 0 (skip), so dev
 * machines without a Go toolchain can still run `npm run cross-validate`.
 *
 * Output: a structured PASS/FAIL report on stdout. Exit 0 on all PASS, 1 on
 * any FAIL. No new dependencies — Node builtins only.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- Shapes ---------------------------------------------------------

interface OurHeader {
  readonly mapName: string;
  readonly playbackTicks: number;
  readonly playbackTime: number;
}

interface OurHeaderFile {
  readonly header: OurHeader;
}

interface OurKill {
  readonly tick: number;
  readonly attacker: string;
  readonly victim: string;
  readonly weapon: string;
  readonly headshot: boolean;
}

interface OurRound {
  readonly index: number;
  readonly winner: number;
  readonly endReason: number;
  readonly scoreCT: number;
  readonly scoreT: number;
}

interface TheirRound {
  readonly index: number;
  readonly winner: string;
  readonly endReason: string;
  readonly scoreCT: number;
  readonly scoreT: number;
}

interface DemoinfocsExport {
  readonly header: OurHeader;
  readonly kills: readonly OurKill[];
  readonly rounds: readonly TheirRound[];
  readonly summary: {
    readonly killsCount: number;
    readonly roundsCount: number;
    readonly playersCount: number;
  };
}

// ---------- Result types ---------------------------------------------------

type SectionStatus = "PASS" | "FAIL";

interface SectionResult {
  readonly section: string;
  readonly status: SectionStatus;
  readonly lines: readonly string[];
}

// ---------- Constants ------------------------------------------------------

/** Generous tolerance reflecting expected filtering differences. */
const KILL_COUNT_TOLERANCE = 0.25;

/**
 * Map our integer `winner` (CSGO TEAM_* enum) and demoinfocs's string winner
 * to a single canonical lowercase token so they can be compared.
 *
 * CSGO team enum: 0=Unassigned, 1=Spectators, 2=Terrorists, 3=Counter-Terrorists.
 * demoinfocs reports "T", "CT", "Spectators", "Unassigned".
 */
function normalizeWinner(raw: number | string): string {
  if (typeof raw === "number") {
    switch (raw) {
      case 2:
        return "t";
      case 3:
        return "ct";
      case 1:
        return "spectators";
      case 0:
        return "unassigned";
      default:
        return `team_${raw}`;
    }
  }
  // String form — lowercase, collapse whitespace to underscores. The brief
  // calls out "Terrorists Win" vs "terrorists_win"; same shape covers it.
  const lower = raw.toLowerCase().replace(/\s+/g, "_");
  if (lower === "t" || lower === "terrorists" || lower === "terrorists_win") return "t";
  if (lower === "ct" || lower === "counter-terrorists" || lower === "counter_terrorists" || lower === "ct_win") return "ct";
  if (lower === "spectators" || lower === "spectator") return "spectators";
  if (lower === "unassigned") return "unassigned";
  return lower;
}

// ---------- I/O helpers ----------------------------------------------------

function loadJson<T>(path: string): T {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}

// ---------- Section comparators -------------------------------------------

function compareHeader(ours: OurHeader, theirs: OurHeader): SectionResult {
  const lines: string[] = [];
  const mapMatch = ours.mapName === theirs.mapName;
  const ticksMatch = ours.playbackTicks === theirs.playbackTicks;

  lines.push(`mapName:       ours="${ours.mapName}" theirs="${theirs.mapName}" ${mapMatch ? "OK" : "MISMATCH"}`);
  lines.push(`playbackTicks: ours=${ours.playbackTicks} theirs=${theirs.playbackTicks} ${ticksMatch ? "OK" : "MISMATCH"}`);

  return {
    section: "Header",
    status: mapMatch && ticksMatch ? "PASS" : "FAIL",
    lines,
  };
}

function countByVictim(kills: readonly OurKill[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of kills) {
    m.set(k.victim, (m.get(k.victim) ?? 0) + 1);
  }
  return m;
}

function compareKills(
  ours: readonly OurKill[],
  theirs: readonly OurKill[],
): SectionResult {
  const lines: string[] = [];
  const oursTotal = ours.length;
  const theirsTotal = theirs.length;
  const delta = oursTotal - theirsTotal;
  // Symmetric tolerance: the smaller side must be within (1 - TOL) of the larger.
  const denom = Math.max(oursTotal, theirsTotal, 1);
  const ratio = Math.min(oursTotal, theirsTotal) / denom;
  const withinTolerance = ratio >= 1 - KILL_COUNT_TOLERANCE;

  lines.push(`total kills:   ours=${oursTotal} theirs=${theirsTotal} delta=${delta >= 0 ? "+" : ""}${delta}`);
  lines.push(
    `tolerance:     ratio=${ratio.toFixed(3)} threshold>=${(1 - KILL_COUNT_TOLERANCE).toFixed(2)} ${withinTolerance ? "OK" : "OUT_OF_BAND"}`,
  );

  // Per-victim aggregate. Both sides share the player-name namespace for this
  // fixture (humans only). Bot/world kills would skew this — fixture-friendly.
  const oursByVictim = countByVictim(ours);
  const theirsByVictim = countByVictim(theirs);
  const allVictims = new Set<string>([...oursByVictim.keys(), ...theirsByVictim.keys()]);
  const shared: string[] = [];
  for (const v of allVictims) {
    if (oursByVictim.has(v) && theirsByVictim.has(v)) shared.push(v);
  }
  shared.sort();

  let mismatches = 0;
  const mismatchLines: string[] = [];
  for (const v of shared) {
    const o = oursByVictim.get(v) ?? 0;
    const t = theirsByVictim.get(v) ?? 0;
    if (o !== t) {
      mismatches++;
      mismatchLines.push(`  - "${v}": ours=${o} theirs=${t} delta=${o - t >= 0 ? "+" : ""}${o - t}`);
    }
  }
  lines.push(`per-victim:    shared=${shared.length} mismatches=${mismatches}`);
  // Cap printed mismatches so the report stays scannable.
  for (const ln of mismatchLines.slice(0, 10)) lines.push(ln);
  if (mismatchLines.length > 10) {
    lines.push(`  ... ${mismatchLines.length - 10} more`);
  }

  return {
    section: "Kills",
    status: withinTolerance ? "PASS" : "FAIL",
    lines,
  };
}

function compareRounds(
  ours: readonly OurRound[],
  theirs: readonly TheirRound[],
): SectionResult {
  const lines: string[] = [];
  const oursTotal = ours.length;
  const theirsTotal = theirs.length;
  const delta = oursTotal - theirsTotal;

  lines.push(`total rounds:  ours=${oursTotal} theirs=${theirsTotal} delta=${delta >= 0 ? "+" : ""}${delta}`);

  // demoinfocs frequently emits a leading "warmup" round whose winner is
  // Spectators/Unassigned (no real team won). Our RoundTracker drops it.
  // Detect that case and offset the comparison so the gameplay rounds line
  // up — otherwise a 1-row skew makes every winner look "wrong".
  let theirsOffset = 0;
  if (theirs.length > 0) {
    const lead = normalizeWinner(theirs[0]!.winner);
    if ((lead === "spectators" || lead === "unassigned") && theirs.length > ours.length) {
      theirsOffset = 1;
      lines.push(`note:          dropped leading "${lead}" warmup round on theirs side`);
    }
  }

  const overlap = Math.min(oursTotal, theirsTotal - theirsOffset);

  let winnerMatches = 0;
  const winnerMismatchLines: string[] = [];
  for (let i = 0; i < overlap; i++) {
    const o = ours[i]!;
    const t = theirs[i + theirsOffset]!;
    const ow = normalizeWinner(o.winner);
    const tw = normalizeWinner(t.winner);
    if (ow === tw) {
      winnerMatches++;
    } else {
      winnerMismatchLines.push(`  - round ${i}: ours="${ow}" theirs="${tw}"`);
    }
  }
  lines.push(`winners:       overlap=${overlap} matches=${winnerMatches} mismatches=${overlap - winnerMatches}`);
  for (const ln of winnerMismatchLines.slice(0, 10)) lines.push(ln);
  if (winnerMismatchLines.length > 10) {
    lines.push(`  ... ${winnerMismatchLines.length - 10} more`);
  }

  // PASS iff every round in the aligned overlap window has a matching winner.
  const status: SectionStatus =
    overlap > 0 && winnerMatches === overlap ? "PASS" : "FAIL";
  return { section: "Rounds", status, lines };
}

// ---------- Reporting ------------------------------------------------------

function printReport(results: readonly SectionResult[]): void {
  console.log("");
  console.log("=== cross-validation report ===");
  for (const r of results) {
    console.log("");
    console.log(`[${r.status}] ${r.section}`);
    for (const ln of r.lines) {
      console.log(`  ${ln}`);
    }
  }
  console.log("");
  console.log("--- summary ---");
  for (const r of results) {
    console.log(`  ${r.section.padEnd(8)} ${r.status}`);
  }
  console.log("");
}

// ---------- Main -----------------------------------------------------------

function main(): void {
  // Resolve paths relative to the repo root (parent of scripts/), not the
  // shell's cwd, so the script works no matter where it's invoked from.
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, "..");

  const exportPath = resolve(repoRoot, "bench", "demoinfocs-export.json");
  const headerPath = resolve(repoRoot, "test", "golden", "header.json");
  const killsPath = resolve(repoRoot, "test", "golden", "kills.json");
  const roundsPath = resolve(repoRoot, "test", "golden", "rounds.json");

  if (!existsSync(exportPath)) {
    console.log(
      "Run scripts/demoinfocs-export first: cd scripts/demoinfocs-export && go run . ../../test/fixtures/de_nuke.dem",
    );
    process.exit(0);
  }

  const theirs = loadJson<DemoinfocsExport>(exportPath);
  const ourHeaderFile = loadJson<OurHeaderFile>(headerPath);
  const ourKills = loadJson<readonly OurKill[]>(killsPath);
  const ourRounds = loadJson<readonly OurRound[]>(roundsPath);

  const results: SectionResult[] = [
    compareHeader(ourHeaderFile.header, theirs.header),
    compareKills(ourKills, theirs.kills),
    compareRounds(ourRounds, theirs.rounds),
  ];

  printReport(results);

  const anyFail = results.some((r) => r.status === "FAIL");
  process.exit(anyFail ? 1 : 0);
}

main();
