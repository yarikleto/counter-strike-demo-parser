/**
 * Unit tests for StringTableManager — registration, lookup, replacement.
 */
import { describe, it, expect } from "vitest";
import { StringTable } from "../../../src/stringtables/StringTable.js";
import { StringTableManager } from "../../../src/stringtables/StringTableManager.js";

function makeTable(name: string): StringTable {
  return new StringTable({
    name,
    maxEntries: 64,
    userDataFixedSize: false,
    userDataSize: 0,
    userDataSizeBits: 0,
    flags: 0,
  });
}

describe("StringTableManager.register", () => {
  it("assigns ids in insertion order starting from 0", () => {
    const mgr = new StringTableManager();
    expect(mgr.register(makeTable("a"))).toBe(0);
    expect(mgr.register(makeTable("b"))).toBe(1);
    expect(mgr.register(makeTable("c"))).toBe(2);
  });

  it("throws on duplicate name", () => {
    const mgr = new StringTableManager();
    mgr.register(makeTable("a"));
    expect(() => mgr.register(makeTable("a"))).toThrow(/duplicate/);
  });
});

describe("StringTableManager lookups", () => {
  it("getByName returns the registered table", () => {
    const mgr = new StringTableManager();
    const t = makeTable("userinfo");
    mgr.register(t);
    expect(mgr.getByName("userinfo")).toBe(t);
    expect(mgr.getByName("instancebaseline")).toBeUndefined();
  });

  it("getById returns the table at the given wire id", () => {
    const mgr = new StringTableManager();
    const t0 = makeTable("a");
    const t1 = makeTable("b");
    mgr.register(t0);
    mgr.register(t1);
    expect(mgr.getById(0)).toBe(t0);
    expect(mgr.getById(1)).toBe(t1);
    expect(mgr.getById(2)).toBeUndefined();
    expect(mgr.getById(-1)).toBeUndefined();
  });

  it("all() returns every table in id order", () => {
    const mgr = new StringTableManager();
    const a = makeTable("a");
    const b = makeTable("b");
    mgr.register(a);
    mgr.register(b);
    expect(mgr.all()).toEqual([a, b]);
  });
});

describe("StringTableManager.replaceTable", () => {
  it("preserves the id slot when replacing", () => {
    const mgr = new StringTableManager();
    const a = makeTable("a");
    const b = makeTable("b");
    mgr.register(a);
    mgr.register(b);
    const aReplacement = makeTable("a");
    mgr.replaceTable(aReplacement);
    expect(mgr.getByName("a")).toBe(aReplacement);
    expect(mgr.getById(0)).toBe(aReplacement);
    expect(mgr.getById(1)).toBe(b);
  });

  it("throws when replacing an unknown table", () => {
    const mgr = new StringTableManager();
    expect(() => mgr.replaceTable(makeTable("nope"))).toThrow(/unknown/);
  });
});

describe("StringTable entry storage", () => {
  it("setEntry stores by index and key", () => {
    const t = makeTable("t");
    t.setEntry(3, "hello");
    expect(t.getByIndex(3)?.key).toBe("hello");
    expect(t.getByName("hello")?.key).toBe("hello");
    expect(t.size).toBe(1);
  });

  it("setEntry rebinds the key index when the entry's key changes", () => {
    const t = makeTable("t");
    t.setEntry(0, "first");
    t.setEntry(0, "second");
    expect(t.getByName("first")).toBeUndefined();
    expect(t.getByName("second")?.key).toBe("second");
  });

  it("setEntry rejects out-of-range indices", () => {
    const t = makeTable("t");
    expect(() => t.setEntry(64, "x")).toThrow(/out of range/);
    expect(() => t.setEntry(-1, "x")).toThrow(/out of range/);
  });

  it("entries() iterator skips holes", () => {
    const t = makeTable("t");
    t.setEntry(2, "two");
    t.setEntry(5, "five");
    expect([...t.entries()].map((e) => e.key)).toEqual(["two", "five"]);
  });
});
