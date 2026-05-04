/**
 * `hostage_follows` Tier-1 enricher — hostage pickup (TASK-045, ADR-006).
 *
 * Wire schema (CS:GO event descriptor on de_nuke.dem probe):
 *   { userid: short, hostage: short }
 *
 * Wire-key choice: CS:GO networks the rescue-mode pickup as
 * `hostage_follows` — the hostage starts following the player who grabbed
 * it. There is NO `hostage_grab` descriptor in the network event list (the
 * de_nuke probe surfaces seven hostage_* descriptors:
 * call_for_help / follows / hurt / killed / rescued / rescued_all /
 * stops_following). `follows` is the canonical pickup signal.
 *
 * `userid` -> `player`. Returns `null` if the picker-upper doesn't resolve.
 * `hostage` is the `CHostage` entity index, not a player slot.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface HostagePickedUpEvent extends EnrichedEvent {
  /** Player who picked up the hostage. */
  readonly player: Player;
  /** Entity index of the hostage (`CHostage`). */
  readonly hostage: number;
}

export const enrichHostagePickedUp: Enricher<HostagePickedUpEvent> = (
  raw,
  ctx,
) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const hostage = typeof raw.data.hostage === "number" ? raw.data.hostage : 0;

  return freezeEvent<HostagePickedUpEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    hostage,
  });
};
