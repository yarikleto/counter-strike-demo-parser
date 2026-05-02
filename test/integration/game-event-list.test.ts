import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("CSVCMsg_GameEventList — integration with real demo file", () => {
  it("populates parser.gameEventDescriptors after parseAll() on de_nuke.dem", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    expect(parser.gameEventDescriptors).toBeUndefined();

    parser.parseAll();

    expect(parser.gameEventDescriptors).toBeDefined();
  });

  it("exposes 100+ descriptors (CS:GO networks 169+ events)", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    // CS:GO networks 169+ events; we floor at 100 to avoid pinning the exact
    // count (it varies between minor server builds).
    expect(parser.gameEventDescriptors!.size).toBeGreaterThan(100);
  });

  it("decodes the player_death descriptor with the expected key types", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    const desc = parser.gameEventDescriptors!.getByName("player_death");
    expect(desc).toBeDefined();
    expect(desc!.name).toBe("player_death");
    expect(desc!.eventId).toBeGreaterThan(0);

    // Build a name->type lookup from the descriptor's keys; assert types only
    // for keys we expect to be present. Don't pin the FULL key set — Source
    // server builds vary slightly, and over-pinning would make this test
    // brittle for no analytic value.
    const keyTypes = new Map(desc!.keys.map((k) => [k.name, k.type]));
    expect(keyTypes.get("userid")).toBe("short");
    expect(keyTypes.get("attacker")).toBe("short");
    expect(keyTypes.get("weapon")).toBe("string");
    expect(keyTypes.get("headshot")).toBe("bool");
  });

  it("emits gameEventListReady exactly once during parseAll()", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    let fireCount = 0;
    let captured: number | undefined;
    parser.on("gameEventListReady", (table) => {
      fireCount++;
      captured = table.size;
    });

    parser.parseAll();

    expect(fireCount).toBe(1);
    expect(captured).toBeGreaterThan(100);
  });

  it("exposes round_start as a known descriptor (sanity-check second event)", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    const roundStart = parser.gameEventDescriptors!.getByName("round_start");
    expect(roundStart).toBeDefined();
    // Every getByName hit must round-trip via getById.
    expect(parser.gameEventDescriptors!.getById(roundStart!.eventId)).toBe(
      roundStart,
    );
  });
});
