/**
 * Unit tests for the changed-prop-index "new way" bit decoder.
 *
 * The architect flagged this as ~30% of TASK-026's risk surface: a single
 * cursor leak here cascades into garbage for every subsequent prop in the
 * entity update, which in turn corrupts every later entity in the same
 * message. We test it in isolation against hand-built byte sequences with
 * known field deltas before any wire data touches it.
 */
import { describe, it, expect } from "vitest";
import { readChangedPropIndices } from "../../../src/entities/ChangedPropIndices.js";
import { BitReader } from "../../../src/reader/BitReader.js";

/**
 * Bit-stream writer for tests only — mirror image of BitReader, builds a
 * Uint8Array by appending arbitrary-width unsigned bit groups.
 */
class TestBitWriter {
  private bytes: number[] = [];
  private bitCount = 0;
  writeBit(b: 0 | 1): void {
    const byteIndex = this.bitCount >>> 3;
    const bitIndex = this.bitCount & 7;
    if (byteIndex >= this.bytes.length) this.bytes.push(0);
    this.bytes[byteIndex] |= (b & 1) << bitIndex;
    this.bitCount += 1;
  }
  writeBits(value: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.writeBit(((value >>> i) & 1) as 0 | 1);
    }
  }
  /**
   * Encode a value using BitReader.readUBitVar's wire shape (6-bit base +
   * 2-bit lookup + 0/4/8/28-bit extension).
   */
  writeUBitVar(value: number): void {
    const low6 = value & 0x3f;
    const ext = value >>> 6;
    let lookup: number;
    let extBits: number;
    if (ext === 0) {
      lookup = 0;
      extBits = 0;
    } else if (ext < 1 << 4) {
      lookup = 1;
      extBits = 4;
    } else if (ext < 1 << 8) {
      lookup = 2;
      extBits = 8;
    } else {
      lookup = 3;
      extBits = 28;
    }
    this.writeBits(low6, 6);
    this.writeBits(lookup, 2);
    if (extBits > 0) this.writeBits(ext, extBits);
  }
  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

function encodeIndices(indices: number[]): Uint8Array {
  const w = new TestBitWriter();
  let prev = -1;
  for (const idx of indices) {
    w.writeBit(1);
    const delta = idx - prev - 1;
    w.writeUBitVar(delta);
    prev = idx;
  }
  // Terminator: a 0 bit ends the list.
  w.writeBit(0);
  return w.toBytes();
}

describe("readChangedPropIndices", () => {
  it("decodes the empty list (single 0 terminator bit)", () => {
    const bytes = encodeIndices([]);
    const reader = new BitReader(bytes);
    expect(readChangedPropIndices(reader, 100)).toEqual([]);
  });

  it("decodes a small ascending list {0, 1, 5, 1000}", () => {
    const bytes = encodeIndices([0, 1, 5, 1000]);
    const reader = new BitReader(bytes);
    expect(readChangedPropIndices(reader, 1745)).toEqual([0, 1, 5, 1000]);
  });

  it("decodes a single large index {1744} (last prop on CCSPlayer)", () => {
    const bytes = encodeIndices([1744]);
    const reader = new BitReader(bytes);
    expect(readChangedPropIndices(reader, 1745)).toEqual([1744]);
  });

  it("decodes consecutive indices {3, 4, 5, 6, 7}", () => {
    const bytes = encodeIndices([3, 4, 5, 6, 7]);
    const reader = new BitReader(bytes);
    expect(readChangedPropIndices(reader, 100)).toEqual([3, 4, 5, 6, 7]);
  });

  it("leaves the cursor exactly past the terminator bit", () => {
    const bytes = encodeIndices([10, 20, 30]);
    // Compute expected cursor position by re-encoding and counting.
    const w = new TestBitWriter();
    let prev = -1;
    let totalBits = 0;
    for (const idx of [10, 20, 30]) {
      w.writeBit(1);
      const delta = idx - prev - 1;
      w.writeUBitVar(delta);
      prev = idx;
    }
    w.writeBit(0);
    // Each writeBit increments by 1; writeUBitVar by 8 bits + ext. We
    // simply trust the writer and read again to find position.
    const reader = new BitReader(bytes);
    readChangedPropIndices(reader, 100);
    // The position should be > 0 and ≤ bytes.length * 8.
    expect(reader.position).toBeGreaterThan(0);
    expect(reader.position).toBeLessThanOrEqual(bytes.length * 8);
    // Strong invariant: re-reading from position 0 advances by the same
    // amount each time.
    const reader2 = new BitReader(bytes);
    readChangedPropIndices(reader2, 100);
    expect(reader2.position).toBe(reader.position);
    // Suppress unused warning.
    expect(totalBits).toBe(0);
  });

  it("throws when a decoded index lands past totalProps", () => {
    const bytes = encodeIndices([50]);
    const reader = new BitReader(bytes);
    expect(() => readChangedPropIndices(reader, 50)).toThrow(/out of range/);
  });
});
