/**
 * EntityStore — per-ServerClass struct-of-arrays bundle for entity property
 * storage. Implements the layout decided in ADR-002 (2026-04-29 amendment)
 * and the architect's TASK-026 implementation brief.
 *
 * Design at a glance:
 *
 *   - Seven primitive-typed columns (int, float, vector, vectorxy, string,
 *     array, bigint), each sized to the class's prop count of that kind ×
 *     `capacity`. The vector column is interleaved (`x, y, z` per slot, slots
 *     concatenated); vectorxy is two-lane (`x, y`); the rest are one lane
 *     per (slot, prop).
 *   - A `(slot, prop)` `written` bitset disambiguates "never written" from
 *     `0`. A read for an unwritten prop returns `undefined`.
 *   - A per-slot `slotVersion` counter, bumped on free, gates the `Entity`
 *     view's stale-reference detection (see Entity.ts).
 *   - A small `freeList` of returned slots feeds slot reuse without growing
 *     `capacity` past peak occupancy.
 *
 * Sizing heuristics (per the architect's brief):
 *   - Classes whose name ends in `Proxy` start with capacity = 1 (always
 *     singleton: CCSGameRulesProxy, CCSTeamScoresProxy, etc.).
 *   - Everything else starts with capacity = 16 — large enough that 10
 *     CCSPlayers + a handful of weapons fit without growth in the typical
 *     case.
 * Capacity doubles on overflow. Down-sizing is never done; M7 may revisit.
 *
 * The store is intentionally not generic over PropertyValue — each typed
 * column has its own typed `set`/`get` to keep V8 monomorphic on the hot
 * path. The dispatch from `(propIndex) -> (kind, columnOffset)` is one
 * array index away (precomputed by `PropColumns.computePropColumns`).
 */
import type { ServerClass } from "../datatables/ServerClass.js";
import type { PropColumnLayout, PropColumn } from "./PropColumns.js";
import type { PropertyValue, Vector2, Vector3 } from "../properties/Property.js";

const INITIAL_CAPACITY_DEFAULT = 16;
const INITIAL_CAPACITY_PROXY = 1;

export class EntityStore {
  readonly serverClass: ServerClass;
  readonly layout: PropColumnLayout;
  readonly propCount: number;

  private capacity: number;

  // Typed columns. Sized lazily (initial capacity) and grown by doubling.
  private ints: Int32Array;
  private floats: Float32Array;
  /** Interleaved (x, y, z) per vector prop, slots concatenated. */
  private vectors: Float32Array;
  /** Interleaved (x, y) per vectorxy prop, slots concatenated. */
  private vectorXYs: Float32Array;
  private strings: (string | undefined)[];
  private arrays: (PropertyValue[] | undefined)[];
  private bigInts: BigInt64Array;

  /** Bit `slot` set ⇒ slot currently allocated to a live entity. */
  private occupied: Uint32Array;
  /** Bit `slot * propCount + propIdx` set ⇒ value has been written this lifetime. */
  private written: Uint32Array;
  /** Per-slot version counter, bumped on free; gates `Entity` view staleness. */
  private slotVersions: Uint32Array;

  /** Returned-to-pool slots; allocate() pops from here first. */
  private freeList: number[] = [];
  /** High-water mark of slots ever allocated (next fresh slot if freeList empty). */
  private nextSlot = 0;

  constructor(serverClass: ServerClass, layout: PropColumnLayout) {
    this.serverClass = serverClass;
    this.layout = layout;
    this.propCount = layout.columns.length;
    const initial = serverClass.className.endsWith("Proxy")
      ? INITIAL_CAPACITY_PROXY
      : INITIAL_CAPACITY_DEFAULT;
    this.capacity = initial;
    this.ints = new Int32Array(layout.numIntProps * initial);
    this.floats = new Float32Array(layout.numFloatProps * initial);
    this.vectors = new Float32Array(layout.numVectorProps * 3 * initial);
    this.vectorXYs = new Float32Array(layout.numVectorXYProps * 2 * initial);
    this.strings = new Array(layout.numStringProps * initial);
    this.arrays = new Array(layout.numArrayProps * initial);
    this.bigInts = new BigInt64Array(layout.numBigIntProps * initial);
    this.occupied = new Uint32Array((initial + 31) >>> 5);
    this.written = new Uint32Array(((initial * this.propCount) + 31) >>> 5);
    this.slotVersions = new Uint32Array(initial);
  }

  /** Allocate a fresh storage slot. Reuses freed slots first. */
  allocate(): number {
    let slot: number;
    if (this.freeList.length > 0) {
      slot = this.freeList.pop()!;
    } else {
      if (this.nextSlot >= this.capacity) {
        this.grow();
      }
      slot = this.nextSlot++;
    }
    // Mark occupied. `written` was cleared on free (or starts zero); typed
    // arrays may hold stale data, masked by the cleared `written` bits.
    const wIdx = slot >>> 5;
    const bIdx = slot & 31;
    this.occupied[wIdx] = (this.occupied[wIdx] ?? 0) | (1 << bIdx);
    return slot;
  }

  /**
   * Return a slot to the free list. Clears the row's `written` bits and
   * bumps the slot version counter (so any outstanding `Entity` view
   * pointing at this slot throws on next read).
   */
  free(slot: number): void {
    if (slot < 0 || slot >= this.nextSlot) return;
    const wIdx = slot >>> 5;
    const bIdx = slot & 31;
    if (((this.occupied[wIdx] ?? 0) & (1 << bIdx)) === 0) return; // already free
    this.occupied[wIdx] = (this.occupied[wIdx] ?? 0) & ~(1 << bIdx);
    this.clearSlotWritten(slot);
    // Wrap on overflow — 32-bit counter, ~4B free events before wrap.
    this.slotVersions[slot] = ((this.slotVersions[slot] ?? 0) + 1) >>> 0;
    this.freeList.push(slot);
  }

  /** Whether a slot is currently allocated. */
  isOccupied(slot: number): boolean {
    if (slot < 0 || slot >= this.capacity) return false;
    return (((this.occupied[slot >>> 5] ?? 0) >>> (slot & 31)) & 1) === 1;
  }

  /** Current version of a slot — captured by `Entity` views at construction. */
  getVersion(slot: number): number {
    return this.slotVersions[slot] ?? 0;
  }

  /**
   * Whether `(slot, propIdx)` has been written since the slot was last
   * allocated. Used by `read()` to disambiguate `0` from "never written".
   */
  isWritten(slot: number, propIdx: number): boolean {
    const bit = slot * this.propCount + propIdx;
    return (((this.written[bit >>> 5] ?? 0) >>> (bit & 31)) & 1) === 1;
  }

  /**
   * Generic write. Accepts any `PropertyValue` and routes to the right
   * typed-array column based on the precomputed `PropColumn`.
   *
   * The caller is responsible for ensuring `slot` is occupied — the entity
   * decoder always allocates before writing. We do not check, because the
   * hot-path overhead would dominate.
   */
  write(slot: number, propIdx: number, value: PropertyValue): void {
    const col = this.layout.columns[propIdx]!;
    this.writeTyped(slot, col, value);
    const bit = slot * this.propCount + propIdx;
    const wIdx = bit >>> 5;
    this.written[wIdx] = (this.written[wIdx] ?? 0) | (1 << (bit & 31));
  }

  /**
   * Generic read. Returns `undefined` for never-written props. The caller
   * is responsible for slot-occupancy checks — this is on the read path,
   * fast.
   */
  read(slot: number, propIdx: number): PropertyValue | undefined {
    if (!this.isWritten(slot, propIdx)) return undefined;
    const col = this.layout.columns[propIdx]!;
    return this.readTyped(slot, col);
  }

  // --- Typed-column dispatch ------------------------------------------------

  private writeTyped(slot: number, col: PropColumn, value: PropertyValue): void {
    switch (col.kind) {
      case "int":
        this.ints[slot * this.layout.numIntProps + col.offset] = value as number;
        return;
      case "float":
        this.floats[slot * this.layout.numFloatProps + col.offset] = value as number;
        return;
      case "vector": {
        const v = value as Vector3;
        const base = (slot * this.layout.numVectorProps + col.offset) * 3;
        this.vectors[base] = v.x;
        this.vectors[base + 1] = v.y;
        this.vectors[base + 2] = v.z;
        return;
      }
      case "vectorxy": {
        const v = value as Vector2;
        const base = (slot * this.layout.numVectorXYProps + col.offset) * 2;
        this.vectorXYs[base] = v.x;
        this.vectorXYs[base + 1] = v.y;
        return;
      }
      case "string":
        this.strings[slot * this.layout.numStringProps + col.offset] =
          value as string;
        return;
      case "array":
        this.arrays[slot * this.layout.numArrayProps + col.offset] =
          value as PropertyValue[];
        return;
      case "bigint":
        this.bigInts[slot * this.layout.numBigIntProps + col.offset] =
          value as bigint;
        return;
    }
  }

  private readTyped(slot: number, col: PropColumn): PropertyValue {
    switch (col.kind) {
      case "int":
        return this.ints[slot * this.layout.numIntProps + col.offset]!;
      case "float":
        return this.floats[slot * this.layout.numFloatProps + col.offset]!;
      case "vector": {
        const base = (slot * this.layout.numVectorProps + col.offset) * 3;
        return {
          x: this.vectors[base]!,
          y: this.vectors[base + 1]!,
          z: this.vectors[base + 2]!,
        } as Vector3;
      }
      case "vectorxy": {
        const base = (slot * this.layout.numVectorXYProps + col.offset) * 2;
        return {
          x: this.vectorXYs[base]!,
          y: this.vectorXYs[base + 1]!,
        } as Vector2;
      }
      case "string":
        return this.strings[slot * this.layout.numStringProps + col.offset]!;
      case "array":
        return this.arrays[slot * this.layout.numArrayProps + col.offset]!;
      case "bigint":
        return this.bigInts[
          slot * this.layout.numBigIntProps + col.offset
        ]!;
    }
  }

  // --- Capacity management --------------------------------------------------

  private grow(): void {
    const oldCap = this.capacity;
    const newCap = oldCap * 2;
    this.capacity = newCap;
    this.ints = grow(this.ints, this.layout.numIntProps * newCap);
    this.floats = growF32(this.floats, this.layout.numFloatProps * newCap);
    this.vectors = growF32(
      this.vectors,
      this.layout.numVectorProps * 3 * newCap,
    );
    this.vectorXYs = growF32(
      this.vectorXYs,
      this.layout.numVectorXYProps * 2 * newCap,
    );
    // Plain arrays — extend length; old entries preserved.
    this.strings.length = this.layout.numStringProps * newCap;
    this.arrays.length = this.layout.numArrayProps * newCap;
    this.bigInts = growI64(
      this.bigInts,
      this.layout.numBigIntProps * newCap,
    );
    this.occupied = growU32(this.occupied, (newCap + 31) >>> 5);
    this.written = growU32(this.written, (newCap * this.propCount + 31) >>> 5);
    this.slotVersions = growU32(this.slotVersions, newCap);
  }

  /** Clear the `written` bits for one slot — its row in the bitset. */
  private clearSlotWritten(slot: number): void {
    const start = slot * this.propCount;
    const end = start + this.propCount;
    // Two partial-word ends, full-word middle. Cheap; ~218 bytes for CCSPlayer.
    const startWord = start >>> 5;
    const endWord = end >>> 5;
    const startBit = start & 31;
    const endBit = end & 31;
    if (startWord === endWord) {
      const mask = ((1 << (endBit - startBit)) - 1) << startBit;
      this.written[startWord] = (this.written[startWord] ?? 0) & ~mask;
      return;
    }
    if (startBit !== 0) {
      const mask = ~0 << startBit;
      this.written[startWord] = (this.written[startWord] ?? 0) & ~mask;
    } else {
      this.written[startWord] = 0;
    }
    for (let w = startWord + 1; w < endWord; w++) {
      this.written[w] = 0;
    }
    if (endBit !== 0) {
      const mask = (1 << endBit) - 1;
      this.written[endWord] = (this.written[endWord] ?? 0) & ~mask;
    }
  }
}

// --- Typed-array growth helpers (allocate new, copy old, return) ----------

function grow(src: Int32Array, newLen: number): Int32Array {
  const out = new Int32Array(newLen);
  out.set(src);
  return out;
}

function growF32(src: Float32Array, newLen: number): Float32Array {
  const out = new Float32Array(newLen);
  out.set(src);
  return out;
}

function growU32(src: Uint32Array, newLen: number): Uint32Array {
  const out = new Uint32Array(newLen);
  out.set(src);
  return out;
}

function growI64(src: BigInt64Array, newLen: number): BigInt64Array {
  const out = new BigInt64Array(newLen);
  out.set(src);
  return out;
}
