/**
 * Convenience types for the high-level `DemoParser.parse()` / `parseDemo()`
 * API.
 *
 * `DemoResult` is the one-shot parsed representation of a demo file, made
 * of plain data only: numbers, strings, booleans, plain objects, arrays and
 * (for `positions`, `shots` and `hits`) typed arrays. It holds no references into the parser,
 * so it can be `postMessage`d out of a Web Worker, stored in IndexedDB, or
 * `JSON.stringify`d (typed arrays serialize as index-keyed objects; convert
 * them with `Array.from` first if you need JSON arrays).
 *
 * Players appear as {@link PlayerRef}s captured at event time; their
 * `index` points into `DemoResult.players`, the roster of everyone seen.
 */

import type { DemoHeader } from "../frame/header.js";
import type { DecodedGameEvent } from "../events/GameEventDecoder.js";
import type { ParseProgress } from "../DemoParser.js";
import type { MatchScore, RoundSummary } from "./RoundTracker.js";
import type { PlayerInfo } from "./PlayerRoster.js";
import type { PlayerPositions } from "./PositionRecorder.js";
import type { PlayerShots } from "./ShotRecorder.js";
import type { PlayerHits } from "./HitRecorder.js";
import type { GrenadeTrajectory } from "./GrenadeTrajectoryTracker.js";
import type {
  BombRecord,
  ChatRecord,
  DamageRecord,
  GrenadeEffect,
  GrenadeThrow,
  HostageRecord,
  KillRecord,
} from "./records.js";

/** Options for `DemoParser.parse()` / `parseDemo()`. */
export interface ParseOptions {
  /**
   * When `true`, every raw `DecodedGameEvent` is collected into
   * `DemoResult.events`. Defaults to `false` — competitive demos carry tens
   * of thousands of game events.
   */
  includeRawEvents?: boolean;
  /**
   * When `true`, player state is sampled every `positionSampleRateTicks`
   * ticks into the columnar `DemoResult.positions`. Defaults to `false`.
   */
  collectPlayerPositions?: boolean;
  /**
   * Sample interval in ticks for `collectPlayerPositions`. Defaults to `32`
   * (4 samples/s on a 128-tick demo, 2 on a 64-tick one). For a smooth 2D
   * replay of a 128-tick demo, 8 (16 samples/s) is a good value.
   */
  positionSampleRateTicks?: number;
  /**
   * Progress callback. When this or `signal` is set, the parse runs in time
   * slices and yields to the event loop between them (see
   * `DemoParser.parseAllAsync`).
   */
  onProgress?: (progress: ParseProgress) => void;
  /** Cancels the parse; the promise rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Milliseconds of parsing between yields (default 50). */
  yieldIntervalMs?: number;
}

/** The structured, plain-data result returned by `DemoParser.parse()`. */
export interface DemoResult {
  /** The parsed demo file header (map, tick count, etc.). */
  readonly header: DemoHeader;
  /** Server tick rate (e.g. 64 or 128), from `CSVCMsg_ServerInfo`. */
  readonly tickRate: number;
  /**
   * Everyone who appeared on a team or in an event, including players who
   * disconnected before the end. `PlayerRef.index` and
   * `positions.player[i]` index this array.
   */
  readonly players: PlayerInfo[];
  /** All kills, in wire order. */
  readonly kills: KillRecord[];
  /**
   * Per-round summaries, one per `round_end` of the match (warmup excluded).
   * Rounds voided by a later match restart are kept with `voided: true`.
   */
  readonly rounds: RoundSummary[];
  /**
   * Final scoreboard: rounds won by the team on CT and on T when the demo
   * ends, read from the team entities (what the in-game scoreboard shows).
   */
  readonly score: MatchScore;
  /** Bomb lifecycle events with positions and sites, in wire order. */
  readonly bomb: BombRecord[];
  /**
   * Grenade throws, derived from projectile entities (GOTV demos do not
   * network `grenade_thrown`). One per entry of `grenadeTrajectories`.
   */
  readonly grenades: GrenadeThrow[];
  /**
   * In-flight path of every grenade projectile, from spawn to detonation,
   * in world coordinates.
   */
  readonly grenadeTrajectories: GrenadeTrajectory[];
  /** Smokes and infernos with start/end, plus flash/HE/decoy detonations. */
  readonly grenadeEffects: GrenadeEffect[];
  /** Hostage events (cs_ maps); empty on bomb maps. */
  readonly hostageEvents: HostageRecord[];
  /** Full-match damage per (attacker, victim) pair. */
  readonly damage: DamageRecord[];
  /** Chat messages, in wire order. */
  readonly chatMessages: ChatRecord[];
  /**
   * Every `weapon_fire` (gun shots, knife swings, grenade throws) as
   * columnar typed arrays: tick, shooter, position, view angles, weapon,
   * kind, silenced flag. Transfer with `shotBuffers()`.
   */
  readonly shots: PlayerShots;
  /**
   * Every `player_hurt` as columnar typed arrays: tick, attacker, victim,
   * weapon, damage, armor damage, hit group, health/armor left, both
   * positions. Transfer with `hitBuffers()`.
   */
  readonly hits: PlayerHits;
  /**
   * Raw decoded game events, in wire order, each with its frame `tick`;
   * only with `includeRawEvents`.
   */
  readonly events?: DecodedGameEvent[];
  /** Columnar player samples; only with `collectPlayerPositions`. */
  readonly positions?: PlayerPositions;
}
