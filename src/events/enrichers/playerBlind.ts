/**
 * `player_blind` Tier-1 enricher (TASK-038, ADR-006).
 *
 * Wire schema:
 *   { userid: short, attacker: short, entityid: long, blind_duration: float }
 *
 * Resolution rules (ADR-006 decision 3 + 5):
 *   - `userid` -> `player`. Returns `null` if the flashed player can't be
 *     resolved — the event has no shape without a victim.
 *   - `attacker` -> `Player | undefined`. Self-flash is `attacker === userid`
 *     and naturally falls out: both fields point to the same `Player`.
 *
 * `entityid` (the flashbang projectile entity) is not surfaced — consumers
 * who need projectile tracking should listen to the grenade lifecycle events
 * (TASK-041) and correlate by tick. Keeping this payload minimal avoids
 * leaking entity-system concepts into a high-level event.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface PlayerBlindEvent extends EnrichedEvent {
  /** Player who was flashed. */
  readonly player: Player;
  /** Player who threw the flashbang — `undefined` when unresolvable. */
  readonly attacker: Player | undefined;
  /** Effective blind duration in seconds (post-occlusion, post-orientation). */
  readonly blindDuration: number;
}

export const enrichPlayerBlind: Enricher<PlayerBlindEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const attackerId = raw.data.attacker;
  const attacker =
    typeof attackerId === "number" && attackerId !== 0
      ? ctx.resolvePlayer(attackerId)
      : undefined;

  const blindDuration =
    typeof raw.data.blind_duration === "number" ? raw.data.blind_duration : 0;

  return freezeEvent<PlayerBlindEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    attacker,
    blindDuration,
  });
};
