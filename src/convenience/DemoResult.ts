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

/** Options for `DemoParser.parse()`. */
export interface ParseOptions {
  /**
   * When `true`, every raw `DecodedGameEvent` is collected into
   * `DemoResult.events`. Defaults to `false` to avoid memory blowup on
   * competitive demos which carry thousands of game events.
   */
  includeRawEvents?: boolean;
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
  /** All `grenade_thrown` events emitted during the demo, in wire order. */
  readonly grenades: GrenadeThrownEvent[];
  /** All chat messages decoded from `CSVCMsg_UserMessage` frames, in wire order. */
  readonly chatMessages: ChatMessage[];
  /**
   * All raw decoded game events, in wire order.
   *
   * Only populated when `ParseOptions.includeRawEvents` is `true`.
   * `undefined` otherwise.
   */
  readonly events?: DecodedGameEvent[];
}
