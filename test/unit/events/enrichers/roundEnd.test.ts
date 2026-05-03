import { describe, expect, it } from "vitest";
import {
  enrichRoundEnd,
  type RoundEndEvent,
} from "../../../../src/events/enrichers/roundEnd.js";
import { RoundEndReason } from "../../../../src/enums/RoundEndReason.js";
import { TeamSide } from "../../../../src/enums/TeamSide.js";
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
    name: "round_end",
    eventId: 10,
    data: Object.freeze(data),
  };
}

describe("enrichRoundEnd", () => {
  it("maps winner (TeamSide), known reason (enum), and message; stamps round number", () => {
    const result = enrichRoundEnd(
      makeRaw({
        winner: TeamSide.CT,
        reason: RoundEndReason.BombDefused,
        message: "#SFUI_Notice_Bomb_Defused",
      }),
      makeCtx(12),
    ) as Readonly<RoundEndEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("round_end");
    expect(result.winner).toBe(TeamSide.CT);
    expect(result.reason).toBe(RoundEndReason.BombDefused);
    expect(result.message).toBe("#SFUI_Notice_Bomb_Defused");
    expect(result.roundNumber).toBe(12);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("passes through an unknown reason value as a raw integer (forward-compat)", () => {
    const result = enrichRoundEnd(
      makeRaw({ winner: TeamSide.T, reason: 9999, message: "weird" }),
      makeCtx(0),
    ) as Readonly<RoundEndEvent>;

    expect(result.reason).toBe(9999);
  });

  it("defaults missing fields rather than throwing", () => {
    const result = enrichRoundEnd(
      makeRaw({}),
      makeCtx(0),
    ) as Readonly<RoundEndEvent>;

    expect(result.winner).toBe(TeamSide.Unassigned);
    expect(result.reason).toBe(0);
    expect(result.message).toBe("");
    expect(result.roundNumber).toBe(0);
  });
});
