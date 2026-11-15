/**
 * PositionRecorder — samples every T/CT player's state at a fixed tick
 * interval into columnar typed arrays, for 2D replays and heatmaps.
 *
 * Why columnar: a 40-minute 128-tick demo sampled every 8 ticks for ten
 * players is ~375 000 rows. As objects that is hundreds of MB of heap and
 * one GC-tracked allocation per row; as typed arrays it is ~13 MB of flat
 * memory that can be transferred from a Web Worker to the main thread
 * without copying (`postMessage(result, positionBuffers(result.positions))`).
 *
 * Row `i` across all columns is one (player, tick) sample. Rows are ordered
 * by tick, then by player slot. `player[i]` indexes `DemoResult.players`.
 *
 * Sampling happens on `frameEnd`, after the frame's entity updates are all
 * applied, on the first frame at or after each multiple of
 * `sampleRateTicks`. Spectators and unassigned players (team < 2) are
 * skipped; dead players are kept (with the `alive` flag cleared) so the
 * replay can draw where they fell.
 */
import type { DemoParser } from "../DemoParser.js";
import type { Entity } from "../entities/Entity.js";
import type { ServerClass } from "../datatables/ServerClass.js";
import { resolveHandle } from "../state/EntityHandle.js";
import { PlayerRoster } from "./PlayerRoster.js";

/** Bits of {@link PlayerPositions.flags}. */
export const PositionFlags = {
  /** `m_lifeState === LIFE_ALIVE`. */
  Alive: 1,
  HasHelmet: 2,
  HasDefuser: 4,
} as const;

/** Columnar player samples. Every array has exactly `length` elements. */
export interface PlayerPositions {
  /** Tick interval the samples were taken at. */
  readonly sampleRateTicks: number;
  /** Number of rows. */
  readonly length: number;
  readonly tick: Int32Array;
  /** Index into `DemoResult.players`. */
  readonly player: Uint16Array;
  /** CCSPlayer entity id (connection slot) at the time. */
  readonly slot: Uint8Array;
  /** World-space position (same space as kills, grenades, bomb events). */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  /** View yaw in degrees (`m_angEyeAngles[1]`), 0..360. */
  readonly yaw: Float32Array;
  /** View pitch in degrees (`m_angEyeAngles[0]`). */
  readonly pitch: Float32Array;
  readonly health: Uint8Array;
  readonly armor: Uint8Array;
  /** Cash, clamped to 65535. */
  readonly money: Uint16Array;
  /** 2 = T, 3 = CT. */
  readonly team: Uint8Array;
  /** {@link PositionFlags} bits. */
  readonly flags: Uint8Array;
  /**
   * Item definition index of the active weapon (0 = none). Translate with
   * `weaponNameForItemDefIndex`.
   */
  readonly activeWeapon: Uint16Array;
}

/** Every column's underlying `ArrayBuffer` — the `postMessage` transfer list. */
export function positionBuffers(positions: PlayerPositions): ArrayBuffer[] {
  return [
    positions.tick,
    positions.player,
    positions.slot,
    positions.x,
    positions.y,
    positions.z,
    positions.yaw,
    positions.pitch,
    positions.health,
    positions.armor,
    positions.money,
    positions.team,
    positions.flags,
    positions.activeWeapon,
  ].map((column) => column.buffer as ArrayBuffer);
}

type Columns = {
  -readonly [K in keyof Omit<PlayerPositions, "sampleRateTicks" | "length">]: PlayerPositions[K];
};

function allocate(capacity: number): Columns {
  return {
    tick: new Int32Array(capacity),
    player: new Uint16Array(capacity),
    slot: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    yaw: new Float32Array(capacity),
    pitch: new Float32Array(capacity),
    health: new Uint8Array(capacity),
    armor: new Uint8Array(capacity),
    money: new Uint16Array(capacity),
    team: new Uint8Array(capacity),
    flags: new Uint8Array(capacity),
    activeWeapon: new Uint16Array(capacity),
  };
}

/** Copy the first `length` rows of every column into right-sized arrays. */
function resize(columns: Columns, length: number, capacity: number): Columns {
  const next = allocate(capacity);
  for (const key of Object.keys(columns) as (keyof Columns)[]) {
    (next[key] as Uint8Array).set((columns[key] as Uint8Array).subarray(0, length));
  }
  return next;
}

const itemDefIdxCache = new WeakMap<ServerClass, number>();

/** `m_iItemDefinitionIndex` of a weapon entity, or 0. */
function itemDefinitionIndex(entity: Entity): number {
  let idx = itemDefIdxCache.get(entity.serverClass);
  if (idx === undefined) {
    idx = entity.serverClass.flattenedProps.findIndex(
      (p) => p.prop.varName === "m_iItemDefinitionIndex",
    );
    itemDefIdxCache.set(entity.serverClass, idx);
  }
  if (idx < 0) return 0;
  const v = entity.store.read(entity.storageSlot, idx);
  return typeof v === "number" ? v : 0;
}

const clamp = (v: number, max: number): number => (v < 0 ? 0 : v > max ? max : v);

/** Players sampled per tick in a 5v5 match; used to presize the columns. */
const EXPECTED_PLAYERS = 10;

export class PositionRecorder {
  private readonly sampleRate: number;
  private columns: Columns;
  private capacity: number;
  private length = 0;
  private nextSampleTick = -Infinity;
  private presized = false;
  private parser: DemoParser | null = null;
  private roster: PlayerRoster | null = null;

  /**
   * @param sampleRateTicks - sample every N ticks (values < 1 become 1).
   * @param expectedRows    - initial capacity; by default sized from the
   *                          demo header on the first sample. Grows by doubling.
   */
  constructor(sampleRateTicks: number, expectedRows?: number) {
    this.presized = expectedRows !== undefined;
    this.sampleRate = Math.max(1, Math.floor(sampleRateTicks));
    this.capacity = Math.max(64, expectedRows ?? 0);
    this.columns = allocate(this.capacity);
  }

  attach(parser: DemoParser): void {
    this.parser = parser;
    this.roster = PlayerRoster.for(parser);
    parser.on("frameEnd", (tick) => this.onFrameEnd(tick));
  }

  /** Right-sized columns of everything sampled so far. */
  snapshot(): PlayerPositions {
    const exact = resize(this.columns, this.length, this.length);
    return { sampleRateTicks: this.sampleRate, length: this.length, ...exact };
  }

  private onFrameEnd(tick: number): void {
    if (tick < this.nextSampleTick) return;
    this.nextSampleTick = (Math.floor(tick / this.sampleRate) + 1) * this.sampleRate;

    const parser = this.parser!;
    const roster = this.roster!;
    if (!this.presized) {
      // The header is parsed before the first frame: size for the whole demo.
      this.presized = true;
      const ticks = parser.header?.playbackTicks ?? 0;
      const estimate = Math.ceil(ticks / this.sampleRate + 1) * EXPECTED_PLAYERS;
      if (estimate > this.capacity) {
        this.capacity = estimate;
        this.columns = resize(this.columns, this.length, this.capacity);
      }
    }
    for (const player of parser.players) {
      const team = player.team;
      if (team < 2) continue;
      if (this.length === this.capacity) {
        this.capacity *= 2;
        this.columns = resize(this.columns, this.length, this.capacity);
      }
      const c = this.columns;
      const i = this.length++;
      const index = roster.indexOf(player);
      roster.noteTeam(index, team);
      const pos = player.position;
      const view = player.viewAngle;
      const weapon = resolveHandle(parser.entities, player.activeWeaponHandle);
      c.tick[i] = tick;
      c.player[i] = index;
      c.slot[i] = player.slot;
      c.x[i] = pos.x;
      c.y[i] = pos.y;
      c.z[i] = pos.z;
      c.yaw[i] = view.yaw;
      c.pitch[i] = view.pitch;
      c.health[i] = clamp(player.health, 255);
      c.armor[i] = clamp(player.armor, 255);
      c.money[i] = clamp(player.money, 65535);
      c.team[i] = team;
      c.flags[i] =
        (player.isAlive ? PositionFlags.Alive : 0) |
        (player.hasHelmet ? PositionFlags.HasHelmet : 0) |
        (player.hasDefuser ? PositionFlags.HasDefuser : 0);
      c.activeWeapon[i] = weapon !== undefined ? itemDefinitionIndex(weapon) : 0;
    }
  }
}
