import { describe, it, expect } from "vitest";
import { Player } from "../../../src/state/Player.js";
import type { Entity } from "../../../src/entities/Entity.js";
import type { UserInfoIndex, UserInfo } from "../../../src/state/userInfoIndex.js";

/**
 * Required prop entries (varName + sourceTableName) the Player overlay
 * resolves on construction. The two `m_vecOrigin` rows mirror the real
 * CCSPlayer schema where the prop appears once under each *Exclusive
 * subtable; the constructor disambiguates by `sourceTableName`.
 *
 * Indices below are the positions Player resolves to in this layout —
 * tests use them to drive the in-memory store.
 */
interface FakeProp {
  varName: string;
  sourceTableName: string;
}

const REQUIRED_PROPS: readonly FakeProp[] = [
  { varName: "m_iTeamNum", sourceTableName: "DT_BaseEntity" },
  { varName: "m_iHealth", sourceTableName: "DT_BasePlayer" },
  { varName: "m_iAccount", sourceTableName: "DT_CSPlayer" },
  // Local pair (POV) — emitted first so the constructor's
  // non-local-preferred lookup must skip past these to the non-local pair.
  { varName: "m_vecOrigin", sourceTableName: "DT_CSLocalPlayerExclusive" },
  { varName: "m_vecOrigin[2]", sourceTableName: "DT_CSLocalPlayerExclusive" },
  // Non-local pair (GOTV / general) — preferred at construction time.
  { varName: "m_vecOrigin", sourceTableName: "DT_CSNonLocalPlayerExclusive" },
  { varName: "m_vecOrigin[2]", sourceTableName: "DT_CSNonLocalPlayerExclusive" },
  { varName: "m_angEyeAngles[0]", sourceTableName: "DT_CSPlayer" },
  { varName: "m_angEyeAngles[1]", sourceTableName: "DT_CSPlayer" },
  { varName: "m_lifeState", sourceTableName: "DT_BasePlayer" },
  { varName: "m_hActiveWeapon", sourceTableName: "DT_BaseCombatCharacter" },
];

// Indices the Player constructor resolves to, given the layout above:
//   0 m_iTeamNum
//   1 m_iHealth
//   2 m_iAccount
//   3 m_vecOrigin   (LOCAL XY)
//   4 m_vecOrigin[2] (LOCAL Z)
//   5 m_vecOrigin   (NON-LOCAL XY)  ← originXyIdx
//   6 m_vecOrigin[2] (NON-LOCAL Z)  ← originZIdx
//   7 m_angEyeAngles[0] (pitch)
//   8 m_angEyeAngles[1] (yaw)
//   9 m_lifeState
//  10 m_hActiveWeapon

/**
 * Fake Entity backed by an in-memory `Map<index, value>`. Mirrors the
 * surface Player touches (`serverClass.flattenedProps`, `store.read`,
 * `storageSlot`) — nothing more.
 */
function makeFakeEntity(
  props: readonly FakeProp[],
  values: ReadonlyMap<number, unknown>,
  className = "CCSPlayer",
): Entity {
  const flattenedProps = props.map((p) => ({
    prop: { varName: p.varName },
    sourceTableName: p.sourceTableName,
  }));
  return {
    serverClass: { className, flattenedProps },
    storageSlot: 0,
    store: {
      read: (_slot: number, idx: number) => values.get(idx),
    },
  } as unknown as Entity;
}

describe("Player overlay — construction", () => {
  it("resolves all required prop indices without throwing", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    expect(() => new Player(7, entity)).not.toThrow();
  });

  it("exposes the slot it was constructed with", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const player = new Player(7, entity);
    expect(player.slot).toBe(7);
  });

  // For the no-fallback-needed props, drop each one in turn and expect a
  // throw naming it. The `m_vecOrigin*` props have non-local/local fallback
  // semantics, so they need their own targeted misses (below).
  const ALWAYS_REQUIRED = REQUIRED_PROPS.filter(
    (p) => !p.varName.startsWith("m_vecOrigin"),
  );

  it.each(ALWAYS_REQUIRED.map((p) => p.varName))(
    'throws a clear error when prop "%s" is missing from the schema',
    (missing) => {
      const present = REQUIRED_PROPS.filter((p) => p.varName !== missing);
      const entity = makeFakeEntity(present, new Map());
      expect(() => new Player(0, entity)).toThrow(
        new RegExp(
          `Player overlay: prop "${missing.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          )}".* not in CCSPlayer schema`,
        ),
      );
    },
  );

  it("throws when BOTH non-local and local m_vecOrigin are absent", () => {
    const present = REQUIRED_PROPS.filter((p) => p.varName !== "m_vecOrigin");
    const entity = makeFakeEntity(present, new Map());
    expect(() => new Player(0, entity)).toThrow(
      /m_vecOrigin.* not in CCSPlayer schema/,
    );
  });

  it("throws when BOTH non-local and local m_vecOrigin[2] are absent", () => {
    const present = REQUIRED_PROPS.filter((p) => p.varName !== "m_vecOrigin[2]");
    const entity = makeFakeEntity(present, new Map());
    expect(() => new Player(0, entity)).toThrow(
      /m_vecOrigin\[2\].* not in CCSPlayer schema/,
    );
  });

  it("falls back to local origin when only the local pair is present", () => {
    // Only LOCAL pair present, NON-LOCAL pair missing.
    const present = REQUIRED_PROPS.filter(
      (p) =>
        !(
          p.varName.startsWith("m_vecOrigin") &&
          p.sourceTableName === "DT_CSNonLocalPlayerExclusive"
        ),
    );
    const entity = makeFakeEntity(present, new Map());
    expect(() => new Player(0, entity)).not.toThrow();
  });
});

describe("Player overlay — primitive getters", () => {
  it("returns team / health / money as numbers from the underlying store", () => {
    const values = new Map<number, unknown>([
      [0, 3], // m_iTeamNum → CT
      [1, 87], // m_iHealth
      [2, 1650], // m_iAccount
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const player = new Player(0, entity);
    expect(player.team).toBe(3);
    expect(player.health).toBe(87);
    expect(player.money).toBe(1650);
  });

  it("returns 0 for never-written props (read returns undefined)", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const player = new Player(0, entity);
    expect(player.team).toBe(0);
    expect(player.health).toBe(0);
    expect(player.money).toBe(0);
    expect(player.activeWeaponHandle).toBe(0);
  });

  it("re-reads the underlying store on every getter call (live view)", () => {
    const values = new Map<number, unknown>([[1, 100]]); // m_iHealth
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const player = new Player(0, entity);
    expect(player.health).toBe(100);
    values.set(1, 42);
    expect(player.health).toBe(42);
  });

  it("returns the raw m_hActiveWeapon as a plain number, no resolution", () => {
    const values = new Map<number, unknown>([[10, 0xabcdef]]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const player = new Player(0, entity);
    expect(player.activeWeaponHandle).toBe(0xabcdef);
  });
});

describe("Player overlay — isAlive (lifeState mapping)", () => {
  it.each([
    [0, true], // LIFE_ALIVE
    [1, false], // LIFE_DYING
    [2, false], // LIFE_DEAD
    [3, false], // LIFE_RESPAWNABLE
  ])("maps m_lifeState=%i to isAlive=%s", (lifeState, expected) => {
    const values = new Map<number, unknown>([[9, lifeState]]); // m_lifeState
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const player = new Player(0, entity);
    expect(player.isAlive).toBe(expected);
  });

  it("treats a never-written m_lifeState as alive (default zero)", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const player = new Player(0, entity);
    expect(player.isAlive).toBe(true);
  });
});

describe("Player overlay — position", () => {
  it("reads the non-local pair when both pairs are present", () => {
    // Local pair populated with sentinel values that should NOT be returned.
    const values = new Map<number, unknown>([
      [3, { x: -1, y: -1 }], // LOCAL XY (must be ignored)
      [4, -1], // LOCAL Z (must be ignored)
      [5, { x: 100, y: 200 }], // NON-LOCAL XY ← read this
      [6, 64], // NON-LOCAL Z   ← read this
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const player = new Player(0, entity);
    expect(player.position).toEqual({ x: 100, y: 200, z: 64 });
  });

  it("falls back to local pair when only it is present in the schema (POV path)", () => {
    // Drop the non-local pair entirely; constructor must fall back.
    const present = REQUIRED_PROPS.filter(
      (p) =>
        !(
          p.varName.startsWith("m_vecOrigin") &&
          p.sourceTableName === "DT_CSNonLocalPlayerExclusive"
        ),
    );
    const values = new Map<number, unknown>([
      [3, { x: -512, y: 768 }], // LOCAL XY (now the only XY → originXyIdx === 3)
      [4, 32], // LOCAL Z
    ]);
    const entity = makeFakeEntity(present, values);
    const player = new Player(0, entity);
    expect(player.position).toEqual({ x: -512, y: 768, z: 32 });
  });

  it("returns a frozen Vector3", () => {
    const values = new Map<number, unknown>([
      [5, { x: 1, y: 2 }],
      [6, 3],
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const player = new Player(0, entity);
    const pos = player.position;
    expect(Object.isFrozen(pos)).toBe(true);
  });

  it("returns a zero vector when the origin pair is not populated", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const player = new Player(0, entity);
    expect(player.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("Player overlay — viewAngle", () => {
  it("maps m_angEyeAngles[0] to pitch and [1] to yaw (Source convention)", () => {
    const values = new Map<number, unknown>([
      [7, -12.5], // m_angEyeAngles[0] → pitch
      [8, 87.25], // m_angEyeAngles[1] → yaw
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const player = new Player(0, entity);
    expect(player.viewAngle).toEqual({ yaw: 87.25, pitch: -12.5 });
  });

  it("returns a frozen ViewAngle", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const player = new Player(0, entity);
    expect(Object.isFrozen(player.viewAngle)).toBe(true);
  });
});

describe("Player overlay — snapshot()", () => {
  it("returns a frozen object carrying every field at call time", () => {
    const values = new Map<number, unknown>([
      [0, 2], // team T
      [1, 50], // health
      [2, 800], // money
      [5, { x: 10, y: 20 }], // non-local XY
      [6, 30], // non-local Z
      [7, -5], // pitch
      [8, 90], // yaw
      [9, 0], // lifeState ALIVE
      [10, 0x12345], // active weapon
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const player = new Player(4, entity);
    const snap = player.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(snap).toEqual({
      slot: 4,
      team: 2,
      health: 50,
      money: 800,
      position: { x: 10, y: 20, z: 30 },
      viewAngle: { yaw: 90, pitch: -5 },
      isAlive: true,
      activeWeaponHandle: 0x12345,
      name: undefined,
      steamId: undefined,
    });
  });

  it("freezes the snapshot at call time — later store mutations don't leak in", () => {
    const values = new Map<number, unknown>([[1, 100]]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const player = new Player(0, entity);
    const snap = player.snapshot();
    values.set(1, 1); // mutate underlying after snapshot
    expect(snap.health).toBe(100);
    expect(player.health).toBe(1); // live view still reflects current
  });
});

/**
 * Minimal `UserInfoIndex` stub. The Player overlay only ever calls
 * `userIdForEntitySlot` and `infoForUserId`, so the stub implements those
 * two methods over a pair of in-memory maps. Cast through `unknown` to
 * sidestep the production class's private fields without leaking `any`
 * into the test surface.
 */
function makeFakeUserInfoIndex(
  bySlot: ReadonlyMap<number, { userId: number; info: UserInfo }>,
): UserInfoIndex {
  const slotToUserId = new Map<number, number>();
  const userIdToInfo = new Map<number, UserInfo>();
  for (const [slot, { userId, info }] of bySlot) {
    slotToUserId.set(slot, userId);
    userIdToInfo.set(userId, info);
  }
  return {
    userIdForEntitySlot: (slot: number) => slotToUserId.get(slot),
    infoForUserId: (userId: number) => userIdToInfo.get(userId),
    entitySlotForUserId: (userId: number) => {
      for (const [slot, uid] of slotToUserId) {
        if (uid === userId) return slot;
      }
      return undefined;
    },
    refresh: () => undefined,
  } as unknown as UserInfoIndex;
}

describe("Player overlay — name / steamId (userinfo resolution)", () => {
  // Wire xuid for `STEAM_0:1:19867136` ⇄ `[U:1:39734273]` ⇄ `76561198000000001`.
  // Picked specifically because it round-trips through all three textual
  // forms, so the test asserts the full Steam64-string → SteamId pipeline,
  // not just an opaque BigInt comparison.
  const HUMAN_INFO: UserInfo = Object.freeze({
    name: "Brian",
    xuid: "76561198000000001",
    isFakePlayer: false,
    entitySlot: 0,
  });

  it("resolves name from userinfo via slot - 1 → userId → info.name", () => {
    // CSGO convention: Player.slot is 1-based entity id, userinfo table is
    // 0-indexed by entity slot. Slot 1 must therefore look up table index 0.
    const index = makeFakeUserInfoIndex(
      new Map([[0, { userId: 7, info: HUMAN_INFO }]]),
    );
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const player = new Player(1, entity, index);
    expect(player.name).toBe("Brian");
  });

  it("returns undefined when userinfo has no entry for this slot yet", () => {
    // Empty index models the in-tick race where the entity exists but the
    // userinfo string-table update hasn't fired yet for this slot.
    const index = makeFakeUserInfoIndex(new Map());
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const player = new Player(1, entity, index);
    expect(player.name).toBeUndefined();
    expect(player.steamId).toBeUndefined();
  });

  it("returns undefined for both getters when no userInfoIndex was supplied", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const player = new Player(1, entity);
    expect(player.name).toBeUndefined();
    expect(player.steamId).toBeUndefined();
  });

  it("steamId.toSteam64() round-trips through the wire xuid string", () => {
    const index = makeFakeUserInfoIndex(
      new Map([[0, { userId: 7, info: HUMAN_INFO }]]),
    );
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const player = new Player(1, entity, index);
    const steamId = player.steamId;
    expect(steamId).toBeDefined();
    expect(steamId!.toSteam64().toString()).toBe(HUMAN_INFO.xuid);
  });

  it("snapshot() captures resolved name and steamId at call time", () => {
    const index = makeFakeUserInfoIndex(
      new Map([[0, { userId: 7, info: HUMAN_INFO }]]),
    );
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const player = new Player(1, entity, index);
    const snap = player.snapshot();
    expect(snap.name).toBe("Brian");
    expect(snap.steamId?.toSteam64().toString()).toBe(HUMAN_INFO.xuid);
  });
});
