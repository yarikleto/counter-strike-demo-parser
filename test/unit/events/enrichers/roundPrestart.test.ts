import { describe, expect, it } from "vitest";
import {
  enrichRoundPrestart,
  type RoundPrestartEvent,
} from "../../../../src/events/enrichers/roundPrestart.js";
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
    name: "round_prestart",
    eventId: 11,
    data: Object.freeze({}),
  };
}

describe("enrichRoundPrestart", () => {
  it("emits a frozen event with the current round number", () => {
    const result = enrichRoundPrestart(
      makeRaw(),
      makeCtx(3),
    ) as Readonly<RoundPrestartEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("round_prestart");
    expect(result.eventId).toBe(11);
    expect(result.roundNumber).toBe(3);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("defaults roundNumber to 0 when gameRules is unavailable", () => {
    const result = enrichRoundPrestart(
      makeRaw(),
      makeCtx(undefined),
    ) as Readonly<RoundPrestartEvent>;

    expect(result.roundNumber).toBe(0);
  });
});
