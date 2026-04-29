import { describe, it, expect } from "vitest";
import {
  ENTITY_INDEX_BITS,
  ENTITY_INDEX_MASK,
  ENTITY_SERIAL_BITS_21,
  ENTITY_SERIAL_BITS_32,
  INVALID_HANDLE,
  handleToIndex,
  handleToSerial,
  isValidHandle,
  resolveHandle,
} from "../../../src/state/EntityHandle.js";
import type { EntityList } from "../../../src/entities/EntityList.js";
import type { Entity } from "../../../src/entities/Entity.js";

/**
 * Build a fake EntityList that exposes only the surface `resolveHandle`
 * touches (`get`). The real EntityList drags in EntityStore/ServerClass
 * which would force a heavyweight fixture for a one-method test.
 */
function fakeList(slots: ReadonlyMap<number, Entity>): EntityList {
  return { get: (id: number) => slots.get(id) } as unknown as EntityList;
}

/** Minimal Entity stub — resolveHandle only reads `serialNumber`. */
function fakeEntity(id: number, serial: number): Entity {
  return { id, serialNumber: serial } as unknown as Entity;
}

/** Encode the 32-bit Source handle form (21 bits serial | 11 bits index). */
function encode32(index: number, serial: number): number {
  return (
    ((serial & ((1 << ENTITY_SERIAL_BITS_32) - 1)) << ENTITY_INDEX_BITS) |
    (index & ENTITY_INDEX_MASK)
  ) >>> 0;
}

/** Encode the 21-bit packed-from-SendProp form (10 bits serial | 11 bits index). */
function encode21(index: number, serial: number): number {
  return (
    ((serial & ((1 << ENTITY_SERIAL_BITS_21) - 1)) << ENTITY_INDEX_BITS) |
    (index & ENTITY_INDEX_MASK)
  ) >>> 0;
}

describe("EntityHandle constants", () => {
  it("exposes 11-bit index width matching MAX_EDICTS = 2048", () => {
    expect(ENTITY_INDEX_BITS).toBe(11);
    expect(ENTITY_INDEX_MASK).toBe(0x7ff);
    expect(1 << ENTITY_INDEX_BITS).toBe(2048);
  });

  it("INVALID_HANDLE is the unsigned all-bits-set 32-bit sentinel", () => {
    expect(INVALID_HANDLE).toBe(0xffffffff);
  });
});

describe("isValidHandle", () => {
  it("returns false only for the INVALID_HANDLE sentinel", () => {
    expect(isValidHandle(INVALID_HANDLE)).toBe(false);
  });

  it("returns true for ordinary handles, including zero", () => {
    expect(isValidHandle(0)).toBe(true);
    expect(isValidHandle(encode32(5, 42))).toBe(true);
    expect(isValidHandle(encode21(5, 42))).toBe(true);
  });
});

describe("handleToIndex / handleToSerial round-trip", () => {
  it("32-bit form: index=5, serial=42 → recovers 5 and 42", () => {
    const h = encode32(5, 42);
    expect(handleToIndex(h)).toBe(5);
    expect(handleToSerial(h)).toBe(42);
  });

  it("21-bit form: index=5, serial=42 → recovers 5 and 42", () => {
    const h = encode21(5, 42);
    expect(handleToIndex(h)).toBe(5);
    expect(handleToSerial(h)).toBe(42);
  });

  it("21-bit form max index/serial round-trips", () => {
    // Max packable in 21-bit form: index=2046, serial=1022 — staying away
    // from the 2047/1023 "empty slot" sentinel that resolves to undefined.
    const h = encode21(2046, 1022);
    expect(handleToIndex(h)).toBe(2046);
    expect(handleToSerial(h)).toBe(1022);
  });

  it("32-bit form recovers a serial that wouldn't fit in 10 bits", () => {
    // Serial 2000 is > 1023 so it cannot be a 21-bit form. The high bit
    // forces 32-bit detection.
    const h = encode32(7, 2000);
    expect(handleToIndex(h)).toBe(7);
    expect(handleToSerial(h)).toBe(2000);
  });
});

describe("resolveHandle", () => {
  it("returns undefined for INVALID_HANDLE", () => {
    const list = fakeList(new Map());
    expect(resolveHandle(list, INVALID_HANDLE)).toBeUndefined();
  });

  it("returns undefined for an empty slot", () => {
    const list = fakeList(new Map());
    expect(resolveHandle(list, encode32(7, 1))).toBeUndefined();
  });

  it("returns the entity when index and serial both match (32-bit form)", () => {
    const e = fakeEntity(7, 42);
    const list = fakeList(new Map([[7, e]]));
    expect(resolveHandle(list, encode32(7, 42))).toBe(e);
  });

  it("returns the entity when index and serial both match (21-bit form)", () => {
    const e = fakeEntity(7, 42);
    const list = fakeList(new Map([[7, e]]));
    expect(resolveHandle(list, encode21(7, 42))).toBe(e);
  });

  it("returns undefined when the serial is stale (slot reused)", () => {
    // Entity at slot 7 currently has serial 99 (newer than handle's 42).
    const e = fakeEntity(7, 99);
    const list = fakeList(new Map([[7, e]]));
    expect(resolveHandle(list, encode32(7, 42))).toBeUndefined();
  });

  it("masks the entity serial against the 10-bit form when given a 21-bit handle", () => {
    // Real entity has a 32-bit serial whose low 10 bits are 42; the
    // 21-bit handle carries serial 42. They should match modulo 1024.
    // 1066 & 1023 === 42.
    const e = fakeEntity(7, 1066);
    const list = fakeList(new Map([[7, e]]));
    expect(resolveHandle(list, encode21(7, 42))).toBe(e);
  });
});
