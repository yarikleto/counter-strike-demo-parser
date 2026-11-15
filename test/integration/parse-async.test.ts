/**
 * Asynchronous parsing: progress reporting, cooperative yielding and
 * cancellation through an AbortSignal (used by the Web Worker integration).
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { DemoParser } from "../../src/node.js";
import type { ParseProgress } from "../../src/browser.js";
import { fixtureAvailable } from "./_fixture.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe.skipIf(!fixtureAvailable)("async parsing (de_nuke)", () => {
  const bytes = fixtureAvailable ? readFileSync(FIXTURE) : new Uint8Array();

  it("reports monotonically increasing progress ending at 100%", async () => {
    const seen: ParseProgress[] = [];
    const result = await DemoParser.parse(bytes, {
      onProgress: (p) => seen.push(p),
      yieldIntervalMs: 20,
    });
    expect(seen.length).toBeGreaterThan(3);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.bytesParsed).toBeGreaterThanOrEqual(seen[i - 1]!.bytesParsed);
      expect(seen[i]!.tick).toBeGreaterThanOrEqual(seen[i - 1]!.tick);
    }
    const last = seen[seen.length - 1]!;
    expect(last.fraction).toBe(1);
    expect(last.totalBytes).toBe(bytes.length);
    expect(last.totalTicks).toBe(result.header.playbackTicks);
  });

  it("produces the same result as the synchronous path", async () => {
    const sync = await DemoParser.parse(bytes);
    const async = await DemoParser.parse(bytes, { onProgress: () => undefined });
    expect(async.kills).toEqual(sync.kills);
    expect(async.rounds.length).toBe(sync.rounds.length);
    expect(async.grenades).toEqual(sync.grenades);
  });

  it("lets other tasks run between slices", async () => {
    let timerFired = false;
    setTimeout(() => (timerFired = true), 0);
    let firedMidParse = false;
    await DemoParser.parse(bytes, {
      yieldIntervalMs: 10,
      onProgress: (p) => {
        if (p.fraction < 1 && timerFired) firedMidParse = true;
      },
    });
    expect(firedMidParse).toBe(true);
  });

  it("stops early and rejects with AbortError when the signal aborts", async () => {
    const controller = new AbortController();
    let lastFraction = 0;
    const promise = DemoParser.parse(bytes, {
      signal: controller.signal,
      yieldIntervalMs: 10,
      onProgress: (p) => {
        lastFraction = p.fraction;
        if (p.fraction > 0.2) controller.abort();
      },
    });
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(lastFraction).toBeLessThan(0.6);
  });

  it("rejects immediately for an already-aborted signal", async () => {
    await expect(DemoParser.parse(bytes, { signal: AbortSignal.abort() })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
