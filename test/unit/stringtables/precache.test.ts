/**
 * Unit tests for {@link PrecacheTable} — the read-only convenience wrapper
 * over `modelprecache` / `soundprecache` / `downloadables` string tables.
 *
 * Covers:
 *   - Empty / missing manager: lookups return `undefined`, `all()` is a
 *     frozen empty array, `size === 0`.
 *   - Populated table: index lookup returns the registered path; out-of-
 *     range index returns `undefined`.
 *   - Liveness: entries appended to the underlying StringTable AFTER the
 *     wrapper is constructed are visible on subsequent reads — no need to
 *     reinstantiate the wrapper per tick.
 *   - Construction is generic across all three table names.
 */
import { describe, it, expect } from "vitest";
import { StringTable } from "../../../src/stringtables/StringTable.js";
import { StringTableManager } from "../../../src/stringtables/StringTableManager.js";
import { PrecacheTable } from "../../../src/stringtables/precache.js";

function makePrecacheTable(name: string, maxEntries = 1024): StringTable {
  return new StringTable({
    name,
    maxEntries,
    userDataFixedSize: false,
    userDataSize: 0,
    userDataSizeBits: 0,
    flags: 0,
  });
}

describe("PrecacheTable — empty / missing manager", () => {
  it("returns undefined / 0 / [] when manager is undefined", () => {
    const wrapper = new PrecacheTable(undefined, "modelprecache");
    expect(wrapper.get(0)).toBeUndefined();
    expect(wrapper.size).toBe(0);
    const all = wrapper.all();
    expect(all).toEqual([]);
    expect(Object.isFrozen(all)).toBe(true);
  });

  it("returns undefined / 0 / [] when the named table doesn't exist on the manager", () => {
    const mgr = new StringTableManager();
    // Register an unrelated table — the wrapper points at a different name.
    mgr.register(makePrecacheTable("userinfo"));
    const wrapper = new PrecacheTable(mgr, "modelprecache");
    expect(wrapper.get(0)).toBeUndefined();
    expect(wrapper.size).toBe(0);
    expect(wrapper.all()).toEqual([]);
  });
});

describe("PrecacheTable — populated table", () => {
  it("get(i) returns the registered file path for modelprecache", () => {
    const mgr = new StringTableManager();
    const table = makePrecacheTable("modelprecache");
    table.setEntry(0, "models/player/ct_fbi.mdl");
    table.setEntry(1, "models/player/t_phoenix.mdl");
    table.setEntry(2, "models/weapons/w_rif_ak47.mdl");
    mgr.register(table);

    const wrapper = new PrecacheTable(mgr, "modelprecache");
    expect(wrapper.get(0)).toBe("models/player/ct_fbi.mdl");
    expect(wrapper.get(1)).toBe("models/player/t_phoenix.mdl");
    expect(wrapper.get(2)).toBe("models/weapons/w_rif_ak47.mdl");
    expect(wrapper.size).toBe(3);
  });

  it("get(i) returns undefined for out-of-range or unpopulated indices", () => {
    const mgr = new StringTableManager();
    const table = makePrecacheTable("modelprecache");
    table.setEntry(0, "models/foo.mdl");
    mgr.register(table);

    const wrapper = new PrecacheTable(mgr, "modelprecache");
    expect(wrapper.get(1)).toBeUndefined();
    expect(wrapper.get(99999)).toBeUndefined();
    expect(wrapper.get(-1)).toBeUndefined();
  });

  it("all() returns a frozen snapshot indexed identically to get()", () => {
    const mgr = new StringTableManager();
    const table = makePrecacheTable("modelprecache");
    table.setEntry(0, "models/a.mdl");
    table.setEntry(1, "models/b.mdl");
    mgr.register(table);

    const wrapper = new PrecacheTable(mgr, "modelprecache");
    const all = wrapper.all();
    expect(all).toEqual(["models/a.mdl", "models/b.mdl"]);
    expect(all[0]).toBe(wrapper.get(0));
    expect(all[1]).toBe(wrapper.get(1));
    expect(Object.isFrozen(all)).toBe(true);
  });
});

describe("PrecacheTable — liveness", () => {
  it("sees entries appended to the underlying table after construction", () => {
    const mgr = new StringTableManager();
    const table = makePrecacheTable("modelprecache");
    mgr.register(table);

    const wrapper = new PrecacheTable(mgr, "modelprecache");
    expect(wrapper.size).toBe(0);
    expect(wrapper.get(0)).toBeUndefined();

    // Mutate the underlying table AFTER the wrapper exists.
    table.setEntry(0, "models/late_arrival.mdl");
    expect(wrapper.size).toBe(1);
    expect(wrapper.get(0)).toBe("models/late_arrival.mdl");

    table.setEntry(1, "models/even_later.mdl");
    expect(wrapper.size).toBe(2);
    expect(wrapper.get(1)).toBe("models/even_later.mdl");
  });

  it("sees the table appearing on the manager AFTER wrapper construction", () => {
    const mgr = new StringTableManager();
    // Wrapper is created BEFORE the named table is registered.
    const wrapper = new PrecacheTable(mgr, "modelprecache");
    expect(wrapper.size).toBe(0);

    const table = makePrecacheTable("modelprecache");
    table.setEntry(0, "models/registered_late.mdl");
    mgr.register(table);

    expect(wrapper.size).toBe(1);
    expect(wrapper.get(0)).toBe("models/registered_late.mdl");
  });
});

describe("PrecacheTable — generic across table names", () => {
  it("constructs and reads soundprecache the same way", () => {
    const mgr = new StringTableManager();
    const table = makePrecacheTable("soundprecache");
    table.setEntry(0, "sound/weapons/ak47/ak47-1.wav");
    mgr.register(table);

    const wrapper = new PrecacheTable(mgr, "soundprecache");
    expect(wrapper.size).toBe(1);
    expect(wrapper.get(0)).toBe("sound/weapons/ak47/ak47-1.wav");
  });

  it("constructs and reads downloadables the same way", () => {
    const mgr = new StringTableManager();
    const table = makePrecacheTable("downloadables");
    table.setEntry(0, "materials/sprays/custom_clan.vtf");
    table.setEntry(1, "maps/de_custom.bsp");
    mgr.register(table);

    const wrapper = new PrecacheTable(mgr, "downloadables");
    expect(wrapper.size).toBe(2);
    expect(wrapper.get(0)).toBe("materials/sprays/custom_clan.vtf");
    expect(wrapper.get(1)).toBe("maps/de_custom.bsp");
    expect(wrapper.all()).toEqual([
      "materials/sprays/custom_clan.vtf",
      "maps/de_custom.bsp",
    ]);
  });
});
