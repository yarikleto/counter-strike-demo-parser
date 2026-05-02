import { describe, it, expect } from "vitest";
import { GameRules } from "../../../src/state/GameRules.js";
import type { Entity } from "../../../src/entities/Entity.js";

/**
 * Required prop entries (varName + sourceTableName) the GameRules overlay
 * resolves on construction. Mirrors the real CCSGameRulesProxy schema:
 *
 *   - All of these scalar props live under `DT_CSGameRules` (the sub-table
 *     reached by walking from the proxy class).
 *   - `m_iBombSite` is the lone exception: it lives under
 *     `DT_RetakeGameRules`, a different sub-table emitted by the proxy.
 *
 * The GameRules constructor threads `sourceTableName` through `findIdx` to
 * disambiguate, exactly like Player does for the local/non-local origin
 * split. That gives us a single canonical rule (always specify the table)
 * and lets future props with the same varName under different sub-tables
 * resolve correctly without code change.
 */
interface FakeProp {
  varName: string;
  sourceTableName: string;
}

const REQUIRED_PROPS: readonly FakeProp[] = [
  { varName: "m_iRoundTime", sourceTableName: "DT_CSGameRules" },
  { varName: "m_totalRoundsPlayed", sourceTableName: "DT_CSGameRules" },
  { varName: "m_gamePhase", sourceTableName: "DT_CSGameRules" },
  { varName: "m_nOvertimePlaying", sourceTableName: "DT_CSGameRules" },
  { varName: "m_fRoundStartTime", sourceTableName: "DT_CSGameRules" },
  { varName: "m_flRestartRoundTime", sourceTableName: "DT_CSGameRules" },
  { varName: "m_fMatchStartTime", sourceTableName: "DT_CSGameRules" },
  { varName: "m_bWarmupPeriod", sourceTableName: "DT_CSGameRules" },
  { varName: "m_bFreezePeriod", sourceTableName: "DT_CSGameRules" },
  { varName: "m_bBombPlanted", sourceTableName: "DT_CSGameRules" },
  { varName: "m_bBombDropped", sourceTableName: "DT_CSGameRules" },
  { varName: "m_bHasMatchStarted", sourceTableName: "DT_CSGameRules" },
  { varName: "m_iRoundWinStatus", sourceTableName: "DT_CSGameRules" },
  { varName: "m_eRoundWinReason", sourceTableName: "DT_CSGameRules" },
  { varName: "m_iBombSite", sourceTableName: "DT_RetakeGameRules" },
];

// Indices the constructor resolves to, given the layout above:
//   0 m_iRoundTime
//   1 m_totalRoundsPlayed
//   2 m_gamePhase
//   3 m_nOvertimePlaying
//   4 m_fRoundStartTime
//   5 m_flRestartRoundTime
//   6 m_fMatchStartTime
//   7 m_bWarmupPeriod
//   8 m_bFreezePeriod
//   9 m_bBombPlanted
//  10 m_bBombDropped
//  11 m_bHasMatchStarted
//  12 m_iRoundWinStatus
//  13 m_eRoundWinReason
//  14 m_iBombSite

function makeFakeEntity(
  props: readonly FakeProp[],
  values: ReadonlyMap<number, unknown>,
  className = "CCSGameRulesProxy",
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

describe("GameRules overlay — construction", () => {
  it("resolves all required prop indices without throwing", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    expect(() => new GameRules(entity)).not.toThrow();
  });

  it.each(REQUIRED_PROPS.map((p) => p.varName))(
    'throws a clear error when prop "%s" is missing from the schema',
    (missing) => {
      const present = REQUIRED_PROPS.filter((p) => p.varName !== missing);
      const entity = makeFakeEntity(present, new Map());
      expect(() => new GameRules(entity)).toThrow(
        new RegExp(
          `GameRules overlay: prop "${missing.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          )}".* not in CCSGameRulesProxy schema`,
        ),
      );
    },
  );
});

describe("GameRules overlay — numeric getters", () => {
  it("returns roundTime / totalRoundsPlayed / gamePhase / overtimePlaying as numbers", () => {
    const values = new Map<number, unknown>([
      [0, 115], // m_iRoundTime
      [1, 30], // m_totalRoundsPlayed
      [2, 5], // m_gamePhase
      [3, 0], // m_nOvertimePlaying
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const gr = new GameRules(entity);
    expect(gr.roundTime).toBe(115);
    expect(gr.totalRoundsPlayed).toBe(30);
    expect(gr.gamePhase).toBe(5);
    expect(gr.overtimePlaying).toBe(0);
  });

  it("returns roundStartTime / restartRoundTime / matchStartTime as floats", () => {
    const values = new Map<number, unknown>([
      [4, 3022.4453125], // m_fRoundStartTime
      [5, 3089.9609375], // m_flRestartRoundTime
      [6, 410.1875], // m_fMatchStartTime
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const gr = new GameRules(entity);
    expect(gr.roundStartTime).toBeCloseTo(3022.4453125);
    expect(gr.restartRoundTime).toBeCloseTo(3089.9609375);
    expect(gr.matchStartTime).toBeCloseTo(410.1875);
  });

  it("returns roundWinStatus / roundWinReason as numbers", () => {
    const values = new Map<number, unknown>([
      [12, 2], // m_iRoundWinStatus → CT win
      [13, 9], // m_eRoundWinReason → enum 9
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const gr = new GameRules(entity);
    expect(gr.roundWinStatus).toBe(2);
    expect(gr.roundWinReason).toBe(9);
  });

  it("returns bombSite as a number, defaulting to 0 when absent on wire", () => {
    // m_iBombSite is on DT_RetakeGameRules and is typically undefined
    // outside Retake mode — confirm the default-to-0 path.
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const gr = new GameRules(entity);
    expect(gr.bombSite).toBe(0);
  });

  it("returns 0 for never-written numeric props", () => {
    const entity = makeFakeEntity(REQUIRED_PROPS, new Map());
    const gr = new GameRules(entity);
    expect(gr.roundTime).toBe(0);
    expect(gr.totalRoundsPlayed).toBe(0);
    expect(gr.gamePhase).toBe(0);
    expect(gr.roundStartTime).toBe(0);
  });

  it("re-reads the underlying store on every getter call (live view)", () => {
    const values = new Map<number, unknown>([[1, 10]]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const gr = new GameRules(entity);
    expect(gr.totalRoundsPlayed).toBe(10);
    values.set(1, 11);
    expect(gr.totalRoundsPlayed).toBe(11);
  });
});

describe("GameRules overlay — boolean getters", () => {
  it.each([
    ["isWarmup", 7],
    ["isFreezePeriod", 8],
    ["isBombPlanted", 9],
    ["isBombDropped", 10],
    ["hasMatchStarted", 11],
  ] as const)(
    "%s reads %i and maps non-zero to true, zero/undefined to false",
    (name, idx) => {
      const valuesTrue = new Map<number, unknown>([[idx, 1]]);
      const grTrue = new GameRules(makeFakeEntity(REQUIRED_PROPS, valuesTrue));
      expect(grTrue[name]).toBe(true);

      const valuesFalse = new Map<number, unknown>([[idx, 0]]);
      const grFalse = new GameRules(makeFakeEntity(REQUIRED_PROPS, valuesFalse));
      expect(grFalse[name]).toBe(false);

      const grAbsent = new GameRules(makeFakeEntity(REQUIRED_PROPS, new Map()));
      expect(grAbsent[name]).toBe(false);
    },
  );
});

describe("GameRules overlay — snapshot()", () => {
  it("returns a frozen object carrying every field at call time", () => {
    const values = new Map<number, unknown>([
      [0, 115], // roundTime
      [1, 12], // totalRoundsPlayed
      [2, 3], // gamePhase
      [3, 0], // overtimePlaying
      [4, 100.5], // roundStartTime
      [5, 200.5], // restartRoundTime
      [6, 50.0], // matchStartTime
      [7, 0], // isWarmup
      [8, 1], // isFreezePeriod
      [9, 1], // isBombPlanted
      [10, 0], // isBombDropped
      [11, 1], // hasMatchStarted
      [12, 1], // roundWinStatus
      [13, 7], // roundWinReason
      [14, 2], // bombSite
    ]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const gr = new GameRules(entity);
    const snap = gr.snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(snap).toEqual({
      roundTime: 115,
      totalRoundsPlayed: 12,
      gamePhase: 3,
      overtimePlaying: 0,
      roundStartTime: 100.5,
      restartRoundTime: 200.5,
      matchStartTime: 50.0,
      isWarmup: false,
      isFreezePeriod: true,
      isBombPlanted: true,
      isBombDropped: false,
      hasMatchStarted: true,
      roundWinStatus: 1,
      roundWinReason: 7,
      bombSite: 2,
    });
  });

  it("freezes the snapshot at call time — later store mutations don't leak in", () => {
    const values = new Map<number, unknown>([[1, 5]]);
    const entity = makeFakeEntity(REQUIRED_PROPS, values);
    const gr = new GameRules(entity);
    const snap = gr.snapshot();
    values.set(1, 30);
    expect(snap.totalRoundsPlayed).toBe(5);
    expect(gr.totalRoundsPlayed).toBe(30);
  });
});
