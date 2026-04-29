import { describe, it, expect } from "vitest";
import { Weapon } from "../../../src/state/Weapon.js";
import type { Entity } from "../../../src/entities/Entity.js";

/**
 * Tests build a hand-rolled fake `Entity` exposing only the surface the
 * overlay touches: `serverClass.className`, `serverClass.flattenedProps`
 * (varName-only), `store.read(slot, idx)`, and `storageSlot`. This keeps
 * the suite independent of `EntityStore`/`PropColumns`/SendTable wiring,
 * which would otherwise force an end-to-end fixture for what is logically
 * a tiny projection class.
 */

const WEAPON_PROPS = [
  "m_hOwnerEntity",
  "m_iClip1",
  "m_iClip2",
  "m_iPrimaryReserveAmmoCount",
  "m_iItemDefinitionIndex",
] as const;

interface FakeStoreOpts {
  values: Record<string, unknown>; // varName -> value
  index: Map<string, number>;
}

function fakeEntity(
  className: string,
  varNames: readonly string[],
  values: Record<string, unknown>,
): Entity {
  // Mirror the real `flattenedProps` shape closely enough that the overlay
  // can call `.findIndex(p => p.prop.varName === name)`.
  const flattenedProps = varNames.map((vn) => ({ prop: { varName: vn } }));
  const index = new Map<string, number>();
  varNames.forEach((vn, i) => index.set(vn, i));

  const store = {
    read: (_slot: number, idx: number): unknown => {
      const name = varNames[idx];
      if (name === undefined) return undefined;
      return values[name];
    },
  };

  return {
    serverClass: { className, flattenedProps },
    store,
    storageSlot: 0,
  } as unknown as Entity;
}

function ak47Entity(values: Partial<Record<string, number>> = {}): Entity {
  return fakeEntity("CAK47", WEAPON_PROPS, {
    m_hOwnerEntity: values.m_hOwnerEntity ?? 0,
    m_iClip1: values.m_iClip1 ?? 0,
    m_iClip2: values.m_iClip2 ?? 0,
    m_iPrimaryReserveAmmoCount: values.m_iPrimaryReserveAmmoCount ?? 0,
    "m_iItemDefinitionIndex":
      values["m_iItemDefinitionIndex"] ?? 0,
  });
}

describe("Weapon constructor", () => {
  it("resolves all five flat-prop indices without throwing on a complete schema", () => {
    const e = ak47Entity();
    expect(() => new Weapon(e)).not.toThrow();
  });

  it("throws a clear error naming the missing prop AND the className when m_iClip1 is absent", () => {
    const e = fakeEntity(
      "CAK47",
      ["m_hOwnerEntity", "m_iClip2", "m_iPrimaryReserveAmmoCount", "m_iItemDefinitionIndex"],
      {},
    );
    expect(() => new Weapon(e)).toThrow(/m_iClip1/);
    expect(() => new Weapon(e)).toThrow(/CAK47/);
  });

  it("throws when m_hOwnerEntity is missing on a CDEagle schema, naming both", () => {
    const e = fakeEntity(
      "CDEagle",
      ["m_iClip1", "m_iClip2", "m_iPrimaryReserveAmmoCount", "m_iItemDefinitionIndex"],
      {},
    );
    expect(() => new Weapon(e)).toThrow(/m_hOwnerEntity/);
    expect(() => new Weapon(e)).toThrow(/CDEagle/);
  });

  it("throws when the bare item def index is missing", () => {
    const e = fakeEntity(
      "CAK47",
      ["m_hOwnerEntity", "m_iClip1", "m_iClip2", "m_iPrimaryReserveAmmoCount"],
      {},
    );
    expect(() => new Weapon(e)).toThrow(
      /m_iItemDefinitionIndex/,
    );
  });
});

describe("Weapon getters", () => {
  it("returns the underlying entity's className unchanged", () => {
    const e = ak47Entity();
    expect(new Weapon(e).className).toBe("CAK47");
  });

  it("reads clip1, clip2, reserveAmmo, itemDefIndex, ownerHandle from the store", () => {
    const e = ak47Entity({
      m_iClip1: 28,
      m_iClip2: 0,
      m_iPrimaryReserveAmmoCount: 60,
      "m_iItemDefinitionIndex": 7, // AK-47
      m_hOwnerEntity: 0xdeadbeef,
    });
    const w = new Weapon(e);
    expect(w.clip1).toBe(28);
    expect(w.clip2).toBe(0);
    expect(w.reserveAmmo).toBe(60);
    expect(w.itemDefIndex).toBe(7);
    expect(w.ownerHandle).toBe(0xdeadbeef);
  });

  it("returns 0 for never-written numeric props (store.read → undefined)", () => {
    // Build an entity whose store returns undefined for every read.
    const e = fakeEntity("CAK47", WEAPON_PROPS, {});
    const w = new Weapon(e);
    expect(w.clip1).toBe(0);
    expect(w.clip2).toBe(0);
    expect(w.reserveAmmo).toBe(0);
    expect(w.itemDefIndex).toBe(0);
    expect(w.ownerHandle).toBe(0);
  });

  it("re-reads the store on every getter call (live view, not snapshot)", () => {
    // Mutable backing — first read sees 30, second sees 29 (one round fired).
    const values: Record<string, unknown> = {
      m_hOwnerEntity: 1,
      m_iClip1: 30,
      m_iClip2: 0,
      m_iPrimaryReserveAmmoCount: 90,
      "m_iItemDefinitionIndex": 7,
    };
    const flattenedProps = WEAPON_PROPS.map((vn) => ({ prop: { varName: vn } }));
    const e = {
      serverClass: { className: "CAK47", flattenedProps },
      store: {
        read: (_s: number, idx: number) => values[WEAPON_PROPS[idx]!],
      },
      storageSlot: 0,
    } as unknown as Entity;

    const w = new Weapon(e);
    expect(w.clip1).toBe(30);
    values.m_iClip1 = 29;
    expect(w.clip1).toBe(29);
  });
});

describe("Weapon.snapshot", () => {
  it("returns a frozen object with all six fields populated from current state", () => {
    const e = ak47Entity({
      m_iClip1: 30,
      m_iClip2: 0,
      m_iPrimaryReserveAmmoCount: 90,
      "m_iItemDefinitionIndex": 7,
      m_hOwnerEntity: 42,
    });
    const snap = new Weapon(e).snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(snap).toEqual({
      className: "CAK47",
      clip1: 30,
      clip2: 0,
      reserveAmmo: 90,
      itemDefIndex: 7,
      ownerHandle: 42,
    });
  });

  it("does not change after subsequent live mutations (the snapshot is frozen at call time)", () => {
    const values: Record<string, unknown> = {
      m_hOwnerEntity: 1,
      m_iClip1: 30,
      m_iClip2: 0,
      m_iPrimaryReserveAmmoCount: 90,
      "m_iItemDefinitionIndex": 7,
    };
    const flattenedProps = WEAPON_PROPS.map((vn) => ({ prop: { varName: vn } }));
    const e = {
      serverClass: { className: "CAK47", flattenedProps },
      store: {
        read: (_s: number, idx: number) => values[WEAPON_PROPS[idx]!],
      },
      storageSlot: 0,
    } as unknown as Entity;

    const w = new Weapon(e);
    const snap = w.snapshot();
    values.m_iClip1 = 1;
    expect(snap.clip1).toBe(30); // frozen
    expect(w.clip1).toBe(1); // live
  });
});
