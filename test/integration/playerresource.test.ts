/**
 * Integration test for the CCSPlayerResource overlay against de_nuke.dem.
 *
 * Anchors:
 *   - The parser exposes a `playerResource` getter that returns a usable
 *     overlay once the singleton CCSPlayerResource entity exists in the
 *     entity list.
 *   - Per-slot stat lookups via `<stat>ForSlot(slot)` return concrete
 *     numbers (typically 0 at signon, since no rounds have been played
 *     yet on the de_nuke fixture).
 *   - Out-of-range slot reads return 0 rather than throwing.
 *   - `snapshot()` returns frozen, MAX_PLAYER_SLOTS-length arrays.
 *
 * Why this is the integration anchor: the unit tests cover overlay
 * mechanics with hand-built fakes; only a real demo fixture proves the
 * wire-format `(varName="000".."064", sourceTableName="m_iKills"|...)`
 * disambiguator works end-to-end through the Flattener and EntityStore.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import { MAX_PLAYER_SLOTS } from "../../src/state/PlayerResource.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("M3 PlayerResource overlay — integration on de_nuke.dem", () => {
  it("parser.playerResource is defined after parseAll()", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    expect(parser.playerResource).toBeDefined();
  });

  it("killsForSlot returns finite numbers for the first MAX_PLAYER_SLOTS slots", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const pr = parser.playerResource!;
    for (let slot = 0; slot < MAX_PLAYER_SLOTS; slot++) {
      const k = pr.killsForSlot(slot);
      expect(Number.isFinite(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(0);
    }
  });

  it("deathsForSlot, assistsForSlot, scoreForSlot, pingForSlot return finite numbers for slot 0", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const pr = parser.playerResource!;
    expect(Number.isFinite(pr.deathsForSlot(0))).toBe(true);
    expect(Number.isFinite(pr.assistsForSlot(0))).toBe(true);
    expect(Number.isFinite(pr.scoreForSlot(0))).toBe(true);
    expect(Number.isFinite(pr.pingForSlot(0))).toBe(true);
  });

  it("returns 0 for out-of-range slots (no throw)", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const pr = parser.playerResource!;
    expect(pr.killsForSlot(-1)).toBe(0);
    expect(pr.killsForSlot(MAX_PLAYER_SLOTS)).toBe(0);
    expect(pr.killsForSlot(99999)).toBe(0);
  });

  it("snapshot() returns frozen, MAX_PLAYER_SLOTS-length stat arrays", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const snap = parser.playerResource!.snapshot();
    expect(snap.kills).toHaveLength(MAX_PLAYER_SLOTS);
    expect(snap.deaths).toHaveLength(MAX_PLAYER_SLOTS);
    expect(snap.assists).toHaveLength(MAX_PLAYER_SLOTS);
    expect(snap.scores).toHaveLength(MAX_PLAYER_SLOTS);
    expect(snap.pings).toHaveLength(MAX_PLAYER_SLOTS);
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.kills)).toBe(true);
  });

  it("parser.playerResource is memoized (returns same reference)", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    expect(parser.playerResource).toBe(parser.playerResource);
  });
});
