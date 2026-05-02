import { describe, it, expect } from "vitest";
import { Team } from "../../../src/state/Team.js";
import type { Entity } from "../../../src/entities/Entity.js";

/**
 * Required prop entries (varName + sourceTableName) the Team overlay
 * resolves on construction. Order matches the actual flattened-prop layout
 * the parser produces for `CCSTeam` on the de_nuke fixture (DT_Team-only;
 * no inheritance).
 *
 * Indices below are the positions Team resolves to in this layout —
 * tests use them to drive the in-memory store.
 */
interface FakeProp {
  varName: string;
  sourceTableName: string;
}

const REQUIRED_PROPS: readonly FakeProp[] = [
  { varName: "m_iTeamNum", sourceTableName: "DT_Team" }, // 0
  { varName: "m_bSurrendered", sourceTableName: "DT_Team" }, // 1
  { varName: "m_scoreTotal", sourceTableName: "DT_Team" }, // 2
  { varName: "m_scoreFirstHalf", sourceTableName: "DT_Team" }, // 3
  { varName: "m_scoreSecondHalf", sourceTableName: "DT_Team" }, // 4
  { varName: "m_scoreOvertime", sourceTableName: "DT_Team" }, // 5
  { varName: "m_iClanID", sourceTableName: "DT_Team" }, // 6
  { varName: "m_szTeamname", sourceTableName: "DT_Team" }, // 7
  { varName: "m_szClanTeamname", sourceTableName: "DT_Team" }, // 8
  { varName: "m_szTeamFlagImage", sourceTableName: "DT_Team" }, // 9
  { varName: "m_szTeamLogoImage", sourceTableName: "DT_Team" }, // 10
  { varName: "m_szTeamMatchStat", sourceTableName: "DT_Team" }, // 11
  { varName: "m_numMapVictories", sourceTableName: "DT_Team" }, // 12
  // The runtime varName for the player-array prop literally contains the
  // surrounding quote characters — `\"player_array\"` — that's how the
  // ts-proto decode preserves it from the wire schema. The overlay resolves
  // by exact-match on this oddly-quoted name.
  { varName: '"player_array"', sourceTableName: "DT_Team" }, // 13
];

/**
 * Fake Entity backed by an in-memory `Map<index, value>`. Mirrors the
 * surface Team touches (`serverClass.flattenedProps`, `store.read`,
 * `storageSlot`, `serverClass.className`) — nothing more.
 */
function makeFakeEntity(
  props: readonly FakeProp[],
  values: ReadonlyMap<number, unknown>,
  className = "CCSTeam",
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

describe("Team overlay — construction", () => {
  it("resolves all required prop indices without throwing", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    expect(() => new Team(entity)).not.toThrow();
  });

  it.each(REQUIRED_PROPS.map((p) => p.varName))(
    'throws a clear error when prop "%s" is missing from the schema',
    (missing) => {
      const present = REQUIRED_PROPS.filter((p) => p.varName !== missing);
      const entity = makeFakeEntity(present, new Map());
      expect(() => new Team(entity)).toThrow(
        new RegExp(
          `Team overlay: prop "${missing.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          )}".* not in CCSTeam schema`,
        ),
      );
    },
  );
});

describe("Team overlay — primitive getters", () => {
  it("returns team / score / scoreFirstHalf / scoreSecondHalf / scoreOvertime / clanId / numMapVictories as numbers", () => {
    const values = new Map<number, unknown>([
      [0, 3], // m_iTeamNum → CT
      [2, 16], // m_scoreTotal
      [3, 9], // m_scoreFirstHalf
      [4, 7], // m_scoreSecondHalf
      [5, 0], // m_scoreOvertime
      [6, 12345], // m_iClanID
      [12, 2], // m_numMapVictories
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const team = new Team(entity);
    expect(team.team).toBe(3);
    expect(team.score).toBe(16);
    expect(team.scoreFirstHalf).toBe(9);
    expect(team.scoreSecondHalf).toBe(7);
    expect(team.scoreOvertime).toBe(0);
    expect(team.clanId).toBe(12345);
    expect(team.numMapVictories).toBe(2);
  });

  it("returns 0 for never-written numeric props (read returns undefined)", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const team = new Team(entity);
    expect(team.team).toBe(0);
    expect(team.score).toBe(0);
    expect(team.scoreFirstHalf).toBe(0);
    expect(team.scoreSecondHalf).toBe(0);
    expect(team.scoreOvertime).toBe(0);
    expect(team.clanId).toBe(0);
    expect(team.numMapVictories).toBe(0);
  });

  it("re-reads the underlying store on every getter call (live view)", () => {
    const values = new Map<number, unknown>([[2, 5]]); // m_scoreTotal
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const team = new Team(entity);
    expect(team.score).toBe(5);
    values.set(2, 14);
    expect(team.score).toBe(14);
  });
});

describe("Team overlay — surrendered (boolean derivation)", () => {
  it("maps m_bSurrendered=0 to false and =1 to true", () => {
    const values = new Map<number, unknown>([[1, 0]]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    expect(new Team(entity).surrendered).toBe(false);

    const values2 = new Map<number, unknown>([[1, 1]]);
    const entity2 = makeFakeEntity(REQUIRED_PROPS, values2);
    expect(new Team(entity2).surrendered).toBe(true);
  });

  it("treats a never-written m_bSurrendered as false (default zero)", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    expect(new Team(entity).surrendered).toBe(false);
  });
});

describe("Team overlay — string getters", () => {
  it("returns name / clanName / flagImage / logoImage / matchStat from the underlying store", () => {
    const values = new Map<number, unknown>([
      [7, "TERRORIST"],
      [8, "FaZe"],
      [9, "flag.png"],
      [10, "logo.png"],
      [11, "stat-string"],
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const team = new Team(entity);
    expect(team.name).toBe("TERRORIST");
    expect(team.clanName).toBe("FaZe");
    expect(team.flagImage).toBe("flag.png");
    expect(team.logoImage).toBe("logo.png");
    expect(team.matchStat).toBe("stat-string");
  });

  it('returns "" for never-written string props', () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const team = new Team(entity);
    expect(team.name).toBe("");
    expect(team.clanName).toBe("");
    expect(team.flagImage).toBe("");
    expect(team.logoImage).toBe("");
    expect(team.matchStat).toBe("");
  });
});

describe("Team overlay — playerSlots", () => {
  it("returns the underlying entity-id array as a frozen number[]", () => {
    const values = new Map<number, unknown>([[13, [5, 6, 7]]]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const team = new Team(entity);
    expect(team.playerSlots).toEqual([5, 6, 7]);
    expect(Object.isFrozen(team.playerSlots)).toBe(true);
  });

  it("returns an empty frozen array when the prop is never written", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const team = new Team(entity);
    expect(team.playerSlots).toEqual([]);
    expect(Object.isFrozen(team.playerSlots)).toBe(true);
  });

  it("returns an empty frozen array when the prop is the empty array", () => {
    const values = new Map<number, unknown>([[13, []]]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const team = new Team(entity);
    expect(team.playerSlots).toEqual([]);
  });
});

describe("Team overlay — snapshot()", () => {
  it("returns a frozen object carrying every field at call time", () => {
    const values = new Map<number, unknown>([
      [0, 2], // team T
      [1, 0], // not surrendered
      [2, 16], // score
      [3, 9],
      [4, 7],
      [5, 0],
      [6, 99],
      [7, "TERRORIST"],
      [8, "ClanT"],
      [9, "f.png"],
      [10, "l.png"],
      [11, "stat"],
      [12, 1],
      [13, [5, 6, 7]],
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const team = new Team(entity);
    const snap = team.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(snap).toEqual({
      team: 2,
      surrendered: false,
      score: 16,
      scoreFirstHalf: 9,
      scoreSecondHalf: 7,
      scoreOvertime: 0,
      clanId: 99,
      name: "TERRORIST",
      clanName: "ClanT",
      flagImage: "f.png",
      logoImage: "l.png",
      matchStat: "stat",
      numMapVictories: 1,
      playerSlots: [5, 6, 7],
    });
  });

  it("freezes the snapshot at call time — later store mutations don't leak in", () => {
    const values = new Map<number, unknown>([[2, 10]]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const team = new Team(entity);
    const snap = team.snapshot();
    values.set(2, 20);
    expect(snap.score).toBe(10);
    expect(team.score).toBe(20); // live view still reflects current
  });
});
