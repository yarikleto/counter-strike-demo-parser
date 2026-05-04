/**
 * Integration test for `ConvenienceRoundTracker` via `DemoParser.parse()`
 * (TASK-066). Exercises the full pipeline on de_nuke.dem.
 *
 * Key assertions:
 *   - `result.rounds` is a non-trivially-sized array (25-35 for de_nuke).
 *   - Every round has `startTick < endTick`.
 *   - `winner` is defined for every round (warmup excluded by the tracker).
 *   - Tick ranges are monotonically increasing across the array.
 *   - At least one round has `bombEvents.plants.length > 0` (de_nuke is a
 *     bomb map, so plants happen).
 *   - Sum of all `round.kills.length` ≤ total `result.kills.length`
 *     (warmup kills are excluded from rounds).
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("ConvenienceRoundTracker — integration on de_nuke.dem via DemoParser.parse()", () => {
  it("produces a reasonable RoundSummary array with sensible field values", async () => {
    const result = await DemoParser.parse(FIXTURE);

    console.log(`DemoResult.rounds.length = ${result.rounds.length}`);

    // de_nuke.dem has ~32 round_ends, 33 round_starts, 35 round_freeze_ends.
    // The tracker only emits for rounds with a preceding round_start (warmup
    // excluded), so the count should be between 25 and 35.
    expect(result.rounds.length).toBeGreaterThanOrEqual(25);
    expect(result.rounds.length).toBeLessThanOrEqual(35);

    // Every round must have startTick < endTick.
    for (const round of result.rounds) {
      expect(round.startTick).toBeLessThan(round.endTick);
    }

    // Winner must be defined for every round (not undefined — warmup is excluded).
    for (const round of result.rounds) {
      expect(round.winner).toBeDefined();
      // Winner is a TeamSide: 0=Unassigned, 1=Spectator, 2=T, 3=CT
      expect([0, 1, 2, 3]).toContain(round.winner);
    }

    // Tick ranges must be monotonically non-decreasing (startTick of each
    // round ≥ startTick of the previous round).
    for (let i = 1; i < result.rounds.length; i++) {
      const prev = result.rounds[i - 1]!;
      const curr = result.rounds[i]!;
      expect(curr.startTick).toBeGreaterThanOrEqual(prev.startTick);
      expect(curr.endTick).toBeGreaterThan(prev.startTick);
    }

    // At least one round must have a bomb plant (de_nuke is a bomb map).
    const roundsWithPlants = result.rounds.filter(
      (r) => r.bombEvents.plants.length > 0,
    );
    console.log(`Rounds with bomb plants: ${roundsWithPlants.length}`);
    expect(roundsWithPlants.length).toBeGreaterThan(0);

    // Sum of per-round kills must be ≤ total kills (warmup kills are excluded
    // from the per-round summaries but counted in result.kills).
    const roundKillsTotal = result.rounds.reduce((sum, r) => sum + r.kills.length, 0);
    console.log(
      `Total kills: ${result.kills.length}, round-kills total: ${roundKillsTotal}`,
    );
    expect(roundKillsTotal).toBeLessThanOrEqual(result.kills.length);

    // Spot-check the first round's shape.
    const firstRound = result.rounds[0]!;
    expect(typeof firstRound.number).toBe("number");
    expect(firstRound.number).toBeGreaterThanOrEqual(1);
    expect(typeof firstRound.startTick).toBe("number");
    expect(typeof firstRound.endTick).toBe("number");
    expect(Array.isArray(firstRound.kills)).toBe(true);
    expect(firstRound.players instanceof Map).toBe(true);
    expect(Array.isArray(firstRound.bombEvents.plants)).toBe(true);
    expect(Array.isArray(firstRound.bombEvents.defuses)).toBe(true);
    expect(Array.isArray(firstRound.bombEvents.explosions)).toBe(true);
  });
});
