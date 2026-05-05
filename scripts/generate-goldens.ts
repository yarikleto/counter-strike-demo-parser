/**
 * scripts/generate-goldens.ts
 *
 * Regenerate the committed golden-file JSON snapshots under `test/golden/`.
 *
 * Each golden captures a structural projection of the parsed `de_nuke.dem`
 * fixture — see `test/integration/golden-*.test.ts` for the matching
 * comparison tests. Five goldens are produced (TASK-076..080):
 *
 *   - header.json          — DemoHeader + selected ServerInfo fields
 *   - entities.json        — total entities, per-class counts, max concurrent
 *   - playerEndState.json  — final player roster (name, steamId, team, ...)
 *   - kills.json           — every player_death event in wire order
 *   - rounds.json          — per-round summary (winner, end reason, MVP, ...)
 *
 * Determinism rules:
 *   - Floating-point fields are rounded (positions / tickInterval) so JSON
 *     stays byte-identical across machines.
 *   - Maps / Sets are not iterated for ordering; arrays are sorted on a
 *     stable key (slot, sorted alphabetically, etc.) where iteration order
 *     isn't intrinsic to the underlying wire stream.
 *   - kills are wire-order (deterministic without sorting); rounds are
 *     emit-order (RoundTracker only emits on round_end).
 *
 * Run:
 *   npm run goldens:update
 *   npx tsx scripts/generate-goldens.ts
 *
 * The output is intentionally re-runnable: two invocations produce
 * byte-identical JSON. The integration tests (golden-*.test.ts) compare
 * the live parse against these committed JSON files — when an intentional
 * behaviour change shifts a snapshot, regenerate and review the diff.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DemoParser } from "../src/DemoParser.js";
import type { Entity } from "../src/entities/Entity.js";
import type { Player } from "../src/state/Player.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const FIXTURE = join(REPO_ROOT, "test", "fixtures", "de_nuke.dem");
const GOLDEN_DIR = join(REPO_ROOT, "test", "golden");

interface HeaderGolden {
  readonly header: Record<string, unknown>;
  readonly serverInfo: {
    readonly tickInterval: number;
    readonly maxClasses: number;
    readonly mapName: string;
  };
}

interface EntitiesGolden {
  readonly totalUniqueEntities: number;
  readonly maxConcurrent: number;
  readonly perClassCounts: Record<string, number>;
}

interface PlayerEndStateRow {
  readonly slot: number;
  readonly name: string;
  readonly steamId: string;
  readonly team: number;
  readonly isAlive: boolean;
  readonly money: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

interface KillRow {
  readonly tick: number;
  readonly attacker: string;
  readonly victim: string;
  readonly weapon: string;
  readonly headshot: boolean;
  readonly penetrated: boolean;
  readonly noscope: boolean;
  readonly thrusmoke: boolean;
  readonly attackerblind: boolean;
  readonly round: number;
}

interface RoundRow {
  readonly index: number;
  readonly winner: number | undefined;
  readonly endReason: number | undefined;
  readonly scoreCT: number;
  readonly scoreT: number;
  readonly mvp: string | undefined;
}

/** Round a number to N decimal places, returning a finite number. */
function round(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/**
 * Resolve a Player's display name via `userInfoIndex`, mirroring the
 * `nameOf` helper in `examples/scoreboard.ts`. Returns `"world"` when the
 * player is undefined (engine damage / world). Returns `"slot N"` as a
 * fallback when the userinfo entry is missing — typically because the
 * player disconnected before we had a chance to capture their name.
 */
function nameOf(player: Player | undefined, parser: DemoParser): string {
  if (player === undefined) return "world";
  const entitySlot = player.slot - 1;
  const userId = parser.userInfoIndex.userIdForEntitySlot(entitySlot);
  if (userId === undefined) return `slot ${player.slot}`;
  const info = parser.userInfoIndex.infoForUserId(userId);
  return info?.name ?? `slot ${player.slot}`;
}

/** Stable JSON serialiser: 2-space indent, top-level keys preserved in input order. */
function toStableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

/** Sort an object's own keys alphabetically into a fresh plain object. */
function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    out[key] = record[key]!;
  }
  return out;
}

function writeGolden(name: string, value: unknown): void {
  const path = join(GOLDEN_DIR, `${name}.json`);
  writeFileSync(path, toStableJson(value));
  // eslint-disable-next-line no-console
  console.log(`wrote ${path}`);
}

async function main(): Promise<void> {
  mkdirSync(GOLDEN_DIR, { recursive: true });

  // Single streaming parse — collect everything we need across the five
  // goldens in one pass. Player end-state requires the streaming API
  // because PlayerSnapshot doesn't carry the wire `name`/`steamId` —
  // those live on `parser.userInfoIndex` and must be resolved from the
  // live parser instance.
  const buffer = readFileSync(FIXTURE);
  const parser = new DemoParser(buffer);

  // -- Entities (TASK-077) --------------------------------------------------
  // Track unique entity ids ever observed, per-ServerClass create counts,
  // and the running peak of simultaneously-live entities. We track liveness
  // as a Set of ids touched by entityCreated/entityDeleted; size of the set
  // at any point is the live count.
  const uniqueEntityIds = new Set<number>();
  const liveEntityIds = new Set<number>();
  const perClassCounts: Record<string, number> = {};
  let maxConcurrent = 0;

  parser.on("entityCreated", (entity: Entity) => {
    uniqueEntityIds.add(entity.id);
    liveEntityIds.add(entity.id);
    if (liveEntityIds.size > maxConcurrent) {
      maxConcurrent = liveEntityIds.size;
    }
    const className = entity.serverClass.className;
    perClassCounts[className] = (perClassCounts[className] ?? 0) + 1;
  });
  parser.on("entityDeleted", (entity: Entity) => {
    liveEntityIds.delete(entity.id);
  });

  // -- Kills (TASK-079) -----------------------------------------------------
  // Track current round number from round_start (1-based). The round number
  // is stamped on each kill at emit time so the array stays wire-order while
  // every entry carries the round it belongs to.
  let currentRound = 0;
  parser.on("round_start", () => {
    currentRound += 1;
  });
  const killRows: KillRow[] = [];
  parser.on("player_death", (e) => {
    killRows.push({
      tick: parser.currentTick,
      attacker: nameOf(e.attacker, parser),
      victim: nameOf(e.victim, parser),
      weapon: e.weapon,
      headshot: e.headshot,
      penetrated: e.penetrated,
      noscope: e.noscope,
      thrusmoke: e.thrusmoke,
      attackerblind: e.attackerblind,
      round: currentRound,
    });
  });

  // -- Rounds (TASK-080) ----------------------------------------------------
  // Mirror DemoParser.parse() — attach a ConvenienceRoundTracker, and after
  // parseAll() walk RoundSummary entries to project the golden shape.
  const { ConvenienceRoundTracker } = await import("../src/convenience/RoundTracker.js");
  const roundTracker = new ConvenienceRoundTracker();
  roundTracker.attach(parser);

  parser.parseAll();

  // -- Header (TASK-076) ----------------------------------------------------
  if (parser.header === undefined) {
    throw new Error("DemoHeader missing after parseAll()");
  }
  const header = parser.header;
  const serverInfoState = parser.serverInfoState;
  if (serverInfoState === undefined) {
    throw new Error("ServerInfo missing after parseAll()");
  }
  const headerGolden: HeaderGolden = {
    header: {
      magic: header.magic,
      demoProtocol: header.demoProtocol,
      networkProtocol: header.networkProtocol,
      serverName: header.serverName,
      clientName: header.clientName,
      mapName: header.mapName,
      gameDirectory: header.gameDirectory,
      // playbackTime is a float32 — round to 6 decimals for stability across
      // platforms (the wire bytes are deterministic, but JSON.stringify can
      // differ in trailing-digit serialisation between Node minor versions).
      playbackTime: round(header.playbackTime, 6),
      playbackTicks: header.playbackTicks,
      playbackFrames: header.playbackFrames,
      signonLength: header.signonLength,
    },
    serverInfo: {
      tickInterval: round(serverInfoState.tickInterval, 6),
      maxClasses: serverInfoState.maxClasses,
      mapName: serverInfoState.mapName,
    },
  };
  writeGolden("header", headerGolden);

  // -- Entities golden ------------------------------------------------------
  const entitiesGolden: EntitiesGolden = {
    totalUniqueEntities: uniqueEntityIds.size,
    maxConcurrent,
    // Sort class names alphabetically so the JSON stays stable across runs —
    // entityCreated insertion order is a function of wire-stream timing,
    // which is deterministic but reads better when alphabetised.
    perClassCounts: sortKeys(perClassCounts),
  };
  writeGolden("entities", entitiesGolden);

  // -- Player end state (TASK-078) ------------------------------------------
  const playerRows: PlayerEndStateRow[] = parser.players
    .map((player): PlayerEndStateRow => {
      const entitySlot = player.slot - 1;
      const userId = parser.userInfoIndex.userIdForEntitySlot(entitySlot);
      const info = userId !== undefined ? parser.userInfoIndex.infoForUserId(userId) : undefined;
      const pos = player.position;
      return {
        slot: player.slot,
        name: info?.name ?? `slot ${player.slot}`,
        steamId: info?.xuid ?? "0",
        team: player.team,
        isAlive: player.isAlive,
        money: player.money,
        position: {
          x: round(pos.x, 4),
          y: round(pos.y, 4),
          z: round(pos.z, 4),
        },
      };
    })
    .sort((a, b) => a.slot - b.slot);
  writeGolden("playerEndState", playerRows);

  // -- Kills golden ---------------------------------------------------------
  writeGolden("kills", killRows);

  // -- Rounds golden --------------------------------------------------------
  // Score reconstruction: the round summary doesn't carry a final scoreboard,
  // so we accumulate CT / T wins as we walk the list. Each summary's `winner`
  // is a TeamSide (T=2, CT=3); incrementing the right side at index `i`
  // produces the score AFTER that round was played.
  const TEAM_T = 2;
  const TEAM_CT = 3;
  let scoreCT = 0;
  let scoreT = 0;
  const roundRows: RoundRow[] = roundTracker.snapshot().map((round, index): RoundRow => {
    if (round.winner === TEAM_T) scoreT += 1;
    else if (round.winner === TEAM_CT) scoreCT += 1;
    return {
      // 0-based index of the round in the emitted summaries array — stable
      // and independent of `round.number` (which is sourced from
      // gameRules.totalRoundsPlayed and may have warmup quirks).
      index,
      winner: round.winner,
      // RoundSummary.endReason is `RoundEndReason | number | undefined` —
      // both branches serialise as a number; passthrough.
      endReason: round.endReason,
      scoreCT,
      scoreT,
      mvp: round.mvp !== undefined ? nameOf(round.mvp, parser) : undefined,
    };
  });
  writeGolden("rounds", roundRows);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
