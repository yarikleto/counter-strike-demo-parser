/**
 * Golden test (TASK-078): final player roster (name / steamId / team / ...).
 *
 * Compares the live parse of `de_nuke.dem` against the committed
 * `test/golden/playerEndState.json` snapshot. Run `npm run goldens:update`
 * to regenerate when an intentional behaviour change requires it.
 */
import { describe, it } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import { expectMatchesGolden } from "../golden/_compare.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

function round(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

describe("golden: playerEndState", () => {
  it("matches the committed snapshot", () => {
    // Streaming parse — `userInfoIndex` lookup requires the live parser; the
    // async `DemoParser.parse()` API exposes only `PlayerSnapshot[]`, which
    // doesn't carry the wire `name` / `steamId`.
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();

    const actual = parser.players
      .map((player) => {
        const entitySlot = player.slot - 1;
        const userId = parser.userInfoIndex.userIdForEntitySlot(entitySlot);
        const info = userId !== undefined ? parser.userInfoIndex.infoForUserId(userId) : undefined;
        const pos = player.position;
        return {
          slot: player.slot,
          name: info?.name ?? `slot ${player.slot}`,
          steamId: info?.xuid ?? "0",
          team: player.team,
          isAlive: player.isAlive,
          money: player.money,
          position: {
            x: round(pos.x, 4),
            y: round(pos.y, 4),
            z: round(pos.z, 4),
          },
        };
      })
      .sort((a, b) => a.slot - b.slot);

    expectMatchesGolden("playerEndState", actual);
  });
});
