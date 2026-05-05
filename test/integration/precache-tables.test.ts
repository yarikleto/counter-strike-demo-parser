/**
 * Integration test for the three precache string-table accessors —
 * `modelPrecache` (TASK-052), `soundPrecache` (TASK-053), and
 * `downloadables` (TASK-054) — against the de_nuke.dem fixture.
 *
 * Asserts only what's structurally invariant on a well-formed CSGO demo:
 *   - modelprecache is always populated (every entity carries a model).
 *     First entry must look like a Source `.mdl` file path.
 *   - soundprecache MAY be empty (the server only precaches sounds it
 *     intends to network) — assert non-negative size and that the
 *     accessor doesn't throw.
 *   - downloadables is typically empty on clean competitive demos —
 *     assert non-negative size and that the accessor doesn't throw.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("precache tables — integration with de_nuke.dem", () => {
  it("modelPrecache is populated and entries look like .mdl paths", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    expect(parser.modelPrecache.size).toBeGreaterThan(0);

    // Source reserves model index 0 as an empty placeholder ("?") — the
    // first real precached model lives at index 1 or later. The leading
    // populated entry is conventionally the map's `.bsp`; later entries
    // include `.mdl` files plus `*N` BSP-embedded brush-model aliases.
    const all = parser.modelPrecache.all();
    const firstReal = all.find((p) => p.length > 0);
    expect(firstReal).toBeDefined();
    expect(firstReal!).toMatch(/^[\w./_-]+\.(mdl|bsp)$/i);

    // Spot-check: at least one entry must be a `.mdl` file — entities
    // reference these via `m_nModelIndex`, which is the load-bearing
    // use-case for this table.
    const mdlEntry = all.find((p) => /\.mdl$/i.test(p));
    expect(mdlEntry).toBeDefined();
    expect(mdlEntry!).toMatch(/\.mdl$/i);
  });

  it("soundPrecache accessor is reachable and consistent", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    // Soundprecache may legitimately be empty on demos where the server
    // doesn't precache any networked sounds. Assert non-negative size and
    // that lookups don't throw — that's the meaningful invariant.
    expect(parser.soundPrecache.size).toBeGreaterThanOrEqual(0);
    expect(() => parser.soundPrecache.get(0)).not.toThrow();
    expect(() => parser.soundPrecache.all()).not.toThrow();
    if (parser.soundPrecache.size > 0) {
      expect(parser.soundPrecache.get(0)).toBeDefined();
    }
  });

  it("downloadables accessor is reachable and consistent", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    // Clean competitive matches generally ship no downloadables; the
    // accessor must still work.
    expect(parser.downloadables.size).toBeGreaterThanOrEqual(0);
    expect(() => parser.downloadables.get(0)).not.toThrow();
    expect(() => parser.downloadables.all()).not.toThrow();
  });

  it("memoization — repeat reads return the same wrapper instance", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    expect(parser.modelPrecache).toBe(parser.modelPrecache);
    expect(parser.soundPrecache).toBe(parser.soundPrecache);
    expect(parser.downloadables).toBe(parser.downloadables);
  });

  it("prints empirical sizes for de_nuke (no-op assertion)", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    // Visible during `vitest run` for empirical sanity-check.
    // eslint-disable-next-line no-console
    console.log(
      `[precache sizes] modelprecache=${parser.modelPrecache.size} ` +
        `soundprecache=${parser.soundPrecache.size} ` +
        `downloadables=${parser.downloadables.size}`,
    );
    expect(parser.modelPrecache.size).toBeGreaterThan(0);
  });
});
