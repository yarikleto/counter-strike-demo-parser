/**
 * PlayerResource — typed overlay on the singleton CCSPlayerResource entity.
 *
 * CCSPlayerResource carries per-player-slot stat arrays (kills, deaths,
 * assists, score, ping). On the wire, each per-slot stat is its own
 * SendTable named after the stat (`m_iKills`, `m_iDeaths`, ...) and its
 * elements flatten to entries with `varName === "000".."063"` and
 * `sourceTableName === "<stat>"`. The disambiguator is the source-table
 * name, NOT a dotted-path varName. This is what the SendTable Flattener
 * already preserves (see TASK-029a / ADR-005 §4 and the probe output in
 * `scripts/probe-pr.ts` against de_nuke.dem). An earlier draft assumed
 * the demoinfocs `m_iKills.000` convention and could not resolve any
 * slot on a real entity; the fix is in the lookup, not in the Flattener.
 *
 * The overlay caches all 64x5 = 320 flat-prop indices on construction so
 * per-slot reads are direct EntityStore typed-array dereferences (one
 * scan on construction, zero on the hot path).
 *
 * Per ADR-004:
 *   - Live view, not snapshot — every getter re-reads the latest value.
 *   - Indices captured once, on construction.
 *   - `snapshot()` returns a frozen plain-object copy at call time.
 *   - Construction throws if the entity's ServerClass schema is missing
 *     any expected per-slot prop. The miss is a real schema mismatch (we
 *     pointed the overlay at the wrong class) and silent fallbacks would
 *     hide that bug; loud failure is the correct behavior.
 *   - Out-of-range slot lookups return 0 rather than throwing — callers
 *     iterate `0..MAX_PLAYER_SLOTS-1` and shouldn't have to bounds-check
 *     every read.
 */
import type { Entity } from "../entities/Entity.js";

/** CS:GO supports up to 64 player slots; PlayerResource arrays are sized to match. */
export const MAX_PLAYER_SLOTS = 64;

/**
 * Frozen point-in-time snapshot of the per-slot stat arrays. Returned by
 * {@link PlayerResource.snapshot}; safe to retain past the next tick.
 */
export interface PlayerResourceSnapshot {
  readonly kills: readonly number[];
  readonly deaths: readonly number[];
  readonly assists: readonly number[];
  readonly scores: readonly number[];
  readonly pings: readonly number[];
}

export class PlayerResource {
  private readonly entity: Entity;

  // Cached per-slot prop indices: e.g. killsIdx[5] = flatPropIdx for "m_iKills.005".
  private readonly killsIdx: readonly number[];
  private readonly deathsIdx: readonly number[];
  private readonly assistsIdx: readonly number[];
  private readonly scoresIdx: readonly number[];
  private readonly pingsIdx: readonly number[];

  constructor(entity: Entity) {
    this.entity = entity;

    // Resolve all 64 per-slot indices for one stat-table by scanning the
    // flat-prop list once. The disambiguator is the (sourceTableName,
    // varName) pair: each per-slot stat is its own SendTable in CSGO, so
    // every slot's varName is the bare zero-padded index `"000".."063"`
    // and the table name carries the stat identity. A bare-varName scan
    // would collide across stats (every stat-table emits the same
    // `"000".."063"` strings).
    const resolveSlots = (statTable: string): readonly number[] => {
      const arr: number[] = new Array<number>(MAX_PLAYER_SLOTS);
      const flatProps = entity.serverClass.flattenedProps;
      // Single linear pass: for each prop in the right table, slot the
      // padded varName into arr. Cheaper than 64 separate `findIndex`
      // calls and avoids the O(N*64) blow-up on the 3.5k-prop CSGO
      // CCSPlayerResource schema.
      const found = new Array<boolean>(MAX_PLAYER_SLOTS).fill(false);
      for (let i = 0; i < flatProps.length; i++) {
        const fp = flatProps[i]!;
        if (fp.sourceTableName !== statTable) continue;
        const varName = fp.prop.varName;
        // varName is zero-padded 3-digit ASCII ("000".."064"); parse and
        // gate to the slot range we care about. The CSGO schema also
        // emits a 65th `"064"` entry which we ignore — it's an unused
        // tail slot, not a real player.
        const slot = Number.parseInt(varName, 10);
        if (
          !Number.isFinite(slot) ||
          slot < 0 ||
          slot >= MAX_PLAYER_SLOTS
        ) {
          continue;
        }
        arr[slot] = i;
        found[slot] = true;
      }
      for (let slot = 0; slot < MAX_PLAYER_SLOTS; slot++) {
        if (!found[slot]) {
          const padded = slot.toString().padStart(3, "0");
          throw new Error(
            `PlayerResource overlay: prop "${statTable}.${padded}" ` +
              `(sourceTable: ${statTable}, varName: ${padded}) not in ` +
              `${entity.serverClass.className} schema`,
          );
        }
      }
      return Object.freeze(arr);
    };

    this.killsIdx = resolveSlots("m_iKills");
    this.deathsIdx = resolveSlots("m_iDeaths");
    this.assistsIdx = resolveSlots("m_iAssists");
    this.scoresIdx = resolveSlots("m_iScore");
    this.pingsIdx = resolveSlots("m_iPing");
  }

  private readSlot(idxArray: readonly number[], slot: number): number {
    if (slot < 0 || slot >= MAX_PLAYER_SLOTS) return 0;
    const v = this.entity.store.read(this.entity.storageSlot, idxArray[slot]!);
    return typeof v === "number" ? v : 0;
  }

  killsForSlot(slot: number): number {
    return this.readSlot(this.killsIdx, slot);
  }

  deathsForSlot(slot: number): number {
    return this.readSlot(this.deathsIdx, slot);
  }

  assistsForSlot(slot: number): number {
    return this.readSlot(this.assistsIdx, slot);
  }

  scoreForSlot(slot: number): number {
    return this.readSlot(this.scoresIdx, slot);
  }

  pingForSlot(slot: number): number {
    return this.readSlot(this.pingsIdx, slot);
  }

  /**
   * Resolve all five per-slot stat arrays at call time and return a frozen
   * plain object. Use when the consumer needs to retain the values past
   * the next tick (writing to disk, IPC, deferred processing).
   */
  snapshot(): PlayerResourceSnapshot {
    const collect = (read: (s: number) => number): readonly number[] => {
      const arr: number[] = new Array<number>(MAX_PLAYER_SLOTS);
      for (let s = 0; s < MAX_PLAYER_SLOTS; s++) arr[s] = read(s);
      return Object.freeze(arr);
    };
    return Object.freeze({
      kills: collect((s) => this.killsForSlot(s)),
      deaths: collect((s) => this.deathsForSlot(s)),
      assists: collect((s) => this.assistsForSlot(s)),
      scores: collect((s) => this.scoreForSlot(s)),
      pings: collect((s) => this.pingForSlot(s)),
    });
  }
}
