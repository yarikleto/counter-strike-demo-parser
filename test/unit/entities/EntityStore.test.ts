/**
 * Unit tests for the per-class struct-of-arrays EntityStore.
 *
 * Hand-builds a tiny ServerClass with a mixed-type prop list (int / float /
 * vector / string) and exercises the storage lifecycle: allocate -> write
 * -> read -> free -> reuse with `written` bitset gating, slot version
 * bumps, and capacity doubling.
 */
import { describe, it, expect } from "vitest";
import { EntityStore } from "../../../src/entities/EntityStore.js";
import { computePropColumns } from "../../../src/entities/PropColumns.js";
import { SendPropType } from "../../../src/datatables/SendTable.js";
import type { ServerClass, FlattenedSendProp } from "../../../src/datatables/ServerClass.js";

function makeProp(
  varName: string,
  type: number,
  numBits = 32,
  flags = 0,
): FlattenedSendProp {
  return {
    prop: {
      type: type as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      varName,
      flags,
      priority: 0,
      numElements: 0,
      lowValue: 0,
      highValue: 0,
      numBits,
    },
    sourceTableName: "DT_Test",
  };
}

function makeClass(props: FlattenedSendProp[], className = "CTest"): ServerClass {
  return {
    classId: 1,
    className,
    dtName: "DT_Test",
    sendTable: undefined,
    flattenedProps: props,
    entityStore: null,
    propColumnLayout: null,
    cachedBaseline: undefined,
  };
}

describe("EntityStore", () => {
  it("writes and reads back primitive props in correct columns", () => {
    const props = [
      makeProp("intA", SendPropType.INT, 16),
      makeProp("floatA", SendPropType.FLOAT),
      makeProp("intB", SendPropType.INT, 8),
      makeProp("vecA", SendPropType.VECTOR),
      makeProp("strA", SendPropType.STRING),
    ];
    const sc = makeClass(props);
    const layout = computePropColumns(props);
    const store = new EntityStore(sc, layout);

    const slot = store.allocate();
    store.write(slot, 0, 42);
    store.write(slot, 1, 3.5);
    store.write(slot, 2, 7);
    store.write(slot, 3, { x: 1, y: 2, z: 3 });
    store.write(slot, 4, "hello");

    expect(store.read(slot, 0)).toBe(42);
    expect(store.read(slot, 1)).toBeCloseTo(3.5, 5);
    expect(store.read(slot, 2)).toBe(7);
    expect(store.read(slot, 3)).toEqual({ x: 1, y: 2, z: 3 });
    expect(store.read(slot, 4)).toBe("hello");
  });

  it("returns undefined for a never-written prop on an occupied slot", () => {
    const props = [
      makeProp("intA", SendPropType.INT, 16),
      makeProp("intB", SendPropType.INT, 16),
    ];
    const sc = makeClass(props);
    const store = new EntityStore(sc, computePropColumns(props));

    const slot = store.allocate();
    store.write(slot, 0, 99);
    // Prop 1 was never written.
    expect(store.read(slot, 1)).toBeUndefined();
    expect(store.read(slot, 0)).toBe(99);
  });

  it("clears `written` bits on free; reused slot reads as undefined", () => {
    const props = [makeProp("a", SendPropType.INT, 16), makeProp("b", SendPropType.INT, 16)];
    const sc = makeClass(props);
    const store = new EntityStore(sc, computePropColumns(props));

    const s1 = store.allocate();
    store.write(s1, 0, 5);
    store.write(s1, 1, 10);
    const v1 = store.getVersion(s1);
    store.free(s1);
    // Slot version bumped.
    expect(store.getVersion(s1)).toBe(v1 + 1);

    const s2 = store.allocate();
    expect(s2).toBe(s1); // freelist reuse
    expect(store.read(s2, 0)).toBeUndefined();
    expect(store.read(s2, 1)).toBeUndefined();
  });

  it("isolates writes across multiple slots", () => {
    const props = [makeProp("a", SendPropType.INT, 16)];
    const sc = makeClass(props);
    const store = new EntityStore(sc, computePropColumns(props));

    const s1 = store.allocate();
    const s2 = store.allocate();
    const s3 = store.allocate();
    store.write(s1, 0, 11);
    store.write(s2, 0, 22);
    store.write(s3, 0, 33);
    expect(store.read(s1, 0)).toBe(11);
    expect(store.read(s2, 0)).toBe(22);
    expect(store.read(s3, 0)).toBe(33);
  });

  it("grows past initial capacity for a non-Proxy class", () => {
    const props = [makeProp("a", SendPropType.INT, 16)];
    const sc = makeClass(props, "CRegular");
    const store = new EntityStore(sc, computePropColumns(props));

    // Allocate well past initial capacity (16) to force at least one grow.
    const slots: number[] = [];
    for (let i = 0; i < 40; i++) {
      const s = store.allocate();
      store.write(s, 0, i + 1000);
      slots.push(s);
    }
    for (let i = 0; i < 40; i++) {
      expect(store.read(slots[i]!, 0)).toBe(i + 1000);
    }
  });

  it("uses initial capacity 1 for *Proxy classes", () => {
    const props = [makeProp("a", SendPropType.INT, 16)];
    const sc = makeClass(props, "CCSGameRulesProxy");
    const store = new EntityStore(sc, computePropColumns(props));
    const s1 = store.allocate();
    store.write(s1, 0, 7);
    // Allocating a second forces a grow.
    const s2 = store.allocate();
    store.write(s2, 0, 8);
    expect(store.read(s1, 0)).toBe(7);
    expect(store.read(s2, 0)).toBe(8);
  });

  it("supports VectorXY and INT64 (bigint) columns", () => {
    const props = [
      makeProp("v", SendPropType.VECTORXY),
      makeProp("big", SendPropType.INT64, 64),
    ];
    const sc = makeClass(props);
    const store = new EntityStore(sc, computePropColumns(props));
    const s = store.allocate();
    store.write(s, 0, { x: 100, y: 200 });
    store.write(s, 1, 0xdeadbeefn);
    expect(store.read(s, 0)).toEqual({ x: 100, y: 200 });
    expect(store.read(s, 1)).toBe(0xdeadbeefn);
  });
});
