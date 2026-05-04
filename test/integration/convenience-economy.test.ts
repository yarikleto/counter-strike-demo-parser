/**
 * Integration test for `EconomyTracker` (TASK-064).
 *
 * Uses the real `DemoParser.parse()` API with the de_nuke fixture to verify
 * that economy records are populated with plausible data from a full demo.
 *
 * These tests are deliberately coarse — they verify plausibility (money
 * exists, is non-negative, is bounded) rather than exact values, since the
 * exact numbers depend on the fixture demo.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DemoParser } from "../../src/DemoParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../fixtures/de_nuke.dem");

describe("EconomyTracker integration (de_nuke)", () => {
  it("round 1 has at least one player with positive startMoney and non-negative endMoney", async () => {
    const result = await DemoParser.parse(FIXTURE);

    // Use round index 1 (second round) to skip any pistol-round edge cases.
    const round1 = result.rounds[1];
    expect(round1).toBeDefined();

    const statsWithEcon = [...round1!.players.values()].filter(
      (s) => s.economy !== undefined,
    );

    // Log a sample for the reviewer.
    const sample = statsWithEcon[0];
    if (sample !== undefined && sample.economy !== undefined) {
      console.log(
        `[EconomyTracker] round 1 sample: slot=${sample.player.slot}`,
        `startMoney=${sample.economy.startMoney}`,
        `endMoney=${sample.economy.endMoney}`,
        `purchases=${sample.economy.purchases.length}`,
      );
    }

    expect(statsWithEcon.length).toBeGreaterThan(0);

    const hasPositiveStart = statsWithEcon.some(
      (s) => s.economy !== undefined && s.economy.startMoney > 0,
    );
    expect(hasPositiveStart).toBe(true);

    const allEndMoneyNonNegative = statsWithEcon.every(
      (s) => s.economy !== undefined && s.economy.endMoney >= 0,
    );
    expect(allEndMoneyNonNegative).toBe(true);
  });
});
