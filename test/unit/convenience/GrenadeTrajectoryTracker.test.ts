/**
 * Unit tests for `GrenadeTrajectoryTracker` (TASK-063).
 *
 * Drives the tracker via a hand-rolled fake parser that mimics the events
 * the real DemoParser emits — `entityCreated`, `entityUpdated`,
 * `entityDeleted`, and the Tier-2 `gameEvent` catch-all. We synthesize
 * minimal `Entity` and `EntityStore` shapes so the tracker can read
 * `m_hThrower` and `m_vecOrigin` without spinning up the full M3 entity
 * pipeline. This keeps the tests fast and focused on the accumulation /
 * disambiguation logic; an integration test against the de_nuke fixture
 * exercises the real wiring end-to-end.
 *
 * Scenarios covered:
 *   - Class-based type defaulting (smoke / decoy / molotov / he).
 *   - Detonate event override (CBaseCSGrenadeProjectile → 'flash').
 *   - Trajectory captures spawn position + at least one update sample.
 *   - Duplicate consecutive samples are suppressed.
 *   - Detonation position + tick are captured from the matching event.
 *   - Detonate event for an untracked entity is silently ignored.
 *   - Thrower resolves via m_hThrower → CCSPlayer entity → Player overlay.
 *   - Thrower is `undefined` when the handle is INVALID_HANDLE.
 *   - Non-grenade entities are not tracked.
 *   - `snapshot()` returns frozen records and frozen trajectory arrays.
 *   - Entity deletion without detonate finalizes the trajectory with no
 *     detonationPosition.
 */

import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { GrenadeTrajectoryTracker } from "../../../src/convenience/GrenadeTrajectoryTracker.js";
import type { Player } from "../../../src/state/Player.js";
import type { Entity } from "../../../src/entities/Entity.js";
import type { DemoParser } from "../../../src/DemoParser.js";
import type { EntityList } from "../../../src/entities/EntityList.js";
import type { ServerClass, FlattenedSendProp } from "../../../src/datatables/ServerClass.js";

// ---------------------------------------------------------------------------
// Fake entity / store / serverClass scaffolding
// ---------------------------------------------------------------------------

interface FakeEntity {
  id: number;
  serverClass: ServerClass;
  storageSlot: number;
  serialNumber: number;
  store: {
    read(slot: number, idx: number): unknown;
  };
}

function makeServerClass(
  className: string,
  varNames: string[],
): ServerClass {
  const flattenedProps: FlattenedSendProp[] = varNames.map((name) => ({
    prop: { varName: name } as FlattenedSendProp["prop"],
    sourceTableName: "DT_Test",
  } as unknown as FlattenedSendProp));
  return { className, flattenedProps } as unknown as ServerClass;
}

/**
 * Build a fake entity with prop values keyed by varName. The store reads
 * by flat-prop index and we resolve that index against the provided
 * varNames in order — the same way the tracker does.
 */
function makeEntity(opts: {
  id: number;
  className: string;
  serialNumber?: number;
  props: Record<string, unknown>;
}): FakeEntity {
  const varNames = Object.keys(opts.props);
  const sc = makeServerClass(opts.className, varNames);
  const values = varNames.map((n) => opts.props[n]);
  return {
    id: opts.id,
    serverClass: sc,
    storageSlot: 0,
    serialNumber: opts.serialNumber ?? 1,
    store: {
      read(_slot: number, idx: number): unknown {
        return values[idx];
      },
    },
  };
}

/** Update an existing entity's m_vecOrigin without changing identity. */
function setOrigin(entity: FakeEntity, origin: { x: number; y: number; z: number }): void {
  // Replace the value the store returns for the m_vecOrigin index.
  const idx = entity.serverClass.flattenedProps.findIndex(
    (p) => p.prop.varName === "m_vecOrigin",
  );
  if (idx < 0) return;
  const original = entity.store.read.bind(entity.store);
  entity.store.read = (slot: number, i: number) =>
    i === idx ? origin : original(slot, i);
}

// ---------------------------------------------------------------------------
// Fake parser — minimal surface area for GrenadeTrajectoryTracker.attach().
// ---------------------------------------------------------------------------

interface FakeParser {
  asParser: DemoParser;
  setTick(t: number): void;
  setPlayers(players: Player[]): void;
  setEntities(map: Map<number, FakeEntity>): void;
  emitCreated(e: FakeEntity): void;
  emitUpdated(e: FakeEntity): void;
  emitDeleted(e: FakeEntity): void;
  emitGameEvent(name: string, data: Record<string, string | number | boolean>): void;
}

function makeFakeParser(): FakeParser {
  const emitter = new EventEmitter();
  let tick = 0;
  let players: Player[] = [];
  let entityMap: Map<number, FakeEntity> = new Map();

  // Resolve handles by treating them as raw entity ids — our tests pass
  // in synthetic 21-bit-form handles where serial=1 (matching makeEntity's
  // default serialNumber).
  const fakeEntityList = {
    get(id: number) {
      return entityMap.get(id);
    },
  };

  const proxy = new Proxy(emitter, {
    get(target, prop) {
      if (prop === "currentTick") return tick;
      if (prop === "players") return players;
      if (prop === "entities") return fakeEntityList;
      const val = (target as unknown as Record<string | symbol, unknown>)[prop];
      return typeof val === "function" ? val.bind(target) : val;
    },
  });

  return {
    asParser: proxy as unknown as DemoParser,
    setTick(t) {
      tick = t;
    },
    setPlayers(p) {
      players = p;
    },
    setEntities(m) {
      entityMap = m;
    },
    emitCreated: (e) => emitter.emit("entityCreated", e as unknown as Entity),
    emitUpdated: (e) => emitter.emit("entityUpdated", e as unknown as Entity),
    emitDeleted: (e) => emitter.emit("entityDeleted", e as unknown as Entity),
    emitGameEvent: (name, data) =>
      emitter.emit("gameEvent", { name, eventId: 0, data: Object.freeze(data) }),
  };
}

function makePlayer(slot: number): Player {
  return { slot } as unknown as Player;
}

/**
 * Build a 21-bit packed entity handle: low 11 bits index, next 10 bits
 * serial. Matches `EntityHandle.ts`'s wire format. Tests pass in handles
 * whose serial part matches the corresponding entity's serialNumber so
 * `resolveHandle` returns the entity.
 */
function makeHandle(index: number, serial: number): number {
  return ((serial & 0x3ff) << 11) | (index & 0x7ff);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GrenadeTrajectoryTracker", () => {
  it("ignores non-grenade entities", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    const ent = makeEntity({
      id: 100,
      className: "CCSPlayer",
      props: { m_vecOrigin: { x: 1, y: 2, z: 3 } },
    });
    fake.emitCreated(ent);

    expect(tracker.snapshot()).toHaveLength(0);
  });

  it("tracks CSmokeGrenadeProjectile with type 'smoke'", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    fake.setTick(100);
    const ent = makeEntity({
      id: 50,
      className: "CSmokeGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 100, y: 200, z: 300 },
        m_hThrower: 0xffffffff, // INVALID_HANDLE
      },
    });
    fake.emitCreated(ent);

    const snap = tracker.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]!.type).toBe("smoke");
    expect(snap[0]!.entityIndex).toBe(50);
    expect(snap[0]!.throwTick).toBe(100);
    expect(snap[0]!.thrower).toBeUndefined();
  });

  it("tracks CDecoyProjectile with type 'decoy'", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    const ent = makeEntity({
      id: 51,
      className: "CDecoyProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);

    expect(tracker.snapshot()[0]!.type).toBe("decoy");
  });

  it("tracks CMolotovProjectile with type 'molotov'", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    const ent = makeEntity({
      id: 52,
      className: "CMolotovProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);

    expect(tracker.snapshot()[0]!.type).toBe("molotov");
  });

  it("CBaseCSGrenadeProjectile defaults to 'he' until detonate event arrives", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    const ent = makeEntity({
      id: 60,
      className: "CBaseCSGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);
    expect(tracker.snapshot()[0]!.type).toBe("he");
  });

  it("CBaseCSGrenadeProjectile is rewritten to 'flash' on flashbang_detonate", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    const ent = makeEntity({
      id: 60,
      className: "CBaseCSGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);
    fake.setTick(500);
    fake.emitGameEvent("flashbang_detonate", {
      entityid: 60,
      x: 1000,
      y: 2000,
      z: 50,
    });

    const snap = tracker.snapshot();
    expect(snap[0]!.type).toBe("flash");
    expect(snap[0]!.detonationPosition).toEqual({ x: 1000, y: 2000, z: 50 });
    expect(snap[0]!.detonationTick).toBe(500);
  });

  it("captures detonation position from hegrenade_detonate", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    const ent = makeEntity({
      id: 70,
      className: "CBaseCSGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);
    fake.setTick(123);
    fake.emitGameEvent("hegrenade_detonate", {
      entityid: 70,
      x: -500,
      y: 250,
      z: 100,
    });

    const snap = tracker.snapshot();
    expect(snap[0]!.type).toBe("he");
    expect(snap[0]!.detonationPosition).toEqual({ x: -500, y: 250, z: 100 });
    expect(snap[0]!.detonationTick).toBe(123);
  });

  it("ignores detonate events for untracked entities", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    fake.emitGameEvent("hegrenade_detonate", {
      entityid: 999,
      x: 1,
      y: 2,
      z: 3,
    });

    expect(tracker.snapshot()).toHaveLength(0);
  });

  it("samples spawn origin as the first trajectory point", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    fake.setTick(10);
    const ent = makeEntity({
      id: 80,
      className: "CSmokeGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 100, y: 200, z: 300 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);

    const snap = tracker.snapshot();
    expect(snap[0]!.trajectory).toHaveLength(1);
    expect(snap[0]!.trajectory[0]).toEqual({ x: 100, y: 200, z: 300, tick: 10 });
  });

  it("appends a sample on each entityUpdated when position changes", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    fake.setTick(10);
    const ent = makeEntity({
      id: 80,
      className: "CSmokeGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);

    fake.setTick(11);
    setOrigin(ent, { x: 10, y: 0, z: 0 });
    fake.emitUpdated(ent);

    fake.setTick(12);
    setOrigin(ent, { x: 20, y: 5, z: 0 });
    fake.emitUpdated(ent);

    const traj = tracker.snapshot()[0]!.trajectory;
    expect(traj).toHaveLength(3);
    expect(traj[0]).toEqual({ x: 0, y: 0, z: 0, tick: 10 });
    expect(traj[1]).toEqual({ x: 10, y: 0, z: 0, tick: 11 });
    expect(traj[2]).toEqual({ x: 20, y: 5, z: 0, tick: 12 });
  });

  it("suppresses duplicate consecutive samples at the same position", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    fake.setTick(1);
    const ent = makeEntity({
      id: 81,
      className: "CSmokeGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 5, y: 5, z: 5 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);
    fake.setTick(2);
    fake.emitUpdated(ent);
    fake.setTick(3);
    fake.emitUpdated(ent);

    const traj = tracker.snapshot()[0]!.trajectory;
    expect(traj).toHaveLength(1); // only the spawn sample
  });

  it("resolves thrower from m_hThrower → CCSPlayer entity → Player overlay", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    // Throwing player: CCSPlayer at entity id 5, serial 1.
    const playerEnt = makeEntity({
      id: 5,
      className: "CCSPlayer",
      serialNumber: 1,
      props: {},
    });
    const player = makePlayer(5);
    fake.setPlayers([player]);
    fake.setEntities(new Map([[5, playerEnt]]));

    // Grenade projectile with m_hThrower pointing to entity 5, serial 1.
    const handle = makeHandle(5, 1);
    const projectile = makeEntity({
      id: 60,
      className: "CSmokeGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: handle,
      },
    });
    fake.emitCreated(projectile);

    expect(tracker.snapshot()[0]!.thrower).toBe(player);
  });

  it("returns undefined thrower when m_hThrower is INVALID_HANDLE", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    const ent = makeEntity({
      id: 60,
      className: "CSmokeGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);
    expect(tracker.snapshot()[0]!.thrower).toBeUndefined();
  });

  it("returns undefined thrower when handle resolves to a non-CCSPlayer entity", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    const otherEnt = makeEntity({
      id: 5,
      className: "CWorldEntity",
      serialNumber: 1,
      props: {},
    });
    fake.setEntities(new Map([[5, otherEnt]]));
    fake.setPlayers([]);

    const ent = makeEntity({
      id: 60,
      className: "CSmokeGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: makeHandle(5, 1),
      },
    });
    fake.emitCreated(ent);
    expect(tracker.snapshot()[0]!.thrower).toBeUndefined();
  });

  it("entity deletion finalizes the trajectory without a detonation", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    fake.setTick(1);
    const ent = makeEntity({
      id: 90,
      className: "CSmokeGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);
    fake.setTick(50);
    fake.emitDeleted(ent);

    const snap = tracker.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]!.detonationPosition).toBeUndefined();
    expect(snap[0]!.detonationTick).toBeUndefined();
  });

  it("snapshot returns frozen records with frozen trajectory arrays", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    const ent = makeEntity({
      id: 91,
      className: "CSmokeGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(ent);

    const snap = tracker.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap[0])).toBe(true);
    expect(Object.isFrozen(snap[0]!.trajectory)).toBe(true);
    expect(Object.isFrozen(snap[0]!.trajectory[0])).toBe(true);
  });

  it("tracks multiple grenades independently", () => {
    const tracker = new GrenadeTrajectoryTracker();
    const fake = makeFakeParser();
    tracker.attach(fake.asParser);

    const a = makeEntity({
      id: 1,
      className: "CSmokeGrenadeProjectile",
      props: {
        m_vecOrigin: { x: 0, y: 0, z: 0 },
        m_hThrower: 0xffffffff,
      },
    });
    const b = makeEntity({
      id: 2,
      className: "CDecoyProjectile",
      props: {
        m_vecOrigin: { x: 100, y: 100, z: 100 },
        m_hThrower: 0xffffffff,
      },
    });
    fake.emitCreated(a);
    fake.emitCreated(b);

    fake.emitGameEvent("smokegrenade_detonate", {
      entityid: 1,
      x: 1,
      y: 1,
      z: 1,
    });
    fake.emitGameEvent("decoy_detonate", {
      entityid: 2,
      x: 2,
      y: 2,
      z: 2,
    });

    const snap = tracker.snapshot();
    expect(snap).toHaveLength(2);
    const types = snap.map((s) => s.type).sort();
    expect(types).toEqual(["decoy", "smoke"]);
  });
});
