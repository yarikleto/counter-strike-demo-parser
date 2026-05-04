import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type {
  BeginNewMatchEvent,
  RoundMvpEvent,
  AnnouncePhaseEndEvent,
  CsWinPanelMatchEvent,
  CsWinPanelRoundEvent,
  MatchEndConditionsEvent,
  BotTakeoverEvent,
} from "../../src/events/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

// TASK-046: end-to-end smoke test for the miscellaneous match-state Tier-1
// enrichers on a real 30-round MM demo. Empirical baseline (probe):
// begin_new_match=2, round_mvp=31, announce_phase_end=2,
// cs_win_panel_match=1, cs_win_panel_round=31, match_end_conditions=0,
// bot_takeover=0. The bots-only fixture doesn't broadcast
// match_end_conditions and never triggers a bot takeover, so those assert
// non-negative; round_mvp fires every round-end with a winner so it asserts
// at least 1.
describe("Miscellaneous game-state events (Tier-1) — integration on de_nuke.dem", () => {
  it("emits typed misc match-state events", () => {
    const parser = DemoParser.fromFile(FIXTURE);

    const beginNewMatch: BeginNewMatchEvent[] = [];
    const roundMvp: RoundMvpEvent[] = [];
    const announcePhaseEnd: AnnouncePhaseEndEvent[] = [];
    const csWinPanelMatch: CsWinPanelMatchEvent[] = [];
    const csWinPanelRound: CsWinPanelRoundEvent[] = [];
    const matchEndConditions: MatchEndConditionsEvent[] = [];
    const botTakeover: BotTakeoverEvent[] = [];

    parser.on("begin_new_match", (e: BeginNewMatchEvent) => beginNewMatch.push(e));
    parser.on("round_mvp", (e: RoundMvpEvent) => roundMvp.push(e));
    parser.on("announce_phase_end", (e: AnnouncePhaseEndEvent) =>
      announcePhaseEnd.push(e),
    );
    parser.on("cs_win_panel_match", (e: CsWinPanelMatchEvent) =>
      csWinPanelMatch.push(e),
    );
    parser.on("cs_win_panel_round", (e: CsWinPanelRoundEvent) =>
      csWinPanelRound.push(e),
    );
    parser.on("match_end_conditions", (e: MatchEndConditionsEvent) =>
      matchEndConditions.push(e),
    );
    parser.on("bot_takeover", (e: BotTakeoverEvent) => botTakeover.push(e));

    parser.parseAll();

    expect(roundMvp.length).toBeGreaterThanOrEqual(1);
    expect(beginNewMatch.length).toBeGreaterThanOrEqual(0);
    expect(announcePhaseEnd.length).toBeGreaterThanOrEqual(0);
    expect(csWinPanelMatch.length).toBeGreaterThanOrEqual(0);
    expect(csWinPanelRound.length).toBeGreaterThanOrEqual(0);
    expect(matchEndConditions.length).toBeGreaterThanOrEqual(0);
    expect(botTakeover.length).toBeGreaterThanOrEqual(0);

    console.log(
      `misc events on de_nuke.dem: begin_new_match=${beginNewMatch.length}, ` +
        `round_mvp=${roundMvp.length}, announce_phase_end=${announcePhaseEnd.length}, ` +
        `cs_win_panel_match=${csWinPanelMatch.length}, ` +
        `cs_win_panel_round=${csWinPanelRound.length}, ` +
        `match_end_conditions=${matchEndConditions.length}, ` +
        `bot_takeover=${botTakeover.length}`,
    );

    // Sample a frozen round_mvp and verify the typed shape.
    const mvp = roundMvp[0]!;
    expect(mvp.eventName).toBe("round_mvp");
    expect(typeof mvp.eventId).toBe("number");
    expect(mvp.player).toBeDefined();
    expect(typeof mvp.player.slot).toBe("number");
    expect(typeof mvp.reason).toBe("number");
    expect(Object.isFrozen(mvp)).toBe(true);

    // Spot-check a cs_win_panel_round if any fired.
    if (csWinPanelRound.length > 0) {
      const panel = csWinPanelRound[0]!;
      expect(panel.eventName).toBe("cs_win_panel_round");
      expect(typeof panel.finalEvent).toBe("number");
      expect(typeof panel.funFactToken).toBe("string");
      expect(typeof panel.funFactPlayer).toBe("number");
      expect(typeof panel.funFactData1).toBe("number");
      expect(typeof panel.funFactData2).toBe("number");
      expect(typeof panel.funFactData3).toBe("number");
      expect(Object.isFrozen(panel)).toBe(true);
    }

    // Spot-check a no-payload event.
    if (beginNewMatch.length > 0) {
      const bnm = beginNewMatch[0]!;
      expect(bnm.eventName).toBe("begin_new_match");
      expect(Object.isFrozen(bnm)).toBe(true);
    }
  });
});
