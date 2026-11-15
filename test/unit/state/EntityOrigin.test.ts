/**
 * Unit tests for `readEntityOrigin` — the cell-coordinate decode that turns
 * a projectile's cell-relative `m_vecOrigin` into world space.
 *
 * Regression: grenade trajectory points used to surface the raw in-cell
 * offset, e.g. (11, 4, 6), instead of world coordinates like (-2426, -1400).
 */
import { describe, it, expect } from "vitest";
import {
  readEntityOrigin,
  coordFromCell,
  MAX_COORD_INTEGER,
} from "../../../src/state/EntityOrigin.js";
import type { Entity } from "../../../src/entities/Entity.js";
import type { ServerClass, FlattenedSendProp } from "../../../src/datatables/ServerClass.js";

function fakeEntity(props: Record<string, unknown>): Entity {
  const names = Object.keys(props);
  const serverClass = {
    className: "CSmokeGrenadeProjectile",
    flattenedProps: names.map(
      (varName) => ({ prop: { varName }, sourceTableName: "DT_BaseEntity" }) as unknown,
    ) as FlattenedSendProp[],
  } as unknown as ServerClass;
  return {
    serverClass,
    storageSlot: 0,
    store: { read: (_slot: number, idx: number) => props[names[idx]!] },
  } as unknown as Entity;
}

describe("coordFromCell", () => {
  it("matches demoinfocs: cell * width - MAX_COORD_INTEGER + offset", () => {
    expect(coordFromCell(512, 32, 0)).toBe(0);
    expect(coordFromCell(436, 32, 11)).toBe(436 * 32 - MAX_COORD_INTEGER + 11);
  });
});

describe("readEntityOrigin", () => {
  it("combines m_cellX/Y/Z with the cell-relative m_vecOrigin", () => {
    const e = fakeEntity({
      m_cellbits: 5,
      m_cellX: 436,
      m_cellY: 468,
      m_cellZ: 512,
      m_vecOrigin: { x: 11, y: 4, z: 6 },
    });
    expect(readEntityOrigin(e)).toEqual({ x: -2421, y: -1404, z: 6 });
  });

  it("honours a non-default cell width", () => {
    const e = fakeEntity({
      m_cellbits: 7,
      m_cellX: 100,
      m_cellY: 140,
      m_cellZ: 128,
      m_vecOrigin: { x: 1.5, y: 0, z: 100 },
    });
    expect(readEntityOrigin(e)).toEqual({ x: 12800 - 16384 + 1.5, y: 17920 - 16384, z: 100 });
  });

  it("returns undefined while the cell props are unwritten", () => {
    const e = fakeEntity({
      m_cellbits: 5,
      m_cellX: undefined,
      m_cellY: 1,
      m_cellZ: 1,
      m_vecOrigin: { x: 1, y: 1, z: 1 },
    });
    expect(readEntityOrigin(e)).toBeUndefined();
  });

  it("returns m_vecOrigin unchanged for classes without cell props", () => {
    const e = fakeEntity({ m_vecOrigin: { x: -2426, y: -1400, z: 12 } });
    expect(readEntityOrigin(e)).toEqual({ x: -2426, y: -1400, z: 12 });
  });

  it("returns undefined when the class has no m_vecOrigin", () => {
    expect(readEntityOrigin(fakeEntity({ m_iHealth: 100 }))).toBeUndefined();
  });
});
