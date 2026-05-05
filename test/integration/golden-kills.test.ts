/**
 * Golden test (TASK-079): every player_death event in wire order.
 *
 * Compares the live parse of `de_nuke.dem` against the committed
 * `test/golden/kills.json` snapshot. Run `npm run goldens:update`
 * to regenerate when an intentional behaviour change requires it.
 */
import { describe, it } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
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

describe("golden: kills", () => {
  it("matches the committed snapshot", () => {
    const parser = DemoParser.fromFile(FIXTURE);

    let currentRound = 0;
    parser.on("round_start", () => {
      currentRound += 1;
    });

    const killRows: Array<{
      tick: number;
      attacker: string;
      victim: string;
      weapon: string;
      headshot: boolean;
      penetrated: boolean;
      noscope: boolean;
      thrusmoke: boolean;
      attackerblind: boolean;
      round: number;
    }> = [];
    parser.on("player_death", (e) => {
      killRows.push({
        tick: parser.currentTick,
        attacker: nameOf(e.attacker, parser),
        victim: nameOf(e.victim, parser),
        weapon: e.weapon,
        headshot: e.headshot,
        penetrated: e.penetrated,
        noscope: e.noscope,
        thrusmoke: e.thrusmoke,
        attackerblind: e.attackerblind,
        round: currentRound,
      });
    });

    parser.parseAll();

    expectMatchesGolden("kills", killRows);
  });
});
