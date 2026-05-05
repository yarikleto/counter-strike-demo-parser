/**
 * Integration test for `PositionTracker` (TASK-067).
 *
 * Uses the real `DemoParser.parse()` API with the de_nuke fixture to verify
 * that:
 *   - `playerPositions` is omitted from the result by default (opt-in via
 *     `collectPlayerPositions`).
 *   - When opted in, samples are produced at roughly the expected cadence
 *     (players × ticks / sampleRate).
 *   - Position scalars are real-looking (non-zero somewhere; within the
 *     plausible CSGO world bounds of roughly ±16 384 units).
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DemoParser } from "../../src/DemoParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../fixtures/de_nuke.dem");

describe("PositionTracker integration (de_nuke)", () => {
  it("omits playerPositions by default (opt-in via collectPlayerPositions)", async () => {
    const result = await DemoParser.parse(FIXTURE);
    expect(result.playerPositions).toBeUndefined();
  });

  it("omits playerPositions when collectPlayerPositions is explicitly false", async () => {
    const result = await DemoParser.parse(FIXTURE, {
      collectPlayerPositions: false,
    });
    expect(result.playerPositions).toBeUndefined();
  });

  it("populates playerPositions when collectPlayerPositions is true", async () => {
    const result = await DemoParser.parse(FIXTURE, {
      collectPlayerPositions: true,
    });

    expect(result.playerPositions).toBeDefined();
    const snaps = result.playerPositions!;
    expect(snaps.length).toBeGreaterThan(0);

    // Spot-check: at least one snapshot has a non-zero coordinate. A demo
    // that only ever read 0/0/0 would indicate the position prop hookup is
    // broken.
    const anyNonZero = snaps.some(
      (s) => s.x !== 0 || s.y !== 0 || s.z !== 0,
    );
    expect(anyNonZero).toBe(true);

    // Plausibility bound: CSGO maps fit inside roughly ±16384 world units.
    // A wildly-out-of-range scalar would indicate a units / decoding bug.
    const allInRange = snaps.every(
      (s) =>
        Math.abs(s.x) < 32_768 &&
        Math.abs(s.y) < 32_768 &&
        Math.abs(s.z) < 32_768,
    );
    expect(allInRange).toBe(true);

    // Log a sample for the reviewer.
    const first = snaps[0]!;
    console.log(
      `[PositionTracker] first sample: tick=${first.tick} slot=${first.player.slot}`,
      `xyz=(${first.x.toFixed(1)}, ${first.y.toFixed(1)}, ${first.z.toFixed(1)})`,
      `total=${snaps.length}`,
    );
  });

  it("respects a custom positionSampleRateTicks (coarser rate => fewer snapshots)", async () => {
    const fine = await DemoParser.parse(FIXTURE, {
      collectPlayerPositions: true,
      positionSampleRateTicks: 32,
    });
    const coarse = await DemoParser.parse(FIXTURE, {
      collectPlayerPositions: true,
      positionSampleRateTicks: 256,
    });

    // 8x coarser rate => roughly 8x fewer samples. Use a loose bound (>2x)
    // since the exact ratio depends on entityUpdated cadence near tick
    // boundaries.
    expect(fine.playerPositions!.length).toBeGreaterThan(
      coarse.playerPositions!.length * 2,
    );
  });
});
