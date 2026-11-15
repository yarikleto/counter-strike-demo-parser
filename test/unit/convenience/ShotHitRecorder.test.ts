/**
 * Unit tests for `ShotRecorder` and `HitRecorder` — the columnar
 * `DemoResult.shots` / `DemoResult.hits`. Driven by a fake parser emitting
 * the enriched `weapon_fire` / `player_hurt` events.
 */
import { describe, it, expect } from "vitest";
import { TypedEventEmitter } from "../../../src/events/TypedEventEmitter.js";
import {
  ShotRecorder,
  ShotFlags,
  ShotKind,
  shotBuffers,
  shotKind,
} from "../../../src/convenience/ShotRecorder.js";
import { HitRecorder, NO_PLAYER, hitBuffers } from "../../../src/convenience/HitRecorder.js";
import type { ParserEventMap } from "../../../src/events/ParserEventMap.js";
import type { DemoParser } from "../../../src/DemoParser.js";
import type { Player } from "../../../src/state/Player.js";

function fakePlayer(slot: number, x: number, y: number, z = 0, yaw = 0, pitch = 0): Player {
  return {
    slot,
    team: slot % 2 === 0 ? 2 : 3,
    position: { x, y, z },
    viewAngle: { yaw, pitch },
  } as unknown as Player;
}

function setup() {
  const emitter = new TypedEventEmitter<ParserEventMap>();
  let tick = 0;
  Object.defineProperty(emitter, "currentTick", { get: () => tick });
  const parser = Object.assign(emitter, {
    players: [],
    userInfoIndex: {
      // user id = table slot + 11 (entity id = table slot + 1)
      entitySlotForUserId: (userId: number) => userId - 11,
      userIdForEntitySlot: (slot: number) => slot + 11,
      infoForUserId: (userId: number) => ({
        name: `user${userId}`,
        xuid: `7656119800000${userId}`,
        isFakePlayer: false,
      }),
    },
  }) as unknown as DemoParser;
  const shots = new ShotRecorder(2); // tiny capacity: exercise growth
  shots.attach(parser);
  const hits = new HitRecorder(2);
  hits.attach(parser);
  return { emitter, shots, hits, setTick: (t: number) => (tick = t) };
}

function fire(
  emitter: TypedEventEmitter<ParserEventMap>,
  player: Player,
  weapon: string,
  silenced = false,
) {
  emitter.emit("weapon_fire", { eventName: "weapon_fire", eventId: 1, player, weapon, silenced });
}

describe("shotKind", () => {
  it("classifies guns, knives, grenades and other items", () => {
    for (const w of ["ak47", "awp", "m4a1_silencer", "taser", "glock"]) {
      expect(shotKind(w), w).toBe(ShotKind.Bullet);
    }
    for (const w of ["knife", "knife_t", "knife_karambit", "bayonet", "fists", "axe"]) {
      expect(shotKind(w), w).toBe(ShotKind.Knife);
    }
    for (const w of ["hegrenade", "flashbang", "smokegrenade", "molotov", "incgrenade", "decoy"]) {
      expect(shotKind(w), w).toBe(ShotKind.Grenade);
    }
    for (const w of ["c4", "healthshot"]) expect(shotKind(w), w).toBe(ShotKind.Other);
  });
});

describe("ShotRecorder", () => {
  it("records one row per weapon_fire with tick, shooter, pose, weapon and flags", () => {
    const { emitter, shots, setTick } = setup();
    const a = fakePlayer(1, 100, 200, 10, 90, -5);
    const b = fakePlayer(2, -50, 60, 0, 270, 12);
    setTick(100);
    fire(emitter, a, "weapon_ak47");
    setTick(101);
    fire(emitter, b, "weapon_m4a1_silencer", true);
    fire(emitter, a, "weapon_knife_t");
    setTick(140);
    fire(emitter, a, "weapon_hegrenade");
    fire(emitter, a, "weapon_ak47");

    const s = shots.snapshot();
    expect(s.length).toBe(5);
    expect([...s.tick]).toEqual([100, 101, 101, 140, 140]);
    expect([...s.player]).toEqual([0, 1, 0, 0, 0]);
    expect(s.weapons).toEqual(["ak47", "m4a1_silencer", "knife_t", "hegrenade"]);
    expect([...s.weapon].map((w) => s.weapons[w])).toEqual([
      "ak47",
      "m4a1_silencer",
      "knife_t",
      "hegrenade",
      "ak47",
    ]);
    expect([...s.kind]).toEqual([
      ShotKind.Bullet,
      ShotKind.Bullet,
      ShotKind.Knife,
      ShotKind.Grenade,
      ShotKind.Bullet,
    ]);
    expect([...s.flags]).toEqual([0, ShotFlags.Silenced, 0, 0, 0]);
    expect([s.x[0], s.y[0], s.z[0], s.yaw[0], s.pitch[0]]).toEqual([100, 200, 10, 90, -5]);
    expect([s.x[1], s.y[1], s.z[1], s.yaw[1], s.pitch[1]]).toEqual([-50, 60, 0, 270, 12]);
  });

  it("returns right-sized columns that each own their buffer", () => {
    const { emitter, shots } = setup();
    const a = fakePlayer(1, 0, 0);
    for (let i = 0; i < 5; i++) fire(emitter, a, "weapon_glock");
    const s = shots.snapshot();
    const buffers = shotBuffers(s);
    expect(buffers).toHaveLength(10);
    expect(new Set(buffers).size).toBe(10);
    for (const column of [s.tick, s.player, s.x, s.y, s.z, s.yaw, s.pitch, s.weapon]) {
      expect(column.length).toBe(5);
      expect(column.byteLength).toBe(column.buffer.byteLength);
    }
  });

  it("is empty before any shot", () => {
    const { shots } = setup();
    const s = shots.snapshot();
    expect(s.length).toBe(0);
    expect(s.weapons).toEqual([]);
    expect(s.tick.length).toBe(0);
  });
});

describe("HitRecorder", () => {
  it("records one row per player_hurt with both players and their positions", () => {
    const { emitter, hits, setTick } = setup();
    const attacker = fakePlayer(1, 100, 200, 10);
    const victim = fakePlayer(2, 300, 400, 20);
    setTick(500);
    emitter.emit("player_hurt", {
      eventName: "player_hurt",
      eventId: 2,
      attacker,
      victim,
      weapon: "ak47",
      damage: 27,
      damageArmor: 4,
      hitGroup: 2,
      healthRemaining: 73,
      armorRemaining: 96,
    });
    setTick(510);
    // World damage (fall): no attacker.
    emitter.emit("player_hurt", {
      eventName: "player_hurt",
      eventId: 2,
      attacker: undefined,
      victim,
      weapon: "",
      damage: 300,
      damageArmor: 0,
      hitGroup: 0,
      healthRemaining: 0,
      armorRemaining: 96,
    });

    const h = hits.snapshot();
    expect(h.length).toBe(2);
    expect([...h.tick]).toEqual([500, 510]);
    expect([...h.attacker]).toEqual([1, NO_PLAYER]);
    expect([...h.victim]).toEqual([0, 0]);
    expect(h.weapons).toEqual(["ak47", ""]);
    expect([...h.weapon]).toEqual([0, 1]);
    expect([...h.damage]).toEqual([27, 300]);
    expect([...h.armorDamage]).toEqual([4, 0]);
    expect([...h.hitGroup]).toEqual([2, 0]);
    expect([...h.health]).toEqual([73, 0]);
    expect([...h.armor]).toEqual([96, 96]);
    expect([h.attackerX[0], h.attackerY[0], h.attackerZ[0]]).toEqual([100, 200, 10]);
    expect([h.victimX[0], h.victimY[0], h.victimZ[0]]).toEqual([300, 400, 20]);
    expect(Number.isNaN(h.attackerX[1])).toBe(true);
    expect(Number.isNaN(h.attackerY[1])).toBe(true);
    expect(Number.isNaN(h.attackerZ[1])).toBe(true);
    expect([h.victimX[1], h.victimY[1], h.victimZ[1]]).toEqual([300, 400, 20]);

    const buffers = hitBuffers(h);
    expect(buffers).toHaveLength(15);
    expect(new Set(buffers).size).toBe(15);
  });
});
