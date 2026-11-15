/**
 * Plain-data record types produced by the convenience layer and returned in
 * `DemoResult`. Every type here is structured-clone and JSON safe: numbers,
 * strings, booleans, plain objects and arrays — no class instances, no
 * references into the parser.
 */
import type { Vector3 } from "../state/Player.js";
import type { PlayerRef } from "./PlayerRoster.js";
import type { GrenadeType } from "./GrenadeTrajectoryTracker.js";

/** A `player_death`, with both players' positions at the moment of the kill. */
export interface KillRecord {
  readonly tick: number;
  readonly attacker: PlayerRef | undefined;
  readonly victim: PlayerRef;
  readonly assister: PlayerRef | undefined;
  /** Weapon name as reported by the event, e.g. "ak47", "hegrenade". */
  readonly weapon: string;
  readonly headshot: boolean;
  readonly penetrated: boolean;
  readonly noscope: boolean;
  readonly thrusmoke: boolean;
  readonly attackerblind: boolean;
  /** `undefined` for world kills (fall damage, bomb, suicide by world). */
  readonly attackerPosition: Vector3 | undefined;
  readonly victimPosition: Vector3;
}

/** Bomb lifecycle step. */
export type BombEventType =
  | "begin_plant"
  | "abort_plant"
  | "planted"
  | "begin_defuse"
  | "abort_defuse"
  | "defused"
  | "exploded"
  | "dropped"
  | "picked_up";

export interface BombRecord {
  readonly type: BombEventType;
  readonly tick: number;
  /** Planter / defuser / carrier. `undefined` for `exploded`. */
  readonly player: PlayerRef | undefined;
  /**
   * Where it happened. Plant steps and drops/pickups use the player's
   * position; `defused` / `exploded` / defuse steps use the planted bomb's
   * position (falling back to the plant position).
   */
  readonly position: Vector3 | undefined;
  /**
   * Bombsite letter, resolved by the nearest of the two bombsite centres
   * networked on `CCSPlayerResource`. `undefined` when not applicable
   * (drops, pickups) or when the map has no bombsites.
   */
  readonly site: "A" | "B" | undefined;
  /** Raw `site` field of the event: the entity index of the bomb trigger. */
  readonly siteEntityIndex: number | undefined;
  /** `begin_defuse` only: whether the defuser has a kit. */
  readonly hasKit?: boolean;
}

/**
 * A grenade throw, derived from the projectile entity's creation. GOTV demos
 * do not network the `grenade_thrown` game event (0 occurrences on every
 * real demo tested), so throws come from entity tracking instead.
 */
export interface GrenadeThrow {
  /** Projectile entity id; matches `GrenadeTrajectory.entityIndex`. */
  readonly entityIndex: number;
  readonly type: GrenadeType;
  /** Tick the projectile entity appeared. */
  readonly tick: number;
  readonly thrower: PlayerRef | undefined;
  /** Thrower's position (feet) at the throw tick. */
  readonly throwerPosition: Vector3 | undefined;
  /** Where the projectile spawned (the first trajectory point). */
  readonly position: Vector3 | undefined;
}

/** Type of an on-ground / instantaneous grenade effect. */
export type GrenadeEffectType = "smoke" | "inferno" | "flash" | "he" | "decoy";

/**
 * A grenade's effect on the world. Smokes and infernos last from `startTick`
 * to `endTick`; flash, HE and decoy detonations are instantaneous
 * (`endTick === startTick`).
 */
export interface GrenadeEffect {
  readonly type: GrenadeEffectType;
  /**
   * Entity id carried by the event: the projectile for smoke/flash/HE/decoy,
   * the `CInferno` entity for infernos.
   */
  readonly entityIndex: number;
  readonly thrower: PlayerRef | undefined;
  readonly startTick: number;
  /**
   * `smokegrenade_expired` / `inferno_expire` tick. If the effect was still
   * active when the next round started, the round start tick. `undefined`
   * only if the demo ended first.
   */
  readonly endTick: number | undefined;
  readonly position: Vector3;
}

export type HostageEventType =
  | "follows"
  | "stops_following"
  | "rescued"
  | "hurt"
  | "killed"
  | "rescued_all";

/** Hostage events (cs_ maps). */
export interface HostageRecord {
  readonly type: HostageEventType;
  readonly tick: number;
  readonly player: PlayerRef | undefined;
  /** Hostage entity id; `undefined` for `rescued_all`. */
  readonly hostageEntityIndex: number | undefined;
  /** Hostage position if its entity is known, otherwise the player's. */
  readonly position: Vector3 | undefined;
}

/** A chat line. */
export interface ChatRecord {
  readonly tick: number;
  readonly sender: PlayerRef | undefined;
  readonly senderName: string;
  readonly message: string;
  readonly isTeamChat: boolean;
  readonly raw: string;
}

/** Full-match damage dealt by one player to another. */
export interface DamageRecord {
  readonly attacker: PlayerRef;
  readonly victim: PlayerRef;
  readonly totalDamage: number;
  readonly totalArmorDamage: number;
  readonly hitCount: number;
  /** Hits per weapon name (`"unknown"` when the event had none). */
  readonly weapons: Readonly<Record<string, number>>;
  /** Hits per hit group (`HitGroup` values). */
  readonly hitGroups: Readonly<Record<number, number>>;
}
