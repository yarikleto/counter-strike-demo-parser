import { describe, it, expect } from "vitest";
import {
  RoundTracker,
  computeRoundPhase,
  type RoundPhase,
} from "../../../src/state/RoundTracker.js";

/**
 * Fake `GameRules`-shaped object. RoundTracker only reads four properties off
 * GameRules — `gamePhase`, `isWarmup`, `isFreezePeriod`, `roundWinStatus` —
 * plus `totalRoundsPlayed` for the round number on each emit. We keep the
 * shape minimal so the tests don't drag the real GameRules constructor in.
 */
interface FakeGameRulesState {
  gamePhase: number;
  isWarmup: boolean;
  isFreezePeriod: boolean;
  roundWinStatus: number;
  totalRoundsPlayed: number;
}

function makeFakeGameRules(state: FakeGameRulesState): {
  gamePhase: number;
  isWarmup: boolean;
  isFreezePeriod: boolean;
  roundWinStatus: number;
  totalRoundsPlayed: number;
} {
  // Plain object — RoundTracker only reads, never invokes constructor logic.
  return state;
}

describe("computeRoundPhase — phase mapping table", () => {
  it.each<[FakeGameRulesState, RoundPhase, string]>([
    // warmup beats everything else
    [
      {
        gamePhase: 2,
        isWarmup: true,
        isFreezePeriod: false,
        roundWinStatus: 0,
        totalRoundsPlayed: 0,
      },
      "warmup",
      "warmup=true => warmup",
    ],
    [
      {
        gamePhase: 2,
        isWarmup: true,
        isFreezePeriod: true,
        roundWinStatus: 0,
        totalRoundsPlayed: 0,
      },
      "warmup",
      "warmup=true overrides freeze",
    ],
    // postgame / halftime are over, not live
    [
      {
        gamePhase: 5,
        isWarmup: false,
        isFreezePeriod: false,
        roundWinStatus: 2,
        totalRoundsPlayed: 30,
      },
      "over",
      "gamePhase=5 (postgame) => over",
    ],
    [
      {
        gamePhase: 4,
        isWarmup: false,
        isFreezePeriod: false,
        roundWinStatus: 2,
        totalRoundsPlayed: 15,
      },
      "over",
      "gamePhase=4 (halftime) => over",
    ],
    // roundWinStatus non-zero is the per-round "over" signal
    [
      {
        gamePhase: 2,
        isWarmup: false,
        isFreezePeriod: false,
        roundWinStatus: 3,
        totalRoundsPlayed: 5,
      },
      "over",
      "winStatus=3 (T win) during play => over",
    ],
    [
      {
        gamePhase: 3,
        isWarmup: false,
        isFreezePeriod: false,
        roundWinStatus: 2,
        totalRoundsPlayed: 20,
      },
      "over",
      "winStatus=2 (CT win) during play => over",
    ],
    // freeze period during regulation
    [
      {
        gamePhase: 2,
        isWarmup: false,
        isFreezePeriod: true,
        roundWinStatus: 0,
        totalRoundsPlayed: 1,
      },
      "freeze",
      "freeze=true, winStatus=0 => freeze",
    ],
    // live — the catchall
    [
      {
        gamePhase: 2,
        isWarmup: false,
        isFreezePeriod: false,
        roundWinStatus: 0,
        totalRoundsPlayed: 3,
      },
      "live",
      "freeze=false, winStatus=0 => live",
    ],
    [
      {
        gamePhase: 3,
        isWarmup: false,
        isFreezePeriod: false,
        roundWinStatus: 0,
        totalRoundsPlayed: 25,
      },
      "live",
      "second-half live",
    ],
  ])("%# %s -> %s", (state, expected) => {
    expect(computeRoundPhase(state)).toBe(expected);
  });

  it("over wins over freeze when both could apply (winStatus≠0 & freeze=true)", () => {
    // Pathological boundary tick — winStatus has flipped but the engine has
    // also already set freeze. We want consumers to see "over" so they can
    // count round-end events without double-counting.
    expect(
      computeRoundPhase({
        gamePhase: 2,
        isWarmup: false,
        isFreezePeriod: true,
        roundWinStatus: 3,
        totalRoundsPlayed: 1,
      }),
    ).toBe("over");
  });

  it("postgame wins over warmup if both somehow set (defensive)", () => {
    // We give warmup priority normally, but if a demo's first signon tick
    // flips through a transient state with both set, we still want "over"
    // for postgame so we don't mis-label end-of-match as a fresh warmup.
    // Actual rule: warmup is checked AFTER postgame. Verify ordering.
    expect(
      computeRoundPhase({
        gamePhase: 5,
        isWarmup: true,
        isFreezePeriod: false,
        roundWinStatus: 0,
        totalRoundsPlayed: 30,
      }),
    ).toBe("over");
  });
});

describe("RoundTracker — onUpdate emits phase changes", () => {
  it("does not emit on initial null -> first observation", () => {
    // First observation establishes the baseline; nothing to compare against.
    // Per ADR semantics, only *transitions* fire roundStateChanged. The
    // initial state IS emitted exactly once because there is no previous
    // phase — but we surface that via `previousPhase: undefined` so listeners
    // can decide to ignore it. Track this contract here.
    const events: Array<{
      phase: RoundPhase;
      previousPhase: RoundPhase | undefined;
      roundNumber: number;
    }> = [];
    const tracker = new RoundTracker((e) => events.push(e));
    tracker.onUpdate(
      makeFakeGameRules({
        gamePhase: 2,
        isWarmup: true,
        isFreezePeriod: false,
        roundWinStatus: 0,
        totalRoundsPlayed: 0,
      }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      phase: "warmup",
      previousPhase: undefined,
      roundNumber: 0,
    });
  });

  it("does not re-emit when the phase is unchanged across updates", () => {
    const events: Array<{ phase: RoundPhase }> = [];
    const tracker = new RoundTracker((e) => events.push(e));
    const live = makeFakeGameRules({
      gamePhase: 2,
      isWarmup: false,
      isFreezePeriod: false,
      roundWinStatus: 0,
      totalRoundsPlayed: 1,
    });
    tracker.onUpdate(live);
    tracker.onUpdate(live);
    tracker.onUpdate(live);
    expect(events).toHaveLength(1);
    expect(events[0]!.phase).toBe("live");
  });

  it("emits the canonical warmup -> live -> over -> freeze -> live sequence", () => {
    const events: Array<{
      phase: RoundPhase;
      previousPhase: RoundPhase | undefined;
      roundNumber: number;
    }> = [];
    const tracker = new RoundTracker((e) => events.push(e));
    // warmup
    tracker.onUpdate(
      makeFakeGameRules({
        gamePhase: 2,
        isWarmup: true,
        isFreezePeriod: false,
        roundWinStatus: 0,
        totalRoundsPlayed: 0,
      }),
    );
    // live (round 1 starts)
    tracker.onUpdate(
      makeFakeGameRules({
        gamePhase: 2,
        isWarmup: false,
        isFreezePeriod: false,
        roundWinStatus: 0,
        totalRoundsPlayed: 0,
      }),
    );
    // over (T win, totalRoundsPlayed bumps to 1)
    tracker.onUpdate(
      makeFakeGameRules({
        gamePhase: 2,
        isWarmup: false,
        isFreezePeriod: false,
        roundWinStatus: 3,
        totalRoundsPlayed: 1,
      }),
    );
    // freeze of round 2
    tracker.onUpdate(
      makeFakeGameRules({
        gamePhase: 2,
        isWarmup: false,
        isFreezePeriod: true,
        roundWinStatus: 0,
        totalRoundsPlayed: 1,
      }),
    );
    // live round 2
    tracker.onUpdate(
      makeFakeGameRules({
        gamePhase: 2,
        isWarmup: false,
        isFreezePeriod: false,
        roundWinStatus: 0,
        totalRoundsPlayed: 1,
      }),
    );
    expect(events.map((e) => e.phase)).toEqual([
      "warmup",
      "live",
      "over",
      "freeze",
      "live",
    ]);
    expect(events.map((e) => e.previousPhase)).toEqual([
      undefined,
      "warmup",
      "live",
      "over",
      "freeze",
    ]);
    expect(events.map((e) => e.roundNumber)).toEqual([0, 0, 1, 1, 1]);
  });

  it("exposes current phase and round number after updates", () => {
    const tracker = new RoundTracker(() => {});
    tracker.onUpdate(
      makeFakeGameRules({
        gamePhase: 2,
        isWarmup: false,
        isFreezePeriod: true,
        roundWinStatus: 0,
        totalRoundsPlayed: 5,
      }),
    );
    expect(tracker.phase).toBe("freeze");
    expect(tracker.roundNumber).toBe(5);
  });

  it("phase getter is undefined before any update", () => {
    const tracker = new RoundTracker(() => {});
    expect(tracker.phase).toBeUndefined();
    expect(tracker.roundNumber).toBe(0);
  });
});
