/**
 * Golden test (TASK-076): demo header + selected ServerInfo fields.
 *
 * Compares the live parse of `de_nuke.dem` against the committed
 * `test/golden/header.json` snapshot. Run `npm run goldens:update`
 * to regenerate when an intentional behaviour change requires it.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import { expectMatchesGolden } from "../golden/_compare.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

function round(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

describe("golden: header", () => {
  it("matches the committed snapshot", () => {
    // Streaming API — `serverInfoState` carries tickInterval / maxClasses,
    // which `DemoResult` doesn't surface. One parse covers both fields.
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();

    const header = parser.header;
    expect(header).toBeDefined();
    const serverInfoState = parser.serverInfoState;
    expect(serverInfoState).toBeDefined();

    const actual = {
      header: {
        magic: header!.magic,
        demoProtocol: header!.demoProtocol,
        networkProtocol: header!.networkProtocol,
        serverName: header!.serverName,
        clientName: header!.clientName,
        mapName: header!.mapName,
        gameDirectory: header!.gameDirectory,
        playbackTime: round(header!.playbackTime, 6),
        playbackTicks: header!.playbackTicks,
        playbackFrames: header!.playbackFrames,
        signonLength: header!.signonLength,
      },
      serverInfo: {
        tickInterval: round(serverInfoState!.tickInterval, 6),
        maxClasses: serverInfoState!.maxClasses,
        mapName: serverInfoState!.mapName,
      },
    };
    expectMatchesGolden("header", actual);
  });
});
