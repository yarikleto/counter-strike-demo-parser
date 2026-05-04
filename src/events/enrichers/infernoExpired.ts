/**
 * `inferno_expire` Tier-1 enricher (TASK-041, ADR-006).
 *
 * Wire schema (CS:GO event descriptor — verified against de_nuke.dem):
 *   { entityid: long, x: float, y: float, z: float }
 *
 * Notable: the descriptor does NOT carry a `userid`. The inferno (fire
 * volume) is a server-spawned entity decoupled from the molotov grenade
 * that birthed it, and at expiry time only its entity id and origin are
 * networked. Consequently `thrower` always surfaces as `undefined` here
 * — the field is preserved on the typed surface for ergonomic consistency
 * with the rest of the detonation/expiry family. Consumers needing
 * attribution should correlate this event with the preceding
 * `molotov_detonate` by position (or by entityid via the entity overlay).
 *
 * Position always emitted, frozen.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player, Vector3 } from "../../state/Player.js";

export interface InfernoExpiredEvent extends EnrichedEvent {
  /** Always `undefined` — the wire descriptor has no userid. */
  readonly thrower: Player | undefined;
  /** World-space inferno-volume origin. Frozen. */
  readonly position: Vector3;
}

function readNum(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export const enrichInfernoExpired: Enricher<InfernoExpiredEvent> = (raw) => {
  const position = Object.freeze({
    x: readNum(raw.data.x),
    y: readNum(raw.data.y),
    z: readNum(raw.data.z),
  });

  return freezeEvent<InfernoExpiredEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    thrower: undefined,
    position,
  });
};
