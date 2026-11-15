/**
 * Unit tests for `EventRecorder` — the plain-data bomb, grenade-effect and
 * hostage records. Driven by a fake parser so cs_ map hostage events (absent
 * from every bomb-map fixture) are covered too.
 */
import { describe, it, expect } from "vitest";
import { TypedEventEmitter } from "../../../src/events/TypedEventEmitter.js";
import { EventRecorder } from "../../../src/convenience/EventRecorder.js";
import type { ParserEventMap } from "../../../src/events/ParserEventMap.js";
import type { DemoParser } from "../../../src/DemoParser.js";
import type { Entity } from "../../../src/entities/Entity.js";
import type { Player } from "../../../src/state/Player.js";

function fakeEntity(
  id: number,
  className: string,
  props: Record<string, unknown>,
  serialNumber = 1,
): Entity {
  const names = Object.keys(props);
  return {
    id,
    serialNumber,
    state: "active",
    serverClass: {
      className,
      flattenedProps: names.map((varName) => ({ prop: { varName } })),
    },
    storageSlot: 0,
    store: { read: (_s: number, i: number) => props[names[i]!] },
    propByName: (name: string) => props[name],
  } as unknown as Entity;
}

function fakePlayer(slot: number, x: number, y: number): Player {
  return { slot, team: 3, position: { x, y, z: 0 } } as unknown as Player;
}

function setup() {
  const emitter = new TypedEventEmitter<ParserEventMap>();
  let tick = 0;
  const entities = new Map<number, Entity>();
  const players = [fakePlayer(1, 100, 200), fakePlayer(2, -500, 900)];
  Object.defineProperty(emitter, "currentTick", { get: () => tick });
  const parser = Object.assign(emitter, {
    players,
    entities: {
      get: (id: number) => entities.get(id),
      *entries() {
        yield* entities.entries();
      },
    },
    userInfoIndex: {
      // user id = entity id + 10 (entity id = table slot + 1)
      entitySlotForUserId: (userId: number) => userId - 11,
      userIdForEntitySlot: (slot: number) => slot + 11,
      infoForUserId: (userId: number) => ({
        name: `user${userId}`,
        xuid: `7656119800000${userId}`,
        isFakePlayer: false,
      }),
    },
  }) as unknown as DemoParser;
  const recorder = new EventRecorder();
  recorder.attach(parser);
  const game = (name: string, data: Record<string, number | boolean>) =>
    emitter.emit("gameEvent", { name, eventId: 0, data });
  return {
    recorder,
    game,
    entities,
    emitter,
    setTick: (t: number) => (tick = t),
  };
}

describe("EventRecorder", () => {
  it("records hostage events at the hostage entity's world position", () => {
    const { recorder, game, entities, setTick } = setup();
    entities.set(
      300,
      fakeEntity(300, "CHostage", {
        m_cellbits: 5,
        m_cellX: 512,
        m_cellY: 512,
        m_cellZ: 512,
        m_vecOrigin: { x: 10, y: 20, z: 5 },
      }),
    );
    setTick(50);
    game("hostage_follows", { userid: 11, hostage: 300 });
    setTick(90);
    game("hostage_rescued", { userid: 11, hostage: 300, site: 0 });
    game("hostage_rescued_all", {});

    expect(recorder.hostageEvents.map((h) => [h.type, h.tick])).toEqual([
      ["follows", 50],
      ["rescued", 90],
      ["rescued_all", 90],
    ]);
    const follows = recorder.hostageEvents[0]!;
    expect(follows.player?.slot).toBe(1);
    expect(follows.hostageEntityIndex).toBe(300);
    expect(follows.position).toEqual({ x: 10, y: 20, z: 5 });
    // No hostage entity, no player: no position.
    expect(recorder.hostageEvents[2]!.position).toBeUndefined();
  });

  it("falls back to the player's position when the hostage entity is gone", () => {
    const { recorder, game } = setup();
    game("hostage_hurt", { userid: 12, hostage: 999 });
    expect(recorder.hostageEvents[0]!.position).toEqual({ x: -500, y: 900, z: 0 });
  });

  it("resolves bombsites by the nearest CCSPlayerResource centre", () => {
    const { recorder, game, entities } = setup();
    entities.set(
      70,
      fakeEntity(70, "CCSPlayerResource", {
        m_bombsiteCenterA: { x: 120, y: 180, z: 0 },
        m_bombsiteCenterB: { x: -400, y: 1000, z: 0 },
      }),
    );
    game("bomb_planted", { userid: 12, site: 455 });
    game("bomb_begindefuse", { userid: 11, haskit: true });
    game("bomb_defused", { userid: 11, site: 455 });

    const [planted, beginDefuse, defused] = recorder.bomb;
    expect(planted!.site).toBe("B");
    expect(planted!.position).toEqual({ x: -500, y: 900, z: 0 });
    // Defuse steps happen at the bomb, not where the defuser stands.
    expect(beginDefuse!.position).toEqual({ x: -500, y: 900, z: 0 });
    expect(beginDefuse!.hasKit).toBe(true);
    expect(defused!.player?.slot).toBe(1);
    expect(defused!.site).toBe("B");
  });

  it("pairs smoke start/end by entity id and closes leftovers at round start", () => {
    const { recorder, game, emitter, setTick } = setup();
    setTick(10);
    game("smokegrenade_detonate", { userid: 12, entityid: 400, x: 1, y: 2, z: 3 });
    game("smokegrenade_detonate", { userid: 12, entityid: 401, x: 4, y: 5, z: 6 });
    setTick(20);
    game("smokegrenade_expired", { userid: 12, entityid: 400, x: 1, y: 2, z: 3 });
    game("flashbang_detonate", { userid: 12, entityid: 402, x: 7, y: 8, z: 9 });
    setTick(30);
    emitter.emit("round_start", {
      eventName: "round_start",
      eventId: 0,
      timeLimit: 115,
      fragLimit: 0,
      objective: "",
      roundNumber: 1,
    });

    expect(
      recorder.grenadeEffects().map((e) => [e.type, e.entityIndex, e.startTick, e.endTick]),
    ).toEqual([
      ["smoke", 400, 10, 20],
      ["smoke", 401, 10, 30],
      ["flash", 402, 20, 20],
    ]);
    expect(recorder.grenadeEffects()[2]!.thrower?.slot).toBe(2);
  });

  it("attributes an inferno to the CInferno owner", () => {
    const { recorder, game, entities } = setup();
    const owner = fakeEntity(2, "CCSPlayer", {}, 1);
    entities.set(2, owner);
    // m_hOwnerEntity: serial 1 << 11 | index 2
    entities.set(500, fakeEntity(500, "CInferno", { m_hOwnerEntity: (1 << 11) | 2 }));
    game("inferno_startburn", { entityid: 500, x: 1, y: 1, z: 1 });
    expect(recorder.grenadeEffects()[0]!.thrower?.slot).toBe(2);
  });
});
