/**
 * Unit tests for the string-table entry parser.
 *
 * Bit-stream wire format is documented in `StringTableParser.ts`. These
 * tests build small payloads by hand using a `BitWriter` helper that
 * mirrors `BitReader`'s LSB-first-within-byte layout, then assert the
 * decoded entries and bit cursor.
 */
import { describe, it, expect } from "vitest";
import { BitReader } from "../../../src/reader/BitReader.js";
import { StringTable } from "../../../src/stringtables/StringTable.js";
import {
  bitsForMaxEntries,
  parseStringTableEntries,
} from "../../../src/stringtables/StringTableParser.js";

/**
 * Minimal bit-writer for tests — pushes bits LSB-first within each byte,
 * matching what BitReader expects to consume.
 */
class BitWriter {
  private bytes: number[] = [];
  private bitCursor = 0;

  writeBit(bit: 0 | 1): void {
    this.writeBits(bit, 1);
  }

  writeBits(value: number, n: number): void {
    if (n === 0) return;
    let remaining = n;
    let v = value >>> 0;
    while (remaining > 0) {
      const byteIndex = this.bitCursor >>> 3;
      const bitIndex = this.bitCursor & 7;
      const bitsAvailable = 8 - bitIndex;
      const take = Math.min(bitsAvailable, remaining);
      while (this.bytes.length <= byteIndex) this.bytes.push(0);
      const mask = (1 << take) - 1;
      const chunk = v & mask;
      this.bytes[byteIndex] |= chunk << bitIndex;
      v >>>= take;
      this.bitCursor += take;
      remaining -= take;
    }
  }

  writeNullTerminatedString(s: string): void {
    for (let i = 0; i < s.length; i++) {
      this.writeBits(s.charCodeAt(i), 8);
    }
    this.writeBits(0, 8);
  }

  writeBytes(bytes: Uint8Array): void {
    for (const b of bytes) this.writeBits(b, 8);
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

function makeTable(opts: Partial<{
  name: string;
  maxEntries: number;
  userDataFixedSize: boolean;
  userDataSize: number;
  userDataSizeBits: number;
  flags: number;
}> = {}): StringTable {
  return new StringTable({
    name: opts.name ?? "test",
    maxEntries: opts.maxEntries ?? 64,
    userDataFixedSize: opts.userDataFixedSize ?? false,
    userDataSize: opts.userDataSize ?? 0,
    userDataSizeBits: opts.userDataSizeBits ?? 0,
    flags: opts.flags ?? 0,
  });
}

describe("bitsForMaxEntries", () => {
  it("returns ceil(log2(N)) for power-of-two table sizes", () => {
    expect(bitsForMaxEntries(64)).toBe(6);
    expect(bitsForMaxEntries(2048)).toBe(11);
    expect(bitsForMaxEntries(1024)).toBe(10);
  });

  it("returns 0 for trivial table sizes", () => {
    expect(bitsForMaxEntries(1)).toBe(0);
    expect(bitsForMaxEntries(0)).toBe(0);
  });
});

describe("parseStringTableEntries — empty", () => {
  it("returns no changes when numEntries is 0", () => {
    const writer = new BitWriter();
    // No bits written.
    const reader = new BitReader(writer.toUint8Array());
    const table = makeTable();
    const result = parseStringTableEntries(reader, table, 0);
    expect(result.changedEntries).toEqual([]);
    expect(table.size).toBe(0);
  });
});

describe("parseStringTableEntries — single direct-mode entry", () => {
  it("reads index, string, and no-userdata flag", () => {
    const writer = new BitWriter();
    // Index encoding: 0 -> read entryBits as absolute index. maxEntries=64 -> 6 bits.
    writer.writeBit(0);
    writer.writeBits(5, 6); // index = 5
    // Has-string: 1
    writer.writeBit(1);
    // No history: 0 -> direct mode
    writer.writeBit(0);
    writer.writeNullTerminatedString("hello");
    // No userdata
    writer.writeBit(0);

    const reader = new BitReader(writer.toUint8Array());
    const table = makeTable({ maxEntries: 64 });
    const result = parseStringTableEntries(reader, table, 1);

    expect(result.changedEntries).toHaveLength(1);
    expect(table.getByIndex(5)?.key).toBe("hello");
    expect(table.getByIndex(5)?.userData).toBeUndefined();
    expect(table.getByName("hello")).toBeDefined();
  });

  it("uses sequential index when index-bit is 1 (previous + 1)", () => {
    const writer = new BitWriter();
    // First entry: absolute index 3
    writer.writeBit(0);
    writer.writeBits(3, 6);
    writer.writeBit(1); // has-string
    writer.writeBit(0); // direct
    writer.writeNullTerminatedString("a");
    writer.writeBit(0); // no userdata
    // Second entry: sequential -> previous+1 = 4
    writer.writeBit(1); // sequential
    writer.writeBit(1); // has-string
    writer.writeBit(0); // direct
    writer.writeNullTerminatedString("b");
    writer.writeBit(0); // no userdata

    const reader = new BitReader(writer.toUint8Array());
    const table = makeTable({ maxEntries: 64 });
    parseStringTableEntries(reader, table, 2);
    expect(table.getByIndex(3)?.key).toBe("a");
    expect(table.getByIndex(4)?.key).toBe("b");
  });
});

describe("parseStringTableEntries — history-prefix mode", () => {
  it("composes prefix from prior history entry plus suffix", () => {
    const writer = new BitWriter();
    // Entry 0: absolute index 0, direct "model_player_terror"
    writer.writeBit(0); // absolute index
    writer.writeBits(0, 6);
    writer.writeBit(1); // has-string
    writer.writeBit(0); // direct
    writer.writeNullTerminatedString("model_player_terror");
    writer.writeBit(0); // no userdata

    // Entry 1: sequential index, history-prefix mode, copy 13 bytes
    // ("model_player_") from history slot 0, then append suffix "ct".
    writer.writeBit(1); // sequential
    writer.writeBit(1); // has-string
    writer.writeBit(1); // history mode
    writer.writeBits(0, 5); // historyIndex = 0
    writer.writeBits(13, 5); // bytesToCopy = 13
    writer.writeNullTerminatedString("ct");
    writer.writeBit(0); // no userdata

    const reader = new BitReader(writer.toUint8Array());
    const table = makeTable({ maxEntries: 64 });
    parseStringTableEntries(reader, table, 2);
    expect(table.getByIndex(0)?.key).toBe("model_player_terror");
    expect(table.getByIndex(1)?.key).toBe("model_player_ct");
  });
});

describe("parseStringTableEntries — fixed-size user data", () => {
  it("reads exactly userDataSizeBits bits into the entry", () => {
    const writer = new BitWriter();
    writer.writeBit(1); // sequential index (-1+1=0)
    writer.writeBit(1); // has-string
    writer.writeBit(0); // direct
    writer.writeNullTerminatedString("k");
    writer.writeBit(1); // has-userdata
    // Fixed size: 16 bits = 2 bytes.
    writer.writeBits(0xab, 8);
    writer.writeBits(0xcd, 8);

    const reader = new BitReader(writer.toUint8Array());
    const table = makeTable({
      maxEntries: 64,
      userDataFixedSize: true,
      userDataSize: 2,
      userDataSizeBits: 16,
    });
    parseStringTableEntries(reader, table, 1);
    const entry = table.getByIndex(0);
    expect(entry?.userData).toEqual(new Uint8Array([0xab, 0xcd]));
  });
});

describe("parseStringTableEntries — variable-size user data", () => {
  it("reads 14-bit length then that many bytes", () => {
    const writer = new BitWriter();
    writer.writeBit(1); // sequential index = 0
    writer.writeBit(1); // has-string
    writer.writeBit(0); // direct
    writer.writeNullTerminatedString("k");
    writer.writeBit(1); // has-userdata
    writer.writeBits(3, 14); // 3 bytes
    writer.writeBytes(new Uint8Array([1, 2, 3]));

    const reader = new BitReader(writer.toUint8Array());
    const table = makeTable({ maxEntries: 64 });
    parseStringTableEntries(reader, table, 1);
    expect(table.getByIndex(0)?.userData).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("parseStringTableEntries — string carry-over on update", () => {
  it("preserves the prior key when the has-string bit is 0", () => {
    const writer1 = new BitWriter();
    writer1.writeBit(0); // absolute index
    writer1.writeBits(0, 6);
    writer1.writeBit(1); // has-string
    writer1.writeBit(0); // direct
    writer1.writeNullTerminatedString("original");
    writer1.writeBit(0); // no userdata
    const reader1 = new BitReader(writer1.toUint8Array());
    const table = makeTable({ maxEntries: 64 });
    const history: string[] = [];
    parseStringTableEntries(reader1, table, 1, history);

    // Update: hit the same index without sending a string, but with new
    // userdata.
    const writer2 = new BitWriter();
    writer2.writeBit(0); // absolute index
    writer2.writeBits(0, 6);
    writer2.writeBit(0); // no string this time
    writer2.writeBit(1); // has-userdata
    writer2.writeBits(2, 14);
    writer2.writeBytes(new Uint8Array([0xaa, 0xbb]));
    const reader2 = new BitReader(writer2.toUint8Array());
    parseStringTableEntries(reader2, table, 1, history);

    const entry = table.getByIndex(0);
    expect(entry?.key).toBe("original");
    expect(entry?.userData).toEqual(new Uint8Array([0xaa, 0xbb]));
  });

  it("threads the history ring across two parser invocations", () => {
    // Models the CreateStringTable -> UpdateStringTable hand-off where the
    // second call's history-prefix references must resolve against entries
    // pushed during the first call.
    const w1 = new BitWriter();
    w1.writeBit(0); // absolute index
    w1.writeBits(0, 6);
    w1.writeBit(1); // has-string
    w1.writeBit(0); // direct
    w1.writeNullTerminatedString("model_player_terror");
    w1.writeBit(0); // no userdata
    const r1 = new BitReader(w1.toUint8Array());
    const table = makeTable({ maxEntries: 64 });
    const history: string[] = [];
    parseStringTableEntries(r1, table, 1, history);

    const w2 = new BitWriter();
    w2.writeBit(0); // absolute index
    w2.writeBits(1, 6);
    w2.writeBit(1); // has-string
    w2.writeBit(1); // history mode
    w2.writeBits(0, 5); // historyIndex 0 -> "model_player_terror"
    w2.writeBits(13, 5); // bytesToCopy = 13 -> "model_player_"
    w2.writeNullTerminatedString("ct");
    w2.writeBit(0); // no userdata
    const r2 = new BitReader(w2.toUint8Array());
    parseStringTableEntries(r2, table, 1, history);

    expect(table.getByIndex(1)?.key).toBe("model_player_ct");
  });
});
