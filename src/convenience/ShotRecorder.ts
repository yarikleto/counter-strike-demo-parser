/**
 * ShotRecorder — one columnar row per `weapon_fire` game event, for
 * tracers, muzzle flashes and knife / throw animations in a 2D replay.
 *
 * GOTV demos network `weapon_fire` for every trigger pull: gun shots (one
 * event per shot, not per pellet), knife swings and grenade throws. All of
 * them are kept; the `kind` column tells them apart ({@link ShotKind}).
 *
 * Row `i` across all columns is one shot, in wire order (ticks never
 * decrease). `player[i]` indexes `DemoResult.players`; `weapon[i]` indexes
 * `weapons`. A shot whose shooter cannot be resolved (`userid` of a player
 * who already left) is dropped, like the enriched `weapon_fire` event.
 */
import type { DemoParser } from "../DemoParser.js";
import type { WeaponFireEvent } from "../events/enrichers/weaponFire.js";
import { PlayerRoster } from "./PlayerRoster.js";
import { ColumnTable, StringTable } from "./columns.js";

/** Values of {@link PlayerShots.kind}. */
export const ShotKind = {
  /** A gun (including the Zeus): draw a tracer / muzzle flash. */
  Bullet: 0,
  /** A knife (any finish), bayonet, fists or melee weapon swing. */
  Knife: 1,
  /** A grenade throw (HE, flash, smoke, molotov, incendiary, decoy, …). */
  Grenade: 2,
  /** Anything else that fires the event (C4, Healthshot, …). */
  Other: 3,
} as const;

/** Bits of {@link PlayerShots.flags}. */
export const ShotFlags = {
  /** The event's `silenced` field: USP-S / M4A1-S with the silencer on. */
  Silenced: 1,
} as const;

/**
 * Columnar shots. Every typed array has exactly `length` elements.
 */
export interface PlayerShots {
  /** Number of rows. */
  readonly length: number;
  /**
   * Weapon names, indexed by `weapon[i]`. Named like `KillRecord.weapon`:
   * the event's `weapon_` prefix is removed ("ak47", "m4a1_silencer",
   * "knife_t", "hegrenade").
   */
  readonly weapons: string[];
  /** Frame tick of the event (`DemoParser.currentTick`). */
  readonly tick: Int32Array;
  /** Shooter: index into `DemoResult.players`. */
  readonly player: Uint16Array;
  /**
   * Shooter's origin (feet) when the event was decoded, in world space.
   * The eye is about 64 units above it standing, 46 crouched.
   */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  /** Shooter's view yaw in degrees (`m_angEyeAngles[1]`). */
  readonly yaw: Float32Array;
  /** Shooter's view pitch in degrees (`m_angEyeAngles[0]`; positive looks down). */
  readonly pitch: Float32Array;
  /** Index into `weapons`. */
  readonly weapon: Uint16Array;
  /** {@link ShotKind} value. */
  readonly kind: Uint8Array;
  /** {@link ShotFlags} bits. */
  readonly flags: Uint8Array;
}

/** Every column's underlying `ArrayBuffer` — the `postMessage` transfer list. */
export function shotBuffers(shots: PlayerShots): ArrayBuffer[] {
  return [
    shots.tick,
    shots.player,
    shots.x,
    shots.y,
    shots.z,
    shots.yaw,
    shots.pitch,
    shots.weapon,
    shots.kind,
    shots.flags,
  ].map((column) => column.buffer as ArrayBuffer);
}

const GRENADES: ReadonlySet<string> = new Set([
  "hegrenade",
  "flashbang",
  "smokegrenade",
  "molotov",
  "incgrenade",
  "decoy",
  "tagrenade",
  "firebomb",
  "diversion",
  "frag_grenade",
  "snowball",
]);
const MELEE: ReadonlySet<string> = new Set([
  "bayonet",
  "fists",
  "melee",
  "axe",
  "hammer",
  "spanner",
]);
const OTHER: ReadonlySet<string> = new Set([
  "c4",
  "healthshot",
  "breachcharge",
  "bumpmine",
  "tablet",
  "shield",
  "zone_repulsor",
]);

/** {@link ShotKind} of a weapon name (without the `weapon_` prefix). */
export function shotKind(weapon: string): number {
  if (GRENADES.has(weapon)) return ShotKind.Grenade;
  if (weapon.startsWith("knife") || MELEE.has(weapon)) return ShotKind.Knife;
  if (OTHER.has(weapon)) return ShotKind.Other;
  return ShotKind.Bullet;
}

const SPEC = {
  tick: Int32Array,
  player: Uint16Array,
  x: Float32Array,
  y: Float32Array,
  z: Float32Array,
  yaw: Float32Array,
  pitch: Float32Array,
  weapon: Uint16Array,
  kind: Uint8Array,
  flags: Uint8Array,
};

export class ShotRecorder {
  private readonly table: ColumnTable<typeof SPEC>;
  private readonly weapons = new StringTable();
  /** Weapon id → kind, so the classification runs once per weapon. */
  private readonly kinds: number[] = [];
  private parser: DemoParser | null = null;
  private roster: PlayerRoster | null = null;

  /** @param initialCapacity - rows to allocate up front; grows by doubling. */
  constructor(initialCapacity = 8192) {
    this.table = new ColumnTable(SPEC, initialCapacity);
  }

  attach(parser: DemoParser): void {
    this.parser = parser;
    this.roster = PlayerRoster.for(parser);
    parser.on("weapon_fire", (e) => this.onWeaponFire(e));
  }

  /** Right-sized columns of every shot so far. */
  snapshot(): PlayerShots {
    return {
      length: this.table.length,
      weapons: [...this.weapons.values],
      ...this.table.snapshot(),
    };
  }

  private onWeaponFire(e: WeaponFireEvent): void {
    const roster = this.roster!;
    const player = e.player;
    const name = e.weapon.startsWith("weapon_") ? e.weapon.slice(7) : e.weapon;
    const weapon = this.weapons.id(name);
    if (weapon === this.kinds.length) this.kinds.push(shotKind(name));
    const index = roster.indexOf(player);
    roster.noteTeam(index, player.team);
    const pos = player.position;
    const view = player.viewAngle;

    const i = this.table.addRow();
    const c = this.table.columns;
    c.tick[i] = this.parser!.currentTick;
    c.player[i] = index;
    c.x[i] = pos.x;
    c.y[i] = pos.y;
    c.z[i] = pos.z;
    c.yaw[i] = view.yaw;
    c.pitch[i] = view.pitch;
    c.weapon[i] = weapon;
    c.kind[i] = this.kinds[weapon]!;
    c.flags[i] = e.silenced ? ShotFlags.Silenced : 0;
  }
}
