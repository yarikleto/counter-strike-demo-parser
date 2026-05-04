/**
 * `flashbang_detonate` Tier-1 enricher (TASK-041, ADR-006).
 *
 * Wire schema: { userid: short, entityid: long, x: float, y: float, z: float }
 *
 * CS:GO's `flashbang_detonate` descriptor on production demos does NOT
 * carry a per-flashed-victim array. Per-victim flash effect (with
 * blind-duration) fires separately as `player_blind` (one event per
 * affected player) — see `playerBlind.ts`. The `playersFlashed` field on
 * this event is therefore always an empty frozen array; we keep it on
 * the typed surface so the Tier-1 shape remains stable and self-documenting,
 * and so downstream consumers can correlate by tick if they accumulate
 * blinds via the separate listener.
 *
 * `thrower` is `Player | undefined` per ADR-006 decision 5 (detonation
 * position is meaningful even without an attributable thrower).
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player, Vector3 } from "../../state/Player.js";

export interface FlashbangDetonateEvent extends EnrichedEvent {
  /** Thrower — `undefined` when the userid can't be resolved. */
  readonly thrower: Player | undefined;
  /** World-space detonation position. Frozen. */
  readonly position: Vector3;
  /**
   * Players flashed by this detonation. Always empty on production
   * demos — the wire descriptor doesn't carry a per-victim list.
   * Subscribe to `player_blind` for per-victim blind events.
   */
  readonly playersFlashed: readonly Player[];
}

function readNum(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

const EMPTY_FLASHED: readonly Player[] = Object.freeze([]);

export const enrichFlashbangDetonate: Enricher<FlashbangDetonateEvent> = (
  raw,
  ctx,
) => {
  const userid = raw.data.userid;
  const thrower =
    typeof userid === "number" && userid !== 0
      ? ctx.resolvePlayer(userid)
      : undefined;

  const position = Object.freeze({
    x: readNum(raw.data.x),
    y: readNum(raw.data.y),
    z: readNum(raw.data.z),
  });

  return freezeEvent<FlashbangDetonateEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    thrower,
    position,
    playersFlashed: EMPTY_FLASHED,
  });
};
