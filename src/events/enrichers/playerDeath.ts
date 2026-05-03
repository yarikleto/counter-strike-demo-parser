/**
 * `player_death` Tier-1 enricher (TASK-038, ADR-006).
 *
 * Wire schema (from the descriptor table on a competitive CS:GO demo):
 *   { userid: short, attacker: short, assister: short, weapon: string,
 *     headshot: bool, penetrated: long, noscope: bool, thrusmoke: bool,
 *     attackerblind: bool }
 *
 * Resolution rules (ADR-006 decision 3 + 5):
 *   - `userid` -> `victim`. If the victim doesn't resolve we return `null` —
 *     a death without a victim has no actionable shape.
 *   - `attacker` -> `Player | undefined`. `attacker === 0` is world / engine
 *     damage (fall, world brushes); surface as `undefined`, NOT a sentinel.
 *   - `assister` -> `Player | undefined`. Same absent-as-undefined contract.
 *   - Suicide is `attacker === victim` and naturally falls out: both fields
 *     point to the same `Player` reference.
 *
 * Field name mapping (ADR-006 decision 6, ADR-005 overlay rules):
 *   - `penetrated` arrives on the wire as a `long` (count). The Tier-1 type
 *     surfaces it as a `boolean` per TASK-038's brief — non-zero penetration
 *     count means the bullet wallbanged. Consumers asking "did this kill go
 *     through a wall?" want a bool, not a count.
 *   - `headshot`, `noscope`, `thrusmoke`, `attackerblind` are already booleans
 *     on the wire; pass through.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";

export interface PlayerDeathEvent extends EnrichedEvent {
  /** Killer — `undefined` for world / engine damage. */
  readonly attacker: Player | undefined;
  /** Victim — always present (the enricher returns `null` otherwise). */
  readonly victim: Player;
  /** Assister — `undefined` when no assist credit was given. */
  readonly assister: Player | undefined;
  /** Weapon class name (e.g. `weapon_ak47`) or `"world"` for world damage. */
  readonly weapon: string;
  /** True for headshot kills. */
  readonly headshot: boolean;
  /** True if the bullet wallbanged through one or more surfaces. */
  readonly penetrated: boolean;
  /** True for AWP/Scout no-scope kills. */
  readonly noscope: boolean;
  /** True if the bullet passed through smoke. */
  readonly thrusmoke: boolean;
  /** True if the attacker was flashed at trigger pull. */
  readonly attackerblind: boolean;
}

export const enrichPlayerDeath: Enricher<PlayerDeathEvent> = (raw, ctx) => {
  const victimId = raw.data.userid;
  const victim =
    typeof victimId === "number" ? ctx.resolvePlayer(victimId) : undefined;
  if (victim === undefined) return null;

  const attackerId = raw.data.attacker;
  const attacker =
    typeof attackerId === "number" && attackerId !== 0
      ? ctx.resolvePlayer(attackerId)
      : undefined;

  const assisterId = raw.data.assister;
  const assister =
    typeof assisterId === "number" && assisterId !== 0
      ? ctx.resolvePlayer(assisterId)
      : undefined;

  const weapon = typeof raw.data.weapon === "string" ? raw.data.weapon : "";
  const headshot = raw.data.headshot === true;
  const penetratedRaw = raw.data.penetrated;
  const penetrated =
    typeof penetratedRaw === "number"
      ? penetratedRaw !== 0
      : penetratedRaw === true;
  const noscope = raw.data.noscope === true;
  const thrusmoke = raw.data.thrusmoke === true;
  const attackerblind = raw.data.attackerblind === true;

  return freezeEvent<PlayerDeathEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    attacker,
    victim,
    assister,
    weapon,
    headshot,
    penetrated,
    noscope,
    thrusmoke,
    attackerblind,
  });
};
