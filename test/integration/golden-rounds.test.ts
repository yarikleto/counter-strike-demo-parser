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

    const actual = roundTracker.snapshot().map((round, index) => ({
      index,
      winner: round.winner,
      endReason: round.endReason,
      // Scoreboard after the round (team on CT / team on T this round).
      scoreCT: round.score?.ct ?? -1,
      scoreT: round.score?.t ?? -1,
      // Only present on rounds a later match restart voided.
      voided: round.voided ? true : undefined,
      // The MVP's name as captured when round_mvp fired.
      mvp: round.mvp !== undefined ? round.mvp.name || `slot ${round.mvp.slot}` : undefined,
    }));

    expectMatchesGolden("rounds", actual);
  });
});
