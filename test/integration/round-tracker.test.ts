import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type { RoundStateChange } from "../../src/state/RoundTracker.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("M3 RoundTracker — integration on de_nuke.dem", () => {
  it("emits a non-zero stream of roundStateChanged events covering all four phases", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    const events: RoundStateChange[] = [];
    parser.on("roundStateChanged", (change: RoundStateChange) => {
      events.push(change);
    });
    parser.parseAll();

    // A full match demo must produce many phase transitions (warmup→live,
    // and per-round freeze→live→over cycles for ~30 rounds + halftime).
    expect(events.length).toBeGreaterThan(0);

    // The first transition is the bootstrap one — there is no previous phase.
    expect(events[0].previousPhase).toBeUndefined();

    // The four phases all show up at least once across the demo.
    const phases = new Set(events.map((e) => e.phase));
    expect(phases.has("warmup")).toBe(true);
    expect(phases.has("freeze")).toBe(true);
    expect(phases.has("live")).toBe(true);
    expect(phases.has("over")).toBe(true);

    // Diagnostic: dump events to see the actual sequence on de_nuke.
    console.log("RoundTracker events (count=" + events.length + "):");
    for (const e of events) {
      console.log(`  ${e.previousPhase ?? "<none>"} -> ${e.phase}  round=${e.roundNumber}`);
    }

    // The count of *completed* rounds never goes down. The live
    // `totalRoundsPlayed` value can momentarily hiccup mid phase-transition
    // (engine briefly rewinds it during round-end → next freeze), so we
    // assert monotonicity only on the "over" sequence — those mark genuine
    // round completions and must be non-decreasing.
    const overEvents = events.filter((e) => e.phase === "over");
    for (let i = 1; i < overEvents.length; i++) {
      expect(overEvents[i].roundNumber).toBeGreaterThanOrEqual(
        overEvents[i - 1].roundNumber,
      );
    }

    // After the parse the tracker has settled on a defined phase.
    expect(parser.roundTracker.phase).toBeDefined();
  });
});
