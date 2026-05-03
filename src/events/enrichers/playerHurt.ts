/**
 * `player_hurt` Tier-1 enricher (TASK-038, ADR-006).
 *
 * Wire schema:
 *   { userid: short, attacker: short, weapon: string, dmg_health: long,
 *     dmg_armor: byte, hitgroup: byte, health: byte, armor: byte }
 *
 * Resolution rules (ADR-006 decision 3 + 5):
 *   - `userid` -> `victim`. `null` if missing — a damage event with no
 *     victim has no consumer-meaningful shape.
 *   - `attacker` -> `Player | undefined`. `attacker === 0` is world damage
 *     (fall, world brushes, fire); surface as `undefined`.
 *   - `hitgroup` -> `HitGroup | number`. ADR-006 decision 4: when the wire
 *     value isn't in the enum's value set we surface the raw number rather
 *     than throwing. A forward-compat server build could ship a new
 *     hitgroup id that this version of the parser doesn't know about.
 *
 * Field renames (ADR-005 / ADR-006 decision 6):
 *   `dmg_health` -> `damage`, `dmg_armor` -> `damageArmor`,
 *   `health` -> `healthRemaining`, `armor` -> `armorRemaining`,
 *   `hitgroup` -> `hitGroup`.
 */
import type { EnrichedEvent, Enricher } from "./Enricher.js";
import { freezeEvent } from "./Enricher.js";
import type { Player } from "../../state/Player.js";
import { HitGroup } from "../../enums/HitGroup.js";

const KNOWN_HITGROUPS = new Set<number>(Object.values(HitGroup) as number[]);

export interface PlayerHurtEvent extends EnrichedEvent {
  /** Damage dealer — `undefined` for world damage. */
  readonly attacker: Player | undefined;
  /** Victim — always present (the enricher returns `null` otherwise). */
  readonly victim: Player;
  /** Weapon class name (e.g. `weapon_ak47`) or `"world"` for world damage. */
  readonly weapon: string;
  /** HP damage dealt by this hit (post-armor). */
  readonly damage: number;
  /** Armor damage dealt by this hit. */
  readonly damageArmor: number;
  /**
   * Hitgroup the bullet/projectile struck. Typed as the `HitGroup` enum
   * when the wire value matches a known id; falls back to the raw integer
   * for forward-compat with future Source builds (ADR-006 decision 4).
   */
  readonly hitGroup: HitGroup | number;
  /** Victim's HP after the hit applied. */
  readonly healthRemaining: number;
  /** Victim's armor after the hit applied. */
  readonly armorRemaining: number;
}

function readNum(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export const enrichPlayerHurt: Enricher<PlayerHurtEvent> = (raw, ctx) => {
  const victimId = raw.data.userid;
  const victim =
    typeof victimId === "number" ? ctx.resolvePlayer(victimId) : undefined;
  if (victim === undefined) return null;

  const attackerId = raw.data.attacker;
  const attacker =
    typeof attackerId === "number" && attackerId !== 0
      ? ctx.resolvePlayer(attackerId)
      : undefined;

  const weapon = typeof raw.data.weapon === "string" ? raw.data.weapon : "";
  const damage = readNum(raw.data.dmg_health);
  const damageArmor = readNum(raw.data.dmg_armor);
  const hitgroupRaw = readNum(raw.data.hitgroup);
  const hitGroup: HitGroup | number = KNOWN_HITGROUPS.has(hitgroupRaw)
    ? (hitgroupRaw as HitGroup)
    : hitgroupRaw;
  const healthRemaining = readNum(raw.data.health);
  const armorRemaining = readNum(raw.data.armor);

  return freezeEvent<PlayerHurtEvent>({
    eventName: raw.name,
    eventId: raw.eventId,
    attacker,
    victim,
    weapon,
    damage,
    damageArmor,
    hitGroup,
    healthRemaining,
    armorRemaining,
  });
};
