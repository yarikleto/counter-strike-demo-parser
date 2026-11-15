/**
 * scripts/validate-corpus.ts
 *
 * Corpus validator: parses every `.dem` / `.dem.gz` in a directory with
 * `DemoParser.parse()` (positions on) and prints a per-demo sanity report.
 * Its job is to surface parser bugs on real demos that are not in the test
 * corpus. It never writes to disk and prints no player names or SteamIDs,
 * only counts and measurements.
 *
 * Each demo is parsed in a child process so the reported peak RSS belongs
 * to that demo alone.
 *
 * Per demo:
 *   - parse time and peak RSS (positions sampled every --rate ticks)
 *   - rounds vs `round_end` events (must match: a live round is never dropped)
 *   - final scoreboard (CT:T), to compare with the server's match record
 *   - kills, grenade trajectories, derived throws, raw `grenade_thrown` events
 *   - grenade coordinate sanity: share of trajectory points inside the
 *     bounding box of all sampled player positions ± margin (XY and Z
 *     reported separately — on vertigo grenades legitimately fall off the
 *     building), and the median distance from each trajectory's last point
 *     to the engine-reported detonation position
 *   - shots (`weapon_fire`) and hits (`player_hurt`) against the raw event
 *     counts, the share of gun shots / knife swings / grenade throws, the
 *     share of shot positions inside the player bounding box ± margin, and
 *     the hit-to-shot match rate: the share of gun hits whose attacker fired
 *     a gun within 0 / 2 / 8 ticks before the hit
 *   - parserError events and whether the parse threw
 *
 * Usage:
 *   npm run validate:corpus -- <dir> [--limit N] [--rate TICKS] [--json]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { gunzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  DemoParser,
  NO_PLAYER,
  PositionFlags,
  ShotKind,
  hitBuffers,
  shotBuffers,
} from "../src/index.js";
import type { DemoResult } from "../src/index.js";

/** Margin around the player bounding box, in world units. */
const BBOX_MARGIN = 500;

/** Hit-to-shot windows, in ticks before the hit. */
const MATCH_WINDOWS = [0, 2, 8] as const;

/** `player_hurt` weapons that are not fired by a gun. */
const NON_GUN_HITS: ReadonlySet<string> = new Set([
  "",
  "world",
  "worldspawn",
  "inferno",
  "molotov",
  "incgrenade",
  "hegrenade",
  "flashbang",
  "smokegrenade",
  "decoy",
  "knife",
  "planted_c4",
]);

interface Report {
  readonly file: string;
  readonly map: string;
  readonly sizeMb: number;
  readonly parseMs: number;
  readonly peakRssMb: number;
  readonly threw: string | undefined;
  readonly parserErrors: number;
  readonly roundEndEvents: number;
  readonly rounds: number;
  readonly score: string;
  readonly kills: number;
  readonly trajectories: number;
  readonly throws: number;
  readonly grenadeThrownEvents: number;
  readonly effects: number;
  readonly bombEvents: number;
  readonly positionRows: number;
  readonly weaponFireEvents: number;
  readonly shots: number;
  readonly knifeShots: number;
  readonly grenadeShots: number;
  readonly playerHurtEvents: number;
  readonly hits: number;
  /** Bytes of the shot + hit typed-array columns. */
  readonly shotHitBytes: number;
  readonly shotsInBoxXY: number;
  readonly gunHits: number;
  /** Share of gun hits matched within each of {@link MATCH_WINDOWS}. */
  readonly hitShotMatch: number[];
  readonly pointsInBoxXY: number;
  readonly pointsInBoxZ: number;
  readonly detonationDistanceMedian: number;
}

// ---------- child: parse one demo ------------------------------------------

async function parseOne(path: string, rate: number): Promise<Report> {
  const raw = readFileSync(path);
  const bytes = path.endsWith(".gz") ? gunzipSync(raw) : raw;

  // Measured parse: exactly what an application would run.
  const t0 = performance.now();
  let threw: string | undefined;
  let result: Awaited<ReturnType<typeof DemoParser.parse>> | undefined;
  try {
    result = await DemoParser.parse(bytes, {
      collectPlayerPositions: true,
      positionSampleRateTicks: rate,
    });
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  const parseMs = performance.now() - t0;
  const peakRssMb = process.resourceUsage().maxRSS / 1024;

  if (result === undefined) {
    return emptyReport(path, bytes.length, parseMs, peakRssMb, threw);
  }

  // Second, unmeasured pass for raw counts that DemoResult doesn't carry.
  let roundEndEvents = 0;
  let grenadeThrownEvents = 0;
  let weaponFireEvents = 0;
  let playerHurtEvents = 0;
  let parserErrors = 0;
  const counter = DemoParser.fromBuffer(bytes);
  counter.on("gameEvent", (e) => {
    if (e.name === "round_end") roundEndEvents++;
    else if (e.name === "grenade_thrown") grenadeThrownEvents++;
    else if (e.name === "weapon_fire") weaponFireEvents++;
    else if (e.name === "player_hurt") playerHurtEvents++;
  });
  counter.on("parserError", () => parserErrors++);
  counter.parseAll();

  // Bounding box of alive players' sampled positions.
  const pos = result.positions!;
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pos.length; i++) {
    if ((pos.flags[i]! & PositionFlags.Alive) === 0) continue;
    box.minX = Math.min(box.minX, pos.x[i]!);
    box.maxX = Math.max(box.maxX, pos.x[i]!);
    box.minY = Math.min(box.minY, pos.y[i]!);
    box.maxY = Math.max(box.maxY, pos.y[i]!);
    minZ = Math.min(minZ, pos.z[i]!);
    maxZ = Math.max(maxZ, pos.z[i]!);
  }
  let points = 0;
  let inXY = 0;
  let inZ = 0;
  const distances: number[] = [];
  for (const t of result.grenadeTrajectories) {
    for (const p of t.trajectory) {
      points++;
      if (
        p.x >= box.minX - BBOX_MARGIN &&
        p.x <= box.maxX + BBOX_MARGIN &&
        p.y >= box.minY - BBOX_MARGIN &&
        p.y <= box.maxY + BBOX_MARGIN
      ) {
        inXY++;
      }
      if (p.z >= minZ - BBOX_MARGIN && p.z <= maxZ + BBOX_MARGIN) inZ++;
    }
    const last = t.trajectory[t.trajectory.length - 1];
    const det = t.detonationPosition;
    if (last !== undefined && det !== undefined) {
      distances.push(Math.hypot(last.x - det.x, last.y - det.y, last.z - det.z));
    }
  }
  distances.sort((a, b) => a - b);

  const { shots, hits } = result;
  let shotsInBox = 0;
  let knifeShots = 0;
  let grenadeShots = 0;
  for (let i = 0; i < shots.length; i++) {
    if (shots.kind[i] === ShotKind.Knife) knifeShots++;
    else if (shots.kind[i] === ShotKind.Grenade) grenadeShots++;
    const x = shots.x[i]!;
    const y = shots.y[i]!;
    if (
      x >= box.minX - BBOX_MARGIN &&
      x <= box.maxX + BBOX_MARGIN &&
      y >= box.minY - BBOX_MARGIN &&
      y <= box.maxY + BBOX_MARGIN
    ) {
      shotsInBox++;
    }
  }
  const match = hitShotMatch(result);
  const shotHitBytes = [...shotBuffers(shots), ...hitBuffers(hits)].reduce(
    (sum, b) => sum + b.byteLength,
    0,
  );

  return {
    file: basename(path),
    map: result.header.mapName,
    sizeMb: bytes.length / 1_048_576,
    parseMs,
    peakRssMb,
    threw,
    parserErrors,
    roundEndEvents,
    rounds: result.rounds.length,
    score: `${result.score.ct}:${result.score.t}`,
    kills: result.kills.length,
    trajectories: result.grenadeTrajectories.length,
    throws: result.grenades.length,
    grenadeThrownEvents,
    effects: result.grenadeEffects.length,
    bombEvents: result.bomb.length,
    positionRows: pos.length,
    weaponFireEvents,
    shots: shots.length,
    knifeShots,
    grenadeShots,
    playerHurtEvents,
    hits: hits.length,
    shotHitBytes,
    shotsInBoxXY: shots.length === 0 ? 1 : shotsInBox / shots.length,
    gunHits: match.gunHits,
    hitShotMatch: match.rates,
    pointsInBoxXY: points === 0 ? 1 : inXY / points,
    pointsInBoxZ: points === 0 ? 1 : inZ / points,
    detonationDistanceMedian: distances[distances.length >> 1] ?? NaN,
  };
}

/**
 * Share of gun hits whose attacker fired a gun (`ShotKind.Bullet`) at most
 * `w` ticks before the hit, for each `w` of {@link MATCH_WINDOWS}.
 */
function hitShotMatch(result: DemoResult): { gunHits: number; rates: number[] } {
  const { shots, hits } = result;
  const shotTicks = new Map<number, number[]>();
  for (let i = 0; i < shots.length; i++) {
    if (shots.kind[i] !== ShotKind.Bullet) continue;
    let list = shotTicks.get(shots.player[i]!);
    if (list === undefined) shotTicks.set(shots.player[i]!, (list = []));
    list.push(shots.tick[i]!);
  }
  let gunHits = 0;
  const matched = MATCH_WINDOWS.map(() => 0);
  for (let i = 0; i < hits.length; i++) {
    if (hits.attacker[i] === NO_PLAYER || NON_GUN_HITS.has(hits.weapons[hits.weapon[i]!]!)) {
      continue;
    }
    gunHits++;
    const ticks = shotTicks.get(hits.attacker[i]!) ?? [];
    const t = hits.tick[i]!;
    // Latest shot at or before the hit (ticks are sorted).
    let lo = 0;
    let hi = ticks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ticks[mid]! <= t) lo = mid + 1;
      else hi = mid;
    }
    const gap = lo === 0 ? Infinity : t - ticks[lo - 1]!;
    MATCH_WINDOWS.forEach((w, k) => {
      if (gap <= w) matched[k]!++;
    });
  }
  return { gunHits, rates: matched.map((m) => (gunHits === 0 ? 1 : m / gunHits)) };
}

function emptyReport(
  path: string,
  size: number,
  parseMs: number,
  peakRssMb: number,
  threw: string | undefined,
): Report {
  return {
    file: basename(path),
    map: "?",
    sizeMb: size / 1_048_576,
    parseMs,
    peakRssMb,
    threw,
    parserErrors: 0,
    roundEndEvents: 0,
    rounds: 0,
    score: "?",
    kills: 0,
    trajectories: 0,
    throws: 0,
    grenadeThrownEvents: 0,
    effects: 0,
    bombEvents: 0,
    positionRows: 0,
    weaponFireEvents: 0,
    shots: 0,
    knifeShots: 0,
    grenadeShots: 0,
    playerHurtEvents: 0,
    hits: 0,
    shotHitBytes: 0,
    shotsInBoxXY: 0,
    gunHits: 0,
    hitShotMatch: MATCH_WINDOWS.map(() => 0),
    pointsInBoxXY: 0,
    pointsInBoxZ: 0,
    detonationDistanceMedian: NaN,
  };
}

// ---------- parent: walk the directory --------------------------------------

function parseArgs(argv: readonly string[]) {
  let dir: string | undefined;
  let limit = Infinity;
  let rate = 8;
  let json = false;
  let one: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--limit") limit = Number(argv[++i]);
    else if (arg === "--rate") rate = Number(argv[++i]);
    else if (arg === "--json") json = true;
    else if (arg === "--one") one = argv[++i];
    else if (arg.startsWith("--")) throw new Error(`Unknown flag: ${arg}`);
    else dir = arg;
  }
  return { dir, limit, rate, json, one };
}

function table(reports: readonly Report[]): string {
  const cols: [string, (r: Report) => string][] = [
    ["map", (r) => r.map],
    ["MB", (r) => r.sizeMb.toFixed(0)],
    ["parse s", (r) => (r.parseMs / 1000).toFixed(2)],
    ["RSS MB", (r) => r.peakRssMb.toFixed(0)],
    ["round_end", (r) => String(r.roundEndEvents)],
    ["rounds", (r) => String(r.rounds) + (r.rounds === r.roundEndEvents ? "" : " (!)")],
    ["CT:T", (r) => r.score],
    ["kills", (r) => String(r.kills)],
    ["traj", (r) => String(r.trajectories)],
    ["throws", (r) => String(r.throws)],
    ["g_thrown", (r) => String(r.grenadeThrownEvents)],
    ["effects", (r) => String(r.effects)],
    ["bomb", (r) => String(r.bombEvents)],
    ["pos rows", (r) => String(r.positionRows)],
    ["w_fire", (r) => String(r.weaponFireEvents)],
    ["shots", (r) => String(r.shots) + (r.shots === r.weaponFireEvents ? "" : " (!)")],
    ["knife", (r) => String(r.knifeShots)],
    ["nade", (r) => String(r.grenadeShots)],
    ["p_hurt", (r) => String(r.playerHurtEvents)],
    ["hits", (r) => String(r.hits) + (r.hits === r.playerHurtEvents ? "" : " (!)")],
    ["col KB", (r) => (r.shotHitBytes / 1024).toFixed(0)],
    ["shot inBox", (r) => `${(r.shotsInBoxXY * 100).toFixed(1)}%`],
    ["gun hits", (r) => String(r.gunHits)],
    ...MATCH_WINDOWS.map(
      (w, k) =>
        [`hit<-shot ${w}t`, (r: Report) => `${(r.hitShotMatch[k]! * 100).toFixed(1)}%`] as [
          string,
          (r: Report) => string,
        ],
    ),
    ["inBox XY", (r) => `${(r.pointsInBoxXY * 100).toFixed(1)}%`],
    ["inBox Z", (r) => `${(r.pointsInBoxZ * 100).toFixed(1)}%`],
    ["det dist", (r) => r.detonationDistanceMedian.toFixed(2)],
    ["pErr", (r) => String(r.parserErrors)],
    ["threw", (r) => (r.threw === undefined ? "no" : "YES")],
  ];
  const rows = [cols.map(([h]) => h), ...reports.map((r) => cols.map(([, f]) => f(r)))];
  const widths = cols.map((_, c) => Math.max(...rows.map((row) => row[c]!.length)));
  return rows
    .map((row, i) => {
      const line = row.map((cell, c) => cell.padStart(widths[c]!)).join("  ");
      return i === 0 ? `${line}\n${"-".repeat(line.length)}` : line;
    })
    .join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.one !== undefined) {
    process.stdout.write(JSON.stringify(await parseOne(args.one, args.rate)));
    return;
  }
  if (args.dir === undefined) {
    throw new Error("usage: validate-corpus <dir> [--limit N] [--rate TICKS] [--json]");
  }
  const dir = args.dir;
  const files = readdirSync(dir)
    .filter((n) => n.endsWith(".dem") || n.endsWith(".dem.gz"))
    .filter((n) => statSync(join(dir, n)).isFile())
    .sort()
    .slice(0, args.limit);

  const self = fileURLToPath(import.meta.url);
  const reports: Report[] = [];
  for (const name of files) {
    process.stderr.write(`parsing ${name}...\n`);
    const out = execFileSync(
      process.execPath,
      ["--import", "tsx", self, "--one", join(dir, name), "--rate", String(args.rate)],
      { maxBuffer: 1 << 20 },
    );
    reports.push(JSON.parse(out.toString()) as Report);
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(reports, null, 2) + "\n");
    return;
  }
  console.log(table(reports));
  const bad = reports.filter((r) => r.threw !== undefined || r.rounds !== r.roundEndEvents);
  console.log(
    `\n${reports.length} demo(s); ${bad.length} with a throw or a rounds/round_end mismatch.` +
      ` Positions sampled every ${args.rate} ticks; bounding-box margin ${BBOX_MARGIN} units.` +
      ` (!) marks shots/hits that differ from the raw weapon_fire/player_hurt count` +
      ` (events whose player could not be resolved).`,
  );
  if (bad.length > 0) process.exitCode = 1;
}

await main();
