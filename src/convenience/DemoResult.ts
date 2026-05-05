/**
 * Convenience types for the high-level `DemoParser.parse()` async API.
 *
 * `DemoResult` is the one-shot parsed representation of a demo file: all
 * events collected into typed arrays, the header, and the player roster as
 * it stood at `dem_stop`. It is designed for the 80% of consumers who want
 * structured data without wiring up event listeners manually.
 *
 * Key caveat on `players`: the array reflects **live entities at the moment
 * `dem_stop` is reached**. Players who disconnected before the demo ended are
 * absent — their CCSPlayer entities are deleted when they leave, so they do
 * not appear in the final entity list. Consumers who need a complete roster
 * (including leavers) should use the streaming API and collect `player_death`
 * / `chatMessage` senders instead.
 *
 * `events` is opt-in via `ParseOptions.includeRawEvents` (default `false`).
 * Competitive demos generate thousands of raw `DecodedGameEvent` records;
 * leaving this off prevents unintended memory blowup for the common case.
 */

import type { DemoHeader } from "../frame/header.js";
import type { PlayerSnapshot } from "../state/Player.js";
import type { PlayerDeathEvent } from "../events/enrichers/playerDeath.js";
import type { GrenadeThrownEvent } from "../events/enrichers/grenadeThrown.js";
import type { ChatMessage } from "../events/UserMessageDecoder.js";
import type { DecodedGameEvent } from "../events/GameEventDecoder.js";
import type { RoundSummary } from "./RoundTracker.js";
import type { DamageMatrix } from "./DamageMatrix.js";
import type { PositionSnapshot } from "./PositionTracker.js";
import type { GrenadeTrajectory } from "./GrenadeTrajectoryTracker.js";

/** Options for `DemoParser.parse()`. */
export interface ParseOptions {
  /**
   * When `true`, every raw `DecodedGameEvent` is collected into
   * `DemoResult.events`. Defaults to `false` to avoid memory blowup on
   * competitive demos which carry thousands of game events.
   */
  includeRawEvents?: boolean;
  /**
   * When `true`, player positions are sampled at the configured tick interval
   * and surfaced via `DemoResult.playerPositions`. Defaults to `false` —
   * mirrors `includeRawEvents` to avoid memory blowup on long demos
   * (~36 000 snapshots for a 30-min match at the default 32-tick rate).
   */
  collectPlayerPositions?: boolean;
  /**
   * Sample interval (in parser ticks) for the position tracker, when
   * `collectPlayerPositions` is `true`. Defaults to `32` (~0.5s on a
   * 64-tick server). Ignored when `collectPlayerPositions` is omitted or
   * `false`.
   */
  positionSampleRateTicks?: number;
}

/** The structured result returned by `DemoParser.parse()`. */
export interface DemoResult {
  /** The parsed demo file header (map, tick rate, etc.). */
  readonly header: DemoHeader;
  /**
   * Snapshots of all players present at `dem_stop`.
   *
   * Disconnected players are **absent** — their CCSPlayer entities are
   * removed when they leave, so only players still connected at the end of
   * the demo are included.
   */
  readonly players: PlayerSnapshot[];
  /** All `player_death` events emitted during the demo, in wire order. */
  readonly kills: PlayerDeathEvent[];
  /** Per-round aggregated summaries, one per completed competitive round. */
  readonly rounds: RoundSummary[];
  /**
   * Full-match and per-round damage aggregation matrix.
   *
   * Keyed by (attacker slot, victim slot) pairs derived from `player_hurt`
   * events. Provides both full-match and per-round views. See
   * {@link DamageMatrix} for the complete API.
   */
  readonly damageMatrix: DamageMatrix;
  /** All `grenade_thrown` events emitted during the demo, in wire order. */
  readonly grenades: GrenadeThrownEvent[];
  /**
   * Reconstructed trajectories for every grenade projectile observed in the
   * demo, from spawn to detonation. Built by
   * {@link GrenadeTrajectoryTracker} from the entity-lifecycle stream and
   * the matching `*_detonate` events. See its file-level docstring for the
   * detection / disambiguation rules.
   */
  readonly grenadeTrajectories: readonly GrenadeTrajectory[];
  /** All chat messages decoded from `CSVCMsg_UserMessage` frames, in wire order. */
  readonly chatMessages: ChatMessage[];
  /**
   * All raw decoded game events, in wire order.
   *
   * Only populated when `ParseOptions.includeRawEvents` is `true`.
   * `undefined` otherwise.
   */
  readonly events?: DecodedGameEvent[];
  /**
   * Sampled player position snapshots, in tick-ascending order.
   *
   * Only populated when `ParseOptions.collectPlayerPositions` is `true`.
   * `undefined` otherwise. Sample cadence is controlled by
   * `ParseOptions.positionSampleRateTicks` (default 32 ticks).
   */
  readonly playerPositions?: readonly PositionSnapshot[];
}
