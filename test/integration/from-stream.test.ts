import { describe, it, expect } from "vitest";
import { createReadStream, readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

// TASK-071a: stream-input support. The fromStream factory drains any Node
// `Readable` into a Buffer and hands it to the parser. The high-level
// `DemoParser.parse(...)` async API also accepts a Readable directly.
//
// We only parse the demo header to verify byte-level reassembly — running the
// full pipeline twice on an 80MB fixture would dwarf the rest of the test
// suite. The header read is the smallest non-trivial proof that bytes round-
// trip correctly through the stream path; full-pipeline coverage already
// exists elsewhere via the path-based parse.
describe("DemoParser.fromStream() — integration on de_nuke.dem", () => {
  it("parses a file streamed via fs.createReadStream and recovers the full demo header", async () => {
    const stream = createReadStream(FIXTURE);
    const streamParser = await DemoParser.fromStream(stream);
    streamParser.parseAll();

    expect(streamParser.header).toBeDefined();
    expect(streamParser.header!.mapName).toBe("de_nuke");
    expect(streamParser.header!.playbackTicks).toBeGreaterThan(0);
  });

  it("reassembles a multi-chunk Readable.from(...) into the correct bytes", async () => {
    const full = readFileSync(FIXTURE);
    // Split arbitrarily into two chunks to prove `Buffer.concat` reassembly
    // through `for await`. `subarray` is zero-copy so memory stays bounded.
    // `objectMode: true` so each Buffer is yielded as one chunk rather than
    // re-chunked byte-by-byte by the default flowing-mode logic.
    const mid = Math.floor(full.length / 2);
    const stream = Readable.from([full.subarray(0, mid), full.subarray(mid)], {
      objectMode: true,
    });

    const parser = await DemoParser.fromStream(stream);
    parser.parseAll();

    expect(parser.header).toBeDefined();
    expect(parser.header!.mapName).toBe("de_nuke");
  });
});
