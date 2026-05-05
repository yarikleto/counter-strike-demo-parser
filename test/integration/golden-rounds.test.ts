/**
 * Golden test (TASK-080): per-round summary (winner / endReason / MVP / ...).
 *
 * Compares the live parse of `de_nuke.dem` against the committed
 * `test/golden/rounds.json` snapshot. Run `npm run goldens:update`
 * to regenerate when an intentional behaviour change requires it.
 */
import { describe, it } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import { ConvenienceRoundTracker } from "../../src/convenience/RoundTracker.js";
import type { Player } from "../../src/state/Player.js";
import { expectMatchesGolden } from "../golden/_compare.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

function nameOf(player: Player | undefined, parser: DemoParser): string {
  if (player === undefined) return "world";
  const entitySlot = player.slot - 1;
  const userId = parser.userInfoIndex.userIdForEntitySlot(entitySlot);
  if (userId === undefined) return `slot ${player.slot}`;
  const info = parser.userInfoIndex.infoForUserId(userId);
  return info?.name ?? `slot ${player.slot}`;
}

describe("golden: rounds", () => {
  it("matches the committed snapshot", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    const roundTracker = new ConvenienceRoundTracker();
    roundTracker.attach(parser);
    parser.parseAll();

    const TEAM_T = 2;
    const TEAM_CT = 3;
    let scoreCT = 0;
    let scoreT = 0;
    const actual = roundTracker.snapshot().map((round, index) => {
      if (round.winner === TEAM_T) scoreT += 1;
      else if (round.winner === TEAM_CT) scoreCT += 1;
      return {
        index,
        winner: round.winner,
        endReason: round.endReason,
        scoreCT,
        scoreT,
        mvp: round.mvp !== undefined ? nameOf(round.mvp, parser) : undefined,
      };
    });

    expectMatchesGolden("rounds", actual);
  });
});
