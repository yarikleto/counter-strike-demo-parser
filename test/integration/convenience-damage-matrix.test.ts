/**
 * Integration test for `DamageMatrix` (TASK-065).
 *
 * Uses the real `DemoParser.parse()` API with the de_nuke fixture to verify
 * that the damage matrix is populated with realistic data from a full demo.
 *
 * These tests are deliberately coarse — they verify plausibility rather than
 * exact values, since the exact numbers depend on the fixture demo.
 */

import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DemoParser } from "../../src/DemoParser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "../fixtures/de_nuke.dem");

describe("DamageMatrix integration (de_nuke)", () => {
  it("produces > 50 damage entries across the match", async () => {
    const result = await DemoParser.parse(FIXTURE);
    const entries = [...result.damageMatrix.entries()];

    // A competitive de_nuke demo has many players dealing damage to each other.
    expect(entries.length).toBeGreaterThan(50);

    // Log the top entry by totalDamage for the reviewer.
    const top = entries.reduce((best, e) => (e.totalDamage > best.totalDamage ? e : best));
    console.log(
      `[DamageMatrix] top entry: attacker slot=${top.attacker.slot} → victim slot=${top.victim.slot}, totalDamage=${top.totalDamage}, hitCount=${top.hitCount}`,
    );
  });

  it("total damage across all match entries exceeds 1000", async () => {
    const result = await DemoParser.parse(FIXTURE);
    let total = 0;
    for (const e of result.damageMatrix.entries()) {
      total += e.totalDamage;
    }

    // A 32-round comp demo with ~200+ kills should produce well over 1000
    // total HP damage (each kill requires ~100 damage on average).
    expect(total).toBeGreaterThan(1000);
  });
});
