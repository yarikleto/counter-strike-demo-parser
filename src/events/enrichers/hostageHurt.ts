/**
 * `hostage_hurt` Tier-1 enricher (TASK-045, ADR-006).
 *
 * Wire schema (CS:GO event descriptor on de_nuke.dem probe):
 *   { userid: short, hostage: short }
 *
 * `userid` is the player who damaged the hostage; `hostage` is the
 * `CHostage` entity index of the victim. Returns `null` if the attacker
 * doesn't resolve — a damage event without an attacker is not actionable.
 *
 * Note: the descriptor does NOT include a damage-amount field; consumers
 * needing damage magnitudes must correlate with adjacent state on the
 * hostage entity overlay.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface HostageHurtEvent extends EnrichedEvent {
  /** Player who damaged the hostage. */
  readonly player: Player;
  /** Entity index of the damaged hostage (`CHostage`). */
  readonly hostage: number;
}

export const enrichHostageHurt: Enricher<HostageHurtEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const hostage = typeof raw.data.hostage === "number" ? raw.data.hostage : 0;

  return freezeEvent<HostageHurtEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    hostage,
  });
};
