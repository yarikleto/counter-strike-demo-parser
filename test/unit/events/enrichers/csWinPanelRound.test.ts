import { describe, expect, it } from "vitest";
import {
  enrichCsWinPanelRound,
  type CsWinPanelRoundEvent,
} from "../../../../src/events/enrichers/csWinPanelRound.js";
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
    name: "cs_win_panel_round",
    eventId: 121,
    data: Object.freeze(data),
  };
}

describe("enrichCsWinPanelRound", () => {
  it("happy path: maps wire fields (snake_case) onto camelCase Tier-1 fields", () => {
    const result = enrichCsWinPanelRound(
      makeRaw({
        show_timer_defend: false,
        show_timer_attack: true,
        timer_time: 72,
        final_event: 7,
        funfact_token: "#funfact_killed_half_of_enemies",
        funfact_player: 2,
        funfact_data1: 60,
        funfact_data2: 0,
        funfact_data3: 0,
      }),
      makeCtx(),
    ) as Readonly<CsWinPanelRoundEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("cs_win_panel_round");
    expect(result.eventId).toBe(121);
    expect(result.finalEvent).toBe(7);
    expect(result.funFactToken).toBe("#funfact_killed_half_of_enemies");
    expect(result.funFactPlayer).toBe(2);
    expect(result.funFactData1).toBe(60);
    expect(result.funFactData2).toBe(0);
    expect(result.funFactData3).toBe(0);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("coerces missing fields to safe defaults rather than throwing", () => {
    const result = enrichCsWinPanelRound(
      makeRaw({}),
      makeCtx(),
    ) as Readonly<CsWinPanelRoundEvent>;

    expect(result.finalEvent).toBe(0);
    expect(result.funFactToken).toBe("");
    expect(result.funFactPlayer).toBe(0);
    expect(result.funFactData1).toBe(0);
    expect(result.funFactData2).toBe(0);
    expect(result.funFactData3).toBe(0);
  });
});
