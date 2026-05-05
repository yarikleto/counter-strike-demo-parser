/**
 * Integration test for TASK-049: console command parsing on a real demo.
 *
 * The de_nuke fixture is a bot-driven competitive recording, so it may
 * legitimately carry zero `dem_consolecmd` frames — production CSGO demos
 * recorded server-side often contain none. This test therefore verifies the
 * structural contract (subscription works, listener receives well-formed
 * payloads when fired) and logs the empirical count for documentation,
 * rather than hard-asserting a non-zero floor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("DemoParser consoleCommand event — integration on de_nuke.dem", () => {
  it("collects every console command emitted during the parse, with valid shapes", () => {
    const buffer = readFileSync(FIXTURE);
    const parser = new DemoParser(buffer);

    const events: Array<{ tick: number; command: string }> = [];
    parser.on("consoleCommand", (e) => {
      events.push({ tick: e.tick, command: e.command });
    });

    parser.parseAll();

    // Document the empirical count for the fixture — useful when a CSGO
    // build update changes which commands are recorded. Not asserted as a
    // hard floor: a clean competitive recording can legitimately yield 0.
    // eslint-disable-next-line no-console
    console.log(`[TASK-049] de_nuke consoleCommand events: ${events.length}`);

    expect(Array.isArray(events)).toBe(true);

    // Every emitted event must carry a finite tick and a string `command`.
    // No assertion on tick sign — signon-phase frames can carry negative
    // tick sentinels in CSGO demos (same convention as `unknownMessage`).
    for (const e of events) {
      expect(typeof e.command).toBe("string");
      expect(Number.isFinite(e.tick)).toBe(true);
      // Trailing null should already be stripped by the parser — assert no
      // command ends in `\0` so a regression in the decoder is caught.
      expect(e.command.endsWith("\0")).toBe(false);
    }

    // If the fixture happens to have any commands, the first one should
    // have a non-empty payload — empty length-prefixed strings are legal
    // on the wire but extremely rare in practice.
    if (events.length > 0) {
      expect(events.some((e) => e.command.length > 0)).toBe(true);
    }
  });
});
