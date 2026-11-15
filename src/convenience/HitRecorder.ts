/**
 * HitRecorder — one columnar row per `player_hurt` game event, for hit
 * sparks and damage numbers in a 2D replay. `DemoResult.damage` keeps the
 * full-match totals; this keeps every individual hit.
 *
 * Row `i` across all columns is one hit, in wire order (ticks never
 * decrease). `attacker[i]` / `victim[i]` index `DemoResult.players`;
 * `weapon[i]` indexes `weapons`. A hit whose victim cannot be resolved is
 * dropped, like the enriched `player_hurt` event.
 */
import type { DemoParser } from "../DemoParser.js";
import type { PlayerHurtEvent } from "../events/enrichers/playerHurt.js";
import { PlayerRoster } from "./PlayerRoster.js";
import { ColumnTable, StringTable } from "./columns.js";

/**
 * `attacker[i]` of a hit without a resolvable attacker: world damage (fall,
 * bomb), or an attacker who already left.
 */
export const NO_PLAYER = 0xffff;

/** Columnar hits. Every typed array has exactly `length` elements. */
export interface PlayerHits {
  /** Number of rows. */
  readonly length: number;
  /**
   * Weapon names, indexed by `weapon[i]`, exactly as `player_hurt` reports
   * them: "ak47", "m4a1" (also for the M4A1-S), "hkp2000" (also for the
   * USP-S), "knife", "hegrenade", "inferno"; "" or "world" for world damage.
   */
  readonly weapons: string[];
  /** Frame tick of the event (`DemoParser.currentTick`). */
  readonly tick: Int32Array;
  /** Index into `DemoResult.players`, or {@link NO_PLAYER}. */
  readonly attacker: Uint16Array;
  /** Index into `DemoResult.players`. */
  readonly victim: Uint16Array;
  /** Index into `weapons`. */
  readonly weapon: Uint16Array;
  /** Health damage of this hit (`dmg_health`, after armor; can exceed the health left). */
  readonly damage: Uint16Array;
  /** Armor damage of this hit (`dmg_armor`). */
  readonly armorDamage: Uint8Array;
  /** Hit group (`HitGroup` values: 1 head, 2 chest, 3 stomach, …; 0 generic). */
  readonly hitGroup: Uint8Array;
  /** Victim's health after the hit. */
  readonly health: Uint8Array;
  /** Victim's armor after the hit. */
  readonly armor: Uint8Array;
  /** Attacker's origin (feet) at the hit; NaN when there is no attacker. */
  readonly attackerX: Float32Array;
  readonly attackerY: Float32Array;
  readonly attackerZ: Float32Array;
  /** Victim's origin (feet) at the hit. */
  readonly victimX: Float32Array;
  readonly victimY: Float32Array;
  readonly victimZ: Float32Array;
}

/** Every column's underlying `ArrayBuffer` — the `postMessage` transfer list. */
export function hitBuffers(hits: PlayerHits): ArrayBuffer[] {
  return [
    hits.tick,
    hits.attacker,
    hits.victim,
    hits.weapon,
    hits.damage,
    hits.armorDamage,
    hits.hitGroup,
    hits.health,
    hits.armor,
    hits.attackerX,
    hits.attackerY,
    hits.attackerZ,
    hits.victimX,
    hits.victimY,
    hits.victimZ,
  ].map((column) => column.buffer as ArrayBuffer);
}

const SPEC = {
  tick: Int32Array,
  attacker: Uint16Array,
  victim: Uint16Array,
  weapon: Uint16Array,
  damage: Uint16Array,
  armorDamage: Uint8Array,
  hitGroup: Uint8Array,
  health: Uint8Array,
  armor: Uint8Array,
  attackerX: Float32Array,
  attackerY: Float32Array,
  attackerZ: Float32Array,
  victimX: Float32Array,
  victimY: Float32Array,
  victimZ: Float32Array,
};

const clamp = (v: number, max: number): number => (v < 0 ? 0 : v > max ? max : v);

export class HitRecorder {
  private readonly table: ColumnTable<typeof SPEC>;
  private readonly weapons = new StringTable();
  private parser: DemoParser | null = null;
  private roster: PlayerRoster | null = null;

  /** @param initialCapacity - rows to allocate up front; grows by doubling. */
  constructor(initialCapacity = 2048) {
    this.table = new ColumnTable(SPEC, initialCapacity);
  }

  attach(parser: DemoParser): void {
    this.parser = parser;
    this.roster = PlayerRoster.for(parser);
    parser.on("player_hurt", (e) => this.onPlayerHurt(e));
  }

  /** Right-sized columns of every hit so far. */
  snapshot(): PlayerHits {
    return {
      length: this.table.length,
      weapons: [...this.weapons.values],
      ...this.table.snapshot(),
    };
  }

  private onPlayerHurt(e: PlayerHurtEvent): void {
    const roster = this.roster!;
    const i = this.table.addRow();
    const c = this.table.columns;
    c.tick[i] = this.parser!.currentTick;

    const victim = e.victim;
    const victimIndex = roster.indexOf(victim);
    roster.noteTeam(victimIndex, victim.team);
    c.victim[i] = victimIndex;
    const vp = victim.position;
    c.victimX[i] = vp.x;
    c.victimY[i] = vp.y;
    c.victimZ[i] = vp.z;

    const attacker = e.attacker;
    if (attacker !== undefined) {
      const attackerIndex = roster.indexOf(attacker);
      roster.noteTeam(attackerIndex, attacker.team);
      c.attacker[i] = attackerIndex;
      const ap = attacker.position;
      c.attackerX[i] = ap.x;
      c.attackerY[i] = ap.y;
      c.attackerZ[i] = ap.z;
    } else {
      c.attacker[i] = NO_PLAYER;
      c.attackerX[i] = NaN;
      c.attackerY[i] = NaN;
      c.attackerZ[i] = NaN;
    }

    c.weapon[i] = this.weapons.id(e.weapon);
    c.damage[i] = clamp(e.damage, 0xffff);
    c.armorDamage[i] = clamp(e.damageArmor, 0xff);
    c.hitGroup[i] = clamp(e.hitGroup, 0xff);
    c.health[i] = clamp(e.healthRemaining, 0xff);
    c.armor[i] = clamp(e.armorRemaining, 0xff);
  }
}
