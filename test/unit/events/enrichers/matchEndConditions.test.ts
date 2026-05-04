import { describe, expect, it } from "vitest";
import {
  enrichMatchEndConditions,
  type MatchEndConditionsEvent,
} from "../../../../src/events/enrichers/matchEndConditions.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";

function makeCtx(): EnricherContext {
  return {
    players: [],
    teams: [],
    gameRules: undefined,
    entities: undefined,
    userInfoIndex: {} as EnricherContext["userInfoIndex"],
    resolvePlayer: () => undefined,
  } as unknown as EnricherContext;
}

function makeRaw(
  data: Record<string, string | number | boolean>,
): DecodedGameEvent {
  return {
    name: "match_end_conditions",
    eventId: 40,
    data: Object.freeze(data),
  };
}

describe("enrichMatchEndConditions", () => {
  it("happy path: maps frags/max_rounds/win_rounds/time onto camelCase", () => {
    const result = enrichMatchEndConditions(
      makeRaw({ frags: 0, max_rounds: 30, win_rounds: 16, time: 0 }),
      makeCtx(),
    ) as Readonly<MatchEndConditionsEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("match_end_conditions");
    expect(result.eventId).toBe(40);
    expect(result.frags).toBe(0);
    expect(result.maxRounds).toBe(30);
    expect(result.winRounds).toBe(16);
    expect(result.time).toBe(0);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("coerces missing fields to 0", () => {
    const result = enrichMatchEndConditions(
      makeRaw({}),
      makeCtx(),
    ) as Readonly<MatchEndConditionsEvent>;

    expect(result.frags).toBe(0);
    expect(result.maxRounds).toBe(0);
    expect(result.winRounds).toBe(0);
    expect(result.time).toBe(0);
  });
});
