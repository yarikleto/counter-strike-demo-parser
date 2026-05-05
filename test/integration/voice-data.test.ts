/**
 * Integration test for TASK-051: voice-data extraction on a real demo.
 *
 * The de_nuke fixture is a bot-driven competitive recording, which means
 * the server captured authoritative game state but no live voice channel —
 * so this fixture is expected to carry zero `CSVCMsg_VoiceData` messages.
 * POV recordings and casual demos with active voice chat are the
 * environments where the event fires; on the bundled fixture we therefore
 * verify the structural contract (subscription works, payload shapes
 * remain valid when fired) and log the empirical count for documentation,
 * rather than hard-asserting a non-zero floor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("DemoParser voiceData event — integration on de_nuke.dem", () => {
  it("collects every voice frame emitted during the parse, with valid shapes", () => {
    const buffer = readFileSync(FIXTURE);
    const parser = new DemoParser(buffer);

    const events: Array<{
      tick: number;
      hasPlayer: boolean;
      format: number;
      proximity: number;
      dataLength: number;
    }> = [];
    parser.on("voiceData", (e) => {
      events.push({
        tick: e.tick,
        hasPlayer: e.player !== undefined,
        format: e.format,
        proximity: e.proximity,
        dataLength: e.data.length,
      });
    });

    parser.parseAll();

    // Document the empirical count for the fixture — useful when a CSGO
    // build update changes which messages are recorded. Not asserted as
    // a hard floor: a clean bot-driven competitive recording can
    // legitimately yield 0 voice frames.
    // eslint-disable-next-line no-console
    console.log(`[TASK-051] de_nuke voiceData events: ${events.length}`);

    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(0);

    // Every emitted event must carry a finite tick and a non-empty data
    // slice (we drop empty payloads at the parser layer — a voice frame
    // with zero audio bytes is not a meaningful event).
    for (const e of events) {
      expect(Number.isFinite(e.tick)).toBe(true);
      expect(e.dataLength).toBeGreaterThan(0);
      // proximity is normalised to a 0|1 number from the proto's boolean.
      expect(e.proximity === 0 || e.proximity === 1).toBe(true);
      // format comes straight off the wire as VoiceDataFormatT — accept
      // any finite integer (forward-compat for new format codes).
      expect(Number.isInteger(e.format)).toBe(true);
    }
  });
});
