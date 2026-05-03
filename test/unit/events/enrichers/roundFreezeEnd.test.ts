import { describe, expect, it } from "vitest";
import {
  enrichRoundFreezeEnd,
  type RoundFreezeEndEvent,
} from "../../../../src/events/enrichers/roundFreezeEnd.js";
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

function makeRaw(): DecodedGameEvent {
  return {
    name: "round_freeze_end",
    eventId: 13,
    data: Object.freeze({}),
  };
}

describe("enrichRoundFreezeEnd", () => {
  it("emits a frozen event with the current round number", () => {
    const result = enrichRoundFreezeEnd(
      makeRaw(),
      makeCtx(5),
    ) as Readonly<RoundFreezeEndEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("round_freeze_end");
    expect(result.eventId).toBe(13);
    expect(result.roundNumber).toBe(5);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("defaults roundNumber to 0 when gameRules is unavailable", () => {
    const result = enrichRoundFreezeEnd(
      makeRaw(),
      makeCtx(undefined),
    ) as Readonly<RoundFreezeEndEvent>;

    expect(result.roundNumber).toBe(0);
  });
});
