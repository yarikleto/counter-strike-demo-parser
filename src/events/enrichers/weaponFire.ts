/**
 * `weapon_fire` Tier-1 enricher (TASK-044, ADR-006).
 *
 * Wire schema (verified against de_nuke.dem in `game-event.test.ts`):
 *   { userid: short, weapon: string, silenced: bool }
 *
 * Resolution: `userid` -> `Player` via `ctx.resolvePlayer`. When the player
 * does not resolve (disconnect-mid-tick or `userid === 0`) this enricher
 * returns `null` per the TASK-044 brief — diverging from ADR-006 decision 5
 * for the weapon-event family because a weapon_fire without a shooter is not
 * actionable for any downstream consumer (no kill credit, no weapon attribution).
 *
 * `silenced` defaults to `false` when absent on the wire — the descriptor
 * always carries the bool key but a forward-compat server build could omit
 * it; emit-anyway with the conservative default is friendlier than dropping
 * the event.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface WeaponFireEvent extends EnrichedEvent {
  /** Shooter — resolved CCSPlayer overlay. */
  readonly player: Player;
  /** Weapon class name (e.g. `weapon_ak47`, `weapon_awp`). */
  readonly weapon: string;
  /** True for silenced weapons (USP-S, M4A1-S). Defaults to false if absent. */
  readonly silenced: boolean;
}

export const enrichWeaponFire: Enricher<WeaponFireEvent> = (raw, ctx) => {
  const userid = raw.data.userid;
  const player =
    typeof userid === "number" ? ctx.resolvePlayer(userid) : undefined;
  if (player === undefined) return null;

  const weapon = typeof raw.data.weapon === "string" ? raw.data.weapon : "";
  const silenced = raw.data.silenced === true;

  return freezeEvent<WeaponFireEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    player,
    weapon,
    silenced,
  });
};
