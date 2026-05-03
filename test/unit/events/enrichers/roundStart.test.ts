import { describe, expect, it } from "vitest";
import {
  enrichRoundStart,
  type RoundStartEvent,
} from "../../../../src/events/enrichers/roundStart.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { GameRules } from "../../../../src/state/GameRules.js";

function makeCtx(totalRoundsPlayed: number | undefined): EnricherContext {
  const gameRules =
    totalRoundsPlayed === undefined
      ? undefined
      : ({ totalRoundsPlayed } as unknown as GameRules);
  return {
    players: [],
    teams: [],
    gameRules,
    entities: undefined,
    userInfoIndex: {} as EnricherContext["userInfoIndex"],
    resolvePlayer: () => undefined,
  } as unknown as EnricherContext;
}

function makeRaw(
  data: Record<string, string | number | boolean>,
): DecodedGameEvent {
  return {
    name: "round_start",
    eventId: 9,
    data: Object.freeze(data),
  };
}

describe("enrichRoundStart", () => {
  it("maps timelimit/fraglimit/objective and stamps the round number", () => {
    const result = enrichRoundStart(
      makeRaw({ timelimit: 115, fraglimit: 0, objective: "BOMB TARGET" }),
      makeCtx(7),
    ) as Readonly<RoundStartEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("round_start");
    expect(result.eventId).toBe(9);
    expect(result.timeLimit).toBe(115);
    expect(result.fragLimit).toBe(0);
    expect(result.objective).toBe("BOMB TARGET");
    expect(result.roundNumber).toBe(7);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("falls back to roundNumber=0 when gameRules is undefined", () => {
    const result = enrichRoundStart(
      makeRaw({ timelimit: 115, fraglimit: 0, objective: "BOMB TARGET" }),
      makeCtx(undefined),
    ) as Readonly<RoundStartEvent>;

    expect(result.roundNumber).toBe(0);
  });

  it("coerces missing fields to safe defaults rather than throwing", () => {
    const result = enrichRoundStart(
      makeRaw({}),
      makeCtx(0),
    ) as Readonly<RoundStartEvent>;

    expect(result.timeLimit).toBe(0);
    expect(result.fragLimit).toBe(0);
    expect(result.objective).toBe("");
  });
});
