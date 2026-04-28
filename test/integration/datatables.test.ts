/**
 * Integration test for the dem_datatables parsing path.
 *
 * Asserts that, after parseAll() on a real demo:
 *   - the SendTable registry is populated (size > 100, includes DT_CSPlayer)
 *   - the ServerClass registry is populated (size > 200) and resolves the
 *     well-known classes (CCSPlayer, CCSGameRulesProxy, CCSTeam, CWeaponAK47)
 *   - the linkage from ServerClass.dtName to SendTable is intact
 *
 * These thresholds come from the M2 Slice 1 plan: CS:GO ships ~270 server
 * classes and several hundred send tables. Anything materially below those
 * numbers means a parse went wrong (truncated stream, wrong field number,
 * etc.).
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("dem_datatables parsing — integration with de_nuke.dem", () => {
  it("populates the SendTable registry with the expected core tables", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    expect(parser.sendTables).toBeDefined();
    expect(parser.sendTables!.size).toBeGreaterThan(100);
    expect(parser.sendTables!.has("DT_CSPlayer")).toBe(true);

    const cs = parser.sendTables!.get("DT_CSPlayer");
    expect(cs).toBeDefined();
    expect(cs!.props.length).toBeGreaterThan(50);
  });

  it("populates the ServerClass registry with the expected classes", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    expect(parser.serverClasses).toBeDefined();
    expect(parser.serverClasses!.size).toBeGreaterThan(200);

    const player = parser.serverClasses!.byName("CCSPlayer");
    expect(player).toBeDefined();
    expect(player!.dtName).toBe("DT_CSPlayer");
    expect(player!.classId).toBeGreaterThan(0);
    expect(player!.sendTable).toBeDefined();

    expect(parser.serverClasses!.byName("CCSGameRulesProxy")).toBeDefined();
    expect(parser.serverClasses!.byName("CCSTeam")).toBeDefined();
    // Sanity check that weapon classes register. CS:GO's wire name for the
    // AK-47 class is `CAK47` (not `CWeaponAK47`) — and a representative
    // `CWeapon*` class is always present, e.g. `CWeaponAWP`.
    expect(parser.serverClasses!.byName("CAK47")).toBeDefined();
    expect(parser.serverClasses!.byName("CWeaponAWP")).toBeDefined();
  });

  it("exposes both indexes (id and name) consistently", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    const player = parser.serverClasses!.byName("CCSPlayer");
    expect(player).toBeDefined();
    const lookedUpById = parser.serverClasses!.byId(player!.classId);
    expect(lookedUpById).toBe(player);
  });
});
