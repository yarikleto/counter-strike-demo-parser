/**
 * `decoy_detonate` Tier-1 enricher (TASK-041, ADR-006).
 *
 * Wire schema: { userid: short, entityid: long, x: float, y: float, z: float }
 *
 * Fires when the decoy grenade plays out its fake-gunfire sequence.
 * `thrower` is `Player | undefined` per ADR-006 decision 5 — position
 * alone has analytics value for fakes / tactical-deception heatmaps even
 * without an attributable thrower.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player, Vector3 } from "../../state/Player.js";

export interface DecoyDetonateEvent extends EnrichedEvent {
  /** Thrower — `undefined` when the userid can't be resolved. */
  readonly thrower: Player | undefined;
  /** World-space detonation position. Frozen. */
  readonly position: Vector3;
}

function readNum(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export const enrichDecoyDetonate: Enricher<DecoyDetonateEvent> = (raw, ctx) => {
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

  return freezeEvent<DecoyDetonateEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    thrower,
    position,
  });
};
