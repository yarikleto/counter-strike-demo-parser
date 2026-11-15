/**
 * Golden test (TASK-080): per-round summary (winner / endReason / MVP / ...).
 *
 * Compares the live parse of `de_nuke.dem` against the committed
 * `test/golden/rounds.json` snapshot. Run `npm run goldens:update`
 * to regenerate when an intentional behaviour change requires it.
 */
import { describe, it } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/node.js";
import { ConvenienceRoundTracker } from "../../src/convenience/RoundTracker.js";
import { expectMatchesGolden } from "../golden/_compare.js";
import { fixtureAvailable } from "./_fixture.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe.skipIf(!fixtureAvailable)("golden: rounds", () => {
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
        // The MVP's name as captured when round_mvp fired.
        mvp: round.mvp !== undefined ? round.mvp.name || `slot ${round.mvp.slot}` : undefined,
      };
    });

    expectMatchesGolden("rounds", actual);
  });
});
