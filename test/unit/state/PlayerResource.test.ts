/**
 * Unit tests for the PlayerResource overlay.
 *
 * Hand-builds a fake Entity exposing only the surface PlayerResource reads
 * (`serverClass.flattenedProps`, `serverClass.className`, `store.read`,
 * `storageSlot`). This avoids dragging in EntityStore/ServerClass fixtures
 * for an overlay that only cares about prop-name -> index resolution and
 * delegated typed-array reads.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_PLAYER_SLOTS,
  PlayerResource,
} from "../../../src/state/PlayerResource.js";
import type { Entity } from "../../../src/entities/Entity.js";
import type { FlattenedSendProp } from "../../../src/datatables/ServerClass.js";

const STAT_NAMES = ["m_iKills", "m_iDeaths", "m_iAssists", "m_iScore", "m_iPing"] as const;

/**
 * Build the canonical 320-prop CCSPlayerResource flat-prop list mirroring
 * the real wire shape: each per-slot stat is its own SendTable named after
 * the stat (`m_iKills`), and each slot's flat prop has `varName === "000"`
 * .. `"063"` with `sourceTableName === "<stat>"` as the disambiguator.
 *
 * This is what the Flattener actually produces on a real CS:GO demo (see
 * `scripts/probe-pr.ts` against de_nuke.dem). Earlier drafts of these
 * tests synthesized a dotted-path varName (`m_iKills.000`) under a single
 * `DT_CSPlayerResource` parent — that did not match the wire and was the
 * gap TASK-029a closed.
 *
 * Order: for each stat name, slots 000..063 in sequence. Returned indices
 * are stable across calls.
 */
function buildPlayerResourceProps(): FlattenedSendProp[] {
  const props: FlattenedSendProp[] = [];
  for (const stat of STAT_NAMES) {
    for (let slot = 0; slot < MAX_PLAYER_SLOTS; slot++) {
      props.push({
        prop: {
          type: 0,
          varName: slot.toString().padStart(3, "0"),
          flags: 0,
          priority: 0,
          numElements: 0,
          lowValue: 0,
          highValue: 0,
          numBits: 32,
        },
        sourceTableName: stat,
      });
    }
  }
  return props;
}

/**
 * Make a fake Entity with the supplied flattened-prop list and a `store`
 * whose `read(slot, idx)` returns whatever the supplied lookup function
 * returns. All other Entity surface is unused by PlayerResource.
 */
function fakeEntity(
  flatProps: FlattenedSendProp[],
  read: (storageSlot: number, propIdx: number) => unknown,
  className = "CCSPlayerResource",
): Entity {
  return {
    serverClass: {
      className,
      flattenedProps: flatProps,
    },
    store: { read },
    storageSlot: 0,
  } as unknown as Entity;
}

describe("PlayerResource", () => {
  it("resolves all 64x5 = 320 per-slot prop indices on construction", () => {
    const props = buildPlayerResourceProps();
    const entity = fakeEntity(props, () => 0);
    // Construction must not throw and must produce a usable instance.
    const pr = new PlayerResource(entity);
    expect(pr).toBeInstanceOf(PlayerResource);
    // Sanity: prop list has the expected total count.
    expect(props).toHaveLength(MAX_PLAYER_SLOTS * STAT_NAMES.length);
  });

  it("reads kills/deaths/assists/score/ping for a known slot via the cached indices", () => {
    const props = buildPlayerResourceProps();
    // Encode (statIndex, slot) into the returned value so every read is verifiable.
    // Layout: stats are blocks of 64 props in STAT_NAMES order.
    const encode = (statIdx: number, slot: number): number =>
      statIdx * 1000 + slot;
    const entity = fakeEntity(props, (_storageSlot, propIdx) => {
      const statIdx = Math.floor(propIdx / MAX_PLAYER_SLOTS);
      const slot = propIdx % MAX_PLAYER_SLOTS;
      return encode(statIdx, slot);
    });
    const pr = new PlayerResource(entity);

    // Spot-check several slots across each stat.
    for (const slot of [0, 1, 7, 31, 63]) {
      expect(pr.killsForSlot(slot)).toBe(encode(0, slot));
      expect(pr.deathsForSlot(slot)).toBe(encode(1, slot));
      expect(pr.assistsForSlot(slot)).toBe(encode(2, slot));
      expect(pr.scoreForSlot(slot)).toBe(encode(3, slot));
      expect(pr.pingForSlot(slot)).toBe(encode(4, slot));
    }
  });

  it("returns 0 for negative or out-of-range slot indices", () => {
    const props = buildPlayerResourceProps();
    // Make sure even if the store is somehow probed, we'd notice.
    const entity = fakeEntity(props, () => 9999);
    const pr = new PlayerResource(entity);

    expect(pr.killsForSlot(-1)).toBe(0);
    expect(pr.deathsForSlot(MAX_PLAYER_SLOTS)).toBe(0);
    expect(pr.assistsForSlot(MAX_PLAYER_SLOTS + 5)).toBe(0);
    expect(pr.scoreForSlot(-100)).toBe(0);
    expect(pr.pingForSlot(1024)).toBe(0);
  });

  it("returns 0 when the underlying store yields a non-number (never-written prop)", () => {
    const props = buildPlayerResourceProps();
    const entity = fakeEntity(props, () => undefined);
    const pr = new PlayerResource(entity);
    expect(pr.killsForSlot(0)).toBe(0);
    expect(pr.pingForSlot(63)).toBe(0);
  });

  it("snapshot() returns frozen arrays of length MAX_PLAYER_SLOTS with current values", () => {
    const props = buildPlayerResourceProps();
    let killsBase = 100;
    const entity = fakeEntity(props, (_storageSlot, propIdx) => {
      const statIdx = Math.floor(propIdx / MAX_PLAYER_SLOTS);
      const slot = propIdx % MAX_PLAYER_SLOTS;
      // Only kills (statIdx=0) varies with killsBase; others are stable.
      if (statIdx === 0) return killsBase + slot;
      return statIdx * 10 + slot;
    });
    const pr = new PlayerResource(entity);

    const snap1 = pr.snapshot();
    expect(snap1.kills).toHaveLength(MAX_PLAYER_SLOTS);
    expect(snap1.deaths).toHaveLength(MAX_PLAYER_SLOTS);
    expect(snap1.assists).toHaveLength(MAX_PLAYER_SLOTS);
    expect(snap1.scores).toHaveLength(MAX_PLAYER_SLOTS);
    expect(snap1.pings).toHaveLength(MAX_PLAYER_SLOTS);

    expect(snap1.kills[0]).toBe(100);
    expect(snap1.kills[63]).toBe(163);
    expect(snap1.deaths[5]).toBe(15);

    // Outer snapshot and every inner array must be frozen.
    expect(Object.isFrozen(snap1)).toBe(true);
    expect(Object.isFrozen(snap1.kills)).toBe(true);
    expect(Object.isFrozen(snap1.deaths)).toBe(true);
    expect(Object.isFrozen(snap1.assists)).toBe(true);
    expect(Object.isFrozen(snap1.scores)).toBe(true);
    expect(Object.isFrozen(snap1.pings)).toBe(true);

    // Live-view: a fresh snapshot reflects the new underlying value.
    killsBase = 200;
    const snap2 = pr.snapshot();
    expect(snap2.kills[0]).toBe(200);
    // Old snapshot is unchanged (frozen + decoupled from the store).
    expect(snap1.kills[0]).toBe(100);
  });

  it("getter results track the underlying store live (no value caching)", () => {
    const props = buildPlayerResourceProps();
    let value = 7;
    const entity = fakeEntity(props, () => value);
    const pr = new PlayerResource(entity);
    expect(pr.killsForSlot(3)).toBe(7);
    value = 42;
    expect(pr.killsForSlot(3)).toBe(42);
  });

  it("throws on construction when a per-slot prop is missing from the schema", () => {
    const props = buildPlayerResourceProps();
    // Drop one prop the overlay needs — slot 042 of `m_iScore`. A real
    // schema mismatch should be loud and name both the table and the slot.
    const filtered = props.filter(
      (p) => !(p.sourceTableName === "m_iScore" && p.prop.varName === "042"),
    );
    const entity = fakeEntity(filtered, () => 0);
    expect(() => new PlayerResource(entity)).toThrow(/m_iScore/);
    expect(() => new PlayerResource(entity)).toThrow(/042/);
    expect(() => new PlayerResource(entity)).toThrow(/CCSPlayerResource/);
  });

  it("throws when the entity's ServerClass has no PlayerResource props at all", () => {
    const entity = fakeEntity([], () => 0, "CCSPlayer");
    // First missing prop is m_iKills slot 000.
    expect(() => new PlayerResource(entity)).toThrow(/m_iKills/);
    expect(() => new PlayerResource(entity)).toThrow(/CCSPlayer/);
  });
});
