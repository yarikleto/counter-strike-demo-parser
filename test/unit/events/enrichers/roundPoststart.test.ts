import { describe, expect, it } from "vitest";
import {
  enrichRoundPoststart,
  type RoundPoststartEvent,
} from "../../../../src/events/enrichers/roundPoststart.js";
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
    name: "round_poststart",
    eventId: 12,
    data: Object.freeze({}),
  };
}

describe("enrichRoundPoststart", () => {
  it("emits a frozen event with the current round number", () => {
    const result = enrichRoundPoststart(
      makeRaw(),
      makeCtx(2),
    ) as Readonly<RoundPoststartEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("round_poststart");
    expect(result.eventId).toBe(12);
    expect(result.roundNumber).toBe(2);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("defaults roundNumber to 0 when gameRules is unavailable", () => {
    const result = enrichRoundPoststart(
      makeRaw(),
      makeCtx(undefined),
    ) as Readonly<RoundPoststartEvent>;

    expect(result.roundNumber).toBe(0);
  });
});
