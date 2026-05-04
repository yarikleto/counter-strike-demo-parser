/**
 * `smokegrenade_expired` Tier-1 enricher (TASK-041, ADR-006).
 *
 * Wire schema: { userid: short, entityid: long, x: float, y: float, z: float }
 *
 * Fires when the smoke volume clears (~18s after the matching
 * `smokegrenade_detonate`). The `position` carried on the wire is the
 * smoke origin — the same coordinate as the detonation, not where the
 * grenade lay at expiry — so consumers can correlate detonation/expiry
 * pairs purely by entityid + position.
 *
 * `thrower` is `Player | undefined` per ADR-006 decision 5.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player, Vector3 } from "../../state/Player.js";

export interface SmokeGrenadeExpiredEvent extends EnrichedEvent {
  /** Thrower — `undefined` when the userid can't be resolved. */
  readonly thrower: Player | undefined;
  /** World-space smoke-volume origin. Frozen. */
  readonly position: Vector3;
}

function readNum(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export const enrichSmokeGrenadeExpired: Enricher<SmokeGrenadeExpiredEvent> = (
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

  return freezeEvent<SmokeGrenadeExpiredEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    thrower,
    position,
  });
};
