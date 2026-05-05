/**
 * Unit tests for `parseStringTableSnapshot` — the byte-aligned decoder for
 * `dem_stringtables` snapshot frames (TASK-058). Builds synthetic Buffers
 * matching the documented wire format and asserts the decoded structure.
 */
import { describe, it, expect } from "vitest";
import { parseStringTableSnapshot } from "../../../src/stringtables/SnapshotParser.js";

/** Helper: encode a null-terminated ASCII string. */
function nts(s: string): Buffer {
  return Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0x00])]);
}

/** Helper: encode an unsigned 16-bit little-endian integer. */
function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

/** Helper: encode a single entry — key + u16 dataLength + data bytes. */
function entry(key: string, data: Buffer): Buffer {
  return Buffer.concat([nts(key), u16(data.length), data]);
}

describe("parseStringTableSnapshot — single table without client entries", () => {
  it("decodes one table with two entries, including a zero-length data blob", () => {
    const buf = Buffer.concat([
      Buffer.from([1]), // numTables = 1
      nts("downloadables"), // tableName
      u16(2), // numEntries = 2
      entry("alpha", Buffer.from([0xde, 0xad, 0xbe, 0xef])),
      entry("beta", Buffer.alloc(0)),
      Buffer.from([0]), // hasClientEntries = false
    ]);

    const decoded = parseStringTableSnapshot(buf);
    expect(decoded.tables).toHaveLength(1);

    const t = decoded.tables[0];
    expect(t.name).toBe("downloadables");
    expect(t.entries).toHaveLength(2);
    expect(t.entries[0].key).toBe("alpha");
    expect(Array.from(t.entries[0].data)).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(t.entries[1].key).toBe("beta");
    expect(t.entries[1].data.byteLength).toBe(0);
    expect(t.clientEntries).toHaveLength(0);
  });

  it("returns an empty tables array on numTables = 0", () => {
    const buf = Buffer.from([0]);
    expect(parseStringTableSnapshot(buf).tables).toHaveLength(0);
  });
});

describe("parseStringTableSnapshot — table WITH client entries", () => {
  it("decodes the trailing client-entries block in addition to the regular entries", () => {
    const buf = Buffer.concat([
      Buffer.from([1]), // numTables = 1
      nts("userinfo"),
      u16(1), // numEntries = 1
      entry("0", Buffer.from([0x01, 0x02, 0x03])),
      Buffer.from([1]), // hasClientEntries = true
      u16(2), // numClientEntries = 2
      entry("client_a", Buffer.from([0xaa])),
      entry("client_b", Buffer.alloc(0)),
    ]);

    const decoded = parseStringTableSnapshot(buf);
    expect(decoded.tables).toHaveLength(1);

    const t = decoded.tables[0];
    expect(t.name).toBe("userinfo");
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0].key).toBe("0");
    expect(Array.from(t.entries[0].data)).toEqual([0x01, 0x02, 0x03]);
    expect(t.clientEntries).toHaveLength(2);
    expect(t.clientEntries[0].key).toBe("client_a");
    expect(Array.from(t.clientEntries[0].data)).toEqual([0xaa]);
    expect(t.clientEntries[1].key).toBe("client_b");
    expect(t.clientEntries[1].data.byteLength).toBe(0);
  });

  it("decodes multiple tables in sequence with mixed client-entries flags", () => {
    const buf = Buffer.concat([
      Buffer.from([2]), // numTables = 2
      // Table 0: no client entries
      nts("modelprecache"),
      u16(1),
      entry("models/foo.mdl", Buffer.alloc(0)),
      Buffer.from([0]),
      // Table 1: with client entries
      nts("userinfo"),
      u16(0),
      Buffer.from([1]),
      u16(1),
      entry("BOT-1", Buffer.from([0x42])),
    ]);

    const decoded = parseStringTableSnapshot(buf);
    expect(decoded.tables.map((t) => t.name)).toEqual(["modelprecache", "userinfo"]);
    expect(decoded.tables[0].entries[0].key).toBe("models/foo.mdl");
    expect(decoded.tables[0].clientEntries).toHaveLength(0);
    expect(decoded.tables[1].entries).toHaveLength(0);
    expect(decoded.tables[1].clientEntries).toHaveLength(1);
    expect(decoded.tables[1].clientEntries[0].key).toBe("BOT-1");
    expect(Array.from(decoded.tables[1].clientEntries[0].data)).toEqual([0x42]);
  });
});

describe("parseStringTableSnapshot — entry data isolation", () => {
  it("returns Uint8Array slices that do NOT alias the source buffer", () => {
    const data = Buffer.from([0x11, 0x22]);
    const buf = Buffer.concat([
      Buffer.from([1]),
      nts("t"),
      u16(1),
      entry("k", data),
      Buffer.from([0]),
    ]);
    const decoded = parseStringTableSnapshot(buf);
    const blob = decoded.tables[0].entries[0].data;
    expect(Array.from(blob)).toEqual([0x11, 0x22]);
    // Mutating the source buffer must not corrupt the decoded payload — the
    // decoder copies into a standalone Uint8Array on read.
    buf.fill(0);
    expect(Array.from(blob)).toEqual([0x11, 0x22]);
  });
});
