/**
 * `grenade_thrown` Tier-1 enricher (TASK-041, ADR-006).
 *
 * Wire schema (CS:GO event descriptor): { userid: short, weapon: string }
 *
 * The thrown event marks the moment a grenade leaves the thrower's hand;
 * the projectile entity itself is created concurrently and tracked through
 * subsequent `grenade_bounce` and `<type>_detonate` events. Bots in the
 * de_nuke fixture do not emit `grenade_thrown` (descriptor present but
 * count = 0), so the enricher's contract here is driven entirely by the
 * unit tests rather than the integration baseline.
 *
 * `userid` -> `thrower`. Returns `null` when the thrower can't be resolved:
 * a throw without an attributable thrower has no actionable shape (the
 * grenade tracker, TASK-063, needs the thrower to attribute trajectories).
 * This is the same contract as the kill-event family, and divergent from
 * the detonation events where the world-space position alone is valuable.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface GrenadeThrownEvent extends EnrichedEvent {
  /** Player who threw the grenade. */
  readonly thrower: Player;
  /** Weapon class name, e.g. `"weapon_hegrenade"`. Empty string if absent. */
  readonly weapon: string;
}

export const enrichGrenadeThrown: Enricher<GrenadeThrownEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const thrower =
    typeof userid === "number" && userid !== 0
      ? ctx.resolvePlayer(userid)
      : undefined;
  if (thrower === undefined) return null;

  const weapon = typeof raw.data.weapon === "string" ? raw.data.weapon : "";

  return freezeEvent<GrenadeThrownEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    thrower,
    weapon,
  });
};
