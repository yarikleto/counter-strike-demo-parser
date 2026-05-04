import { describe, expect, it } from "vitest";
import {
  enrichCsWinPanelMatch,
  type CsWinPanelMatchEvent,
} from "../../../../src/events/enrichers/csWinPanelMatch.js";
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

function makeRaw(): DecodedGameEvent {
  return {
    name: "cs_win_panel_match",
    eventId: 122,
    data: Object.freeze({}),
  };
}

describe("enrichCsWinPanelMatch", () => {
  it("emits frozen no-payload event with eventName/eventId carried over", () => {
    const result = enrichCsWinPanelMatch(
      makeRaw(),
      makeCtx(),
    ) as Readonly<CsWinPanelMatchEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("cs_win_panel_match");
    expect(result.eventId).toBe(122);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
