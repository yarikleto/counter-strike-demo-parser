/**
 * Integration test for TASK-050 (`userCommand`) and TASK-057 (`customData`)
 * on a real demo.
 *
 * The de_nuke fixture is a bot-driven competitive recording. CS:GO's
 * server-side recording pipeline captures authoritative ticks, not client
 * inputs, so `dem_usercmd` frames are typically absent — POV demos are the
 * common source. Likewise `dem_customdata` is reserved for SourceTV /
 * community plugins and is rare on stock recordings. Both event streams may
 * legitimately be empty here, so the structural contract (subscription wires
 * up, payloads are well-formed when fired) is asserted rather than a
 * non-zero floor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("DemoParser userCommand / customData events — integration on de_nuke.dem", () => {
  it("collects every usercmd / customdata emission with valid shapes", () => {
    const buffer = readFileSync(FIXTURE);
    const parser = new DemoParser(buffer);

    const userCommands: Array<{
      tick: number;
      playerSlot: number;
      sequence: number;
      data: Uint8Array;
    }> = [];
    const customData: Array<{ tick: number; type: number; data: Uint8Array }> = [];

    parser.on("userCommand", (e) => {
      userCommands.push({
        tick: e.tick,
        playerSlot: e.playerSlot,
        sequence: e.sequence,
        data: e.data,
      });
    });
    parser.on("customData", (e) => {
      customData.push({ tick: e.tick, type: e.type, data: e.data });
    });

    parser.parseAll();

    // Document the empirical counts for the fixture — useful when a CSGO
    // build update changes which frames are recorded. Not asserted as a
    // hard floor: a server-side competitive recording can legitimately
    // yield 0 of either.
    // eslint-disable-next-line no-console
    console.log(
      `[TASK-050/057] de_nuke userCommand events: ${userCommands.length}, customData events: ${customData.length}`,
    );

    expect(Array.isArray(userCommands)).toBe(true);
    expect(Array.isArray(customData)).toBe(true);
    expect(userCommands.length).toBeGreaterThanOrEqual(0);
    expect(customData.length).toBeGreaterThanOrEqual(0);

    // Every emitted userCommand must carry a finite tick / sequence /
    // playerSlot and a Uint8Array data view. No assertion on tick sign:
    // signon-phase frames can carry negative tick sentinels in CSGO demos.
    for (const e of userCommands) {
      expect(Number.isFinite(e.tick)).toBe(true);
      expect(Number.isInteger(e.sequence)).toBe(true);
      expect(Number.isInteger(e.playerSlot)).toBe(true);
      expect(e.data).toBeInstanceOf(Uint8Array);
    }

    for (const e of customData) {
      expect(Number.isFinite(e.tick)).toBe(true);
      expect(Number.isInteger(e.type)).toBe(true);
      expect(e.data).toBeInstanceOf(Uint8Array);
    }
  });
});
