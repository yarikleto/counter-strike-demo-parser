/**
 * Integration test for TASK-059: defensive parsing of malformed demos.
 *
 * Truncates the de_nuke fixture by removing the trailing 100 bytes (a
 * representative network-drop / partial-copy scenario) and verifies the
 * parser surfaces the failure as a typed `parserError` event with a
 * non-negative byte offset and a sensible kind, rather than throwing past
 * `parseAll()`. We assert at least one `parserError` fires and that the
 * parser produced meaningful work before terminating — i.e. the truncation
 * was caught LATE in the parse, not on the very first frame.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");
/** Bytes lopped off the tail of the fixture to simulate a truncated demo. */
const TRUNCATION_BYTES = 100;

describe("DemoParser parserError event — integration on a truncated de_nuke.dem", () => {
  it("emits parserError with a non-negative byte offset and exits cleanly on a tail-truncated demo", () => {
    const full = readFileSync(FIXTURE);
    // Lop off the last 100 bytes — typically lands the parser somewhere in
    // the middle of a packet payload at the tail of the demo, well past
    // hundreds of thousands of correctly-parsed frames.
    const truncated = full.subarray(0, full.length - TRUNCATION_BYTES);

    const parser = new DemoParser(truncated);

    const errors: Array<{
      kind: string;
      tick: number;
      byteOffset: number;
      message: string;
    }> = [];
    parser.on("parserError", (e) => {
      errors.push({
        kind: e.kind,
        tick: e.tick,
        byteOffset: e.byteOffset,
        message: e.message,
      });
    });

    // Defensive parsing: parseAll() must reach a clean stop on malformed
    // input — never throw past this boundary.
    expect(() => parser.parseAll()).not.toThrow();

    // At least one parserError must have fired — truncation has to be
    // observed somewhere.
    expect(errors.length).toBeGreaterThanOrEqual(1);

    // Sanity-check the LAST error's payload: it should be the terminating
    // truncation/other failure, with a non-negative offset that lies inside
    // the truncated buffer (we never report past the end of input).
    const last = errors[errors.length - 1];
    expect(["truncated", "other", "corrupt-protobuf"]).toContain(last.kind);
    expect(last.byteOffset).toBeGreaterThanOrEqual(0);
    expect(last.byteOffset).toBeLessThanOrEqual(truncated.length);
    expect(Number.isFinite(last.tick)).toBe(true);

    // The truncation must be caught LATE — i.e. far past the header. A
    // regression that aborts on the first frame would fail this guard.
    expect(last.byteOffset).toBeGreaterThan(1072);
  });
});
