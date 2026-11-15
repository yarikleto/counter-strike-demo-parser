/**
 * Integration test for the columnar `DemoResult.positions` (PositionRecorder).
 *
 * Uses the real `DemoParser.parse()` API with the de_nuke fixture to verify
 * that:
 *   - `positions` is omitted unless `collectPlayerPositions` is set.
 *   - Every column has exactly `length` elements and owns its buffer, so
 *     `positionBuffers()` can be handed to `postMessage` as a transfer list.
 *   - Values are plausible (teams, health, yaw, weapons, world bounds).
 *   - `player[i]` joins with `KillRecord` refs: each victim's sampled
 *     position right before the kill matches the kill's victim position.
 *   - The sample rate controls the cadence.
 */

import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DemoParser } from "../../src/node.js";
import { PositionFlags, positionBuffers, weaponNameForItemDefIndex } from "../../src/browser.js";
import type { DemoResult, PlayerPositions } from "../../src/browser.js";
import { fixtureAvailable } from "./_fixture.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../fixtures/de_nuke.dem");
const RATE = 8;

describe.skipIf(!fixtureAvailable)("positions integration (de_nuke)", () => {
  let result: DemoResult;
  let pos: PlayerPositions;

  beforeAll(async () => {
    result = await DemoParser.parse(FIXTURE, {
      collectPlayerPositions: true,
      positionSampleRateTicks: RATE,
    });
    pos = result.positions!;
  });

  it("omits positions by default", async () => {
    const plain = await DemoParser.parse(FIXTURE);
    expect(plain.positions).toBeUndefined();
  });

  it("has right-sized, independently transferable columns", () => {
    expect(pos.sampleRateTicks).toBe(RATE);
    expect(pos.length).toBeGreaterThan(10_000);
    const buffers = positionBuffers(pos);
    expect(buffers).toHaveLength(14);
    expect(new Set(buffers).size).toBe(14);
    for (const column of [pos.tick, pos.player, pos.x, pos.yaw, pos.money, pos.activeWeapon]) {
      expect(column.length).toBe(pos.length);
      expect(column.byteLength).toBe(column.buffer.byteLength);
    }
  });

  it("holds plausible values", () => {
    let alive = 0;
    let withWeapon = 0;
    let named = 0;
    for (let i = 0; i < pos.length; i++) {
      if (i > 0) expect(pos.tick[i]!).toBeGreaterThanOrEqual(pos.tick[i - 1]!);
      expect([2, 3]).toContain(pos.team[i]);
      expect(pos.player[i]!).toBeLessThan(result.players.length);
      expect(pos.health[i]!).toBeLessThanOrEqual(100);
      expect(Math.abs(pos.x[i]!)).toBeLessThan(16_384);
      expect(Math.abs(pos.y[i]!)).toBeLessThan(16_384);
      expect(pos.yaw[i]!).toBeGreaterThanOrEqual(-360);
      expect(pos.yaw[i]!).toBeLessThanOrEqual(360);
      if (pos.flags[i]! & PositionFlags.Alive) alive++;
      if (pos.activeWeapon[i] !== 0) {
        withWeapon++;
        if (weaponNameForItemDefIndex(pos.activeWeapon[i]!) !== undefined) named++;
      }
    }
    expect(alive / pos.length).toBeGreaterThan(0.5);
    expect(withWeapon).toBeGreaterThan(0);
    expect(named / withWeapon).toBeGreaterThan(0.99);
  });

  it("joins with kill records through the player index", () => {
    // Last sample of each player at or before a given tick.
    const distances: number[] = [];
    for (const kill of result.kills) {
      let best = -1;
      for (let i = 0; i < pos.length && pos.tick[i]! <= kill.tick; i++) {
        if (pos.player[i] === kill.victim.index) best = i;
      }
      if (best < 0 || kill.tick - pos.tick[best]! > RATE) continue;
      distances.push(
        Math.hypot(pos.x[best]! - kill.victimPosition.x, pos.y[best]! - kill.victimPosition.y),
      );
    }
    expect(distances.length).toBeGreaterThan(result.kills.length / 2);
    distances.sort((a, b) => a - b);
    // Within one sample interval a player moves at most a few dozen units.
    expect(distances[Math.floor(distances.length / 2)]!).toBeLessThan(40);
  });

  it("samples once per sampleRateTicks", () => {
    const ticks = new Set(pos.tick);
    const expected = result.header.playbackTicks / RATE;
    expect(ticks.size).toBeGreaterThan(expected * 0.8);
    expect(ticks.size).toBeLessThan(expected * 1.1);
  });
});
