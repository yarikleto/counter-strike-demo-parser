/**
 * `molotov_detonate` Tier-1 enricher (TASK-041, ADR-006).
 *
 * Wire schema: { userid: short, x: float, y: float, z: float }
 *
 * Fires when a molotov / incendiary projectile detonates and the inferno
 * (fire-on-ground) volume is created. The matching expiry fires as
 * `inferno_expire` (separate enricher) — note that the inferno_expire
 * descriptor lacks a userid, so attribution requires correlating by
 * position or by `entityid` across the pair.
 *
 * `thrower` is `Player | undefined` per ADR-006 decision 5; position
 * always emitted (frozen). On the de_nuke bot fixture this event count
 * is zero — bots don't use molotovs — so the contract is driven by the
 * unit tests rather than the integration baseline.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player, Vector3 } from "../../state/Player.js";

export interface MolotovDetonateEvent extends EnrichedEvent {
  /** Thrower — `undefined` when the userid can't be resolved. */
  readonly thrower: Player | undefined;
  /** World-space detonation position. Frozen. */
  readonly position: Vector3;
}

function readNum(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export const enrichMolotovDetonate: Enricher<MolotovDetonateEvent> = (
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

  return freezeEvent<MolotovDetonateEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    thrower,
    position,
  });
};
