/**
 * `hostage_rescued` Tier-1 enricher (TASK-045, ADR-006).
 *
 * Wire schema (CS:GO event descriptor on de_nuke.dem probe):
 *   { userid: short, hostage: short, site: short }
 *
 * `userid` -> `player`. Returns `null` if the rescuer doesn't resolve — a
 * rescue without a rescuer has no actionable shape (consistent with the
 * bomb-lifecycle enrichers).
 *
 * `hostage` is the level-design entity index of the hostage entity (the
 * `CHostage` networked entity), NOT a player slot. `site` is the hostage
 * rescue zone's `func_hostage_rescue` brush entity index — analogous to the
 * bomb-target site index. Both surface as `number`; consumers map indices
 * out of band when they need human-readable labels.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface HostageRescuedEvent extends EnrichedEvent {
  /** Player who rescued the hostage. */
  readonly player: Player;
  /** Entity index of the rescued hostage (`CHostage`). */
  readonly hostage: number;
  /** Entity index of the hostage rescue zone brush (map-specific). */
  readonly site: number;
}

export const enrichHostageRescued: Enricher<HostageRescuedEvent> = (
  raw,
  ctx,
) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const hostage = typeof raw.data.hostage === "number" ? raw.data.hostage : 0;
  const site = typeof raw.data.site === "number" ? raw.data.site : 0;

  return freezeEvent<HostageRescuedEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    hostage,
    site,
  });
};
