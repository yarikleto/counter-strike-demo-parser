/**
 * `bullet_impact` Tier-1 enricher (TASK-038, ADR-006).
 *
 * Wire schema: { userid: short, x: float, y: float, z: float }
 *
 * Per ADR-006 decision 5 / 3, the `player` field is `Player | undefined`
 * and the event fires regardless of whether the userid resolves. This is a
 * deliberate divergence from the kill-event family (which returns `null` on
 * missing victim): a bullet impact's primary payload is the world-space
 * impact location, which is meaningful for trajectory / wallbang analysis
 * even when the shooter has disconnected one tick before.
 *
 * The position object is frozen alongside the event so consumers can hold
 * the reference past the call without risking mutation.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player, Vector3 } from "../../state/Player.js";

export interface BulletImpactEvent extends EnrichedEvent {
  /** Shooter — `undefined` when the userid can't be resolved. */
  readonly player: Player | undefined;
  /** World-space coordinate the bullet struck. Frozen. */
  readonly position: Vector3;
}

function readNum(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export const enrichBulletImpact: Enricher<BulletImpactEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" && userid !== 0
      ? ctx.resolvePlayer(userid)
      : undefined;

  const position = Object.freeze({
    x: readNum(raw.data.x),
    y: readNum(raw.data.y),
    z: readNum(raw.data.z),
  });

  return freezeEvent<BulletImpactEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    position,
  });
};
