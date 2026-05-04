/**
 * `hegrenade_detonate` Tier-1 enricher (TASK-041, ADR-006).
 *
 * Wire schema: { userid: short, entityid: long, x: float, y: float, z: float }
 *
 * Per ADR-006 decision 5, detonation events fire even when the thrower
 * doesn't resolve — the world-space detonation position is independently
 * valuable for damage, smoke-line, and economy analytics, and a thrower
 * who disconnected one tick before detonation still produced a real blast.
 * `thrower` therefore surfaces as `Player | undefined` (not `null`-on-miss).
 *
 * `entityid` (the projectile entity at detonation time) is intentionally
 * NOT surfaced: the projectile is destroyed in the same tick, so the
 * entity-id has no useful afterlife for downstream consumers. Trajectory
 * reconstruction goes through the grenade tracker (TASK-063), which keys
 * off `grenade_thrown` / `grenade_bounce`.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player, Vector3 } from "../../state/Player.js";

export interface HeGrenadeDetonateEvent extends EnrichedEvent {
  /** Thrower — `undefined` when the userid can't be resolved. */
  readonly thrower: Player | undefined;
  /** World-space detonation position. Frozen. */
  readonly position: Vector3;
}

function readNum(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export const enrichHeGrenadeDetonate: Enricher<HeGrenadeDetonateEvent> = (
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

  return freezeEvent<HeGrenadeDetonateEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    thrower,
    position,
  });
};
