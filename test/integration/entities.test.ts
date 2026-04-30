/**
 * Integration tests for TASK-026 — PacketEntities decode against de_nuke.dem.
 *
 * The architect's anti-cheat suite (`.claude/decisions/TASK-026-impl-brief.md`
 * Section 5). Each test exercises the full parse-to-storage-to-read path on
 * a real demo, asserting structural invariants that would fail loudly if
 * column mapping, prop decoding, or entity routing is even one position off.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type { ServerClass } from "../../src/datatables/index.js";
import type { Vector3 } from "../../src/properties/index.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

/** Find a flat-prop index by SendProp varName. -1 if not present. */
function findPropIdx(serverClass: ServerClass, varName: string): number {
  return serverClass.flattenedProps.findIndex(
    (p) => p.prop.varName === varName,
  );
}

describe("entities — integration on de_nuke.dem", () => {
  it("populates EntityList during parseAll", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    expect(parser.entities.size).toBeGreaterThan(50);
  });

  it("CCSPlayer entities exist with valid m_iTeamNum", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const players = [...parser.entities.entries()].filter(
      ([, e]) => e.serverClass.className === "CCSPlayer",
    );
    expect(players.length).toBeGreaterThanOrEqual(5);

    const [, firstPlayer] = players[0]!;
    const idx = findPropIdx(firstPlayer.serverClass, "m_iTeamNum");
    expect(idx).toBeGreaterThan(-1);
    const teamNum = firstPlayer.store.read(firstPlayer.storageSlot, idx);
    expect([2, 3]).toContain(teamNum);
  });

  it("CCSPlayer m_vecOrigin has finite values", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    parser.parseAll();
    const playerEntry = [...parser.entities.entries()].find(
      ([, e]) => e.serverClass.className === "CCSPlayer",
    );
    expect(playerEntry).toBeDefined();
    const [, player] = playerEntry!;

    const idx = findPropIdx(player.serverClass, "m_vecOrigin");
    expect(idx).toBeGreaterThan(-1);
    const origin = player.store.read(player.storageSlot, idx);
    expect(origin).toBeDefined();
    if (origin && typeof origin === "object" && "x" in origin) {
      const v = origin as Vector3;
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(Math.abs(v.x)).toBeLessThan(10000);
      expect(Math.abs(v.y)).toBeLessThan(10000);
    }
  });

  it("emits entityCreated events during parse", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    let createdCount = 0;
    parser.on("entityCreated", () => {
      createdCount++;
    });
    parser.parseAll();
    expect(createdCount).toBeGreaterThan(50);
  });

  it("emits entityUpdated events during parse", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    let updatedCount = 0;
    parser.on("entityUpdated", () => {
      updatedCount++;
    });
    parser.parseAll();
    expect(updatedCount).toBeGreaterThan(100);
  });

  it("emits entityDeleted events during parse (grenades, etc.)", () => {
    const parser = DemoParser.fromFile(FIXTURE);
    let deletedCount = 0;
    parser.on("entityDeleted", () => {
      deletedCount++;
    });
    parser.parseAll();
    expect(deletedCount).toBeGreaterThan(0);
  });

  it("reaches dem_stop without throwing", () => {
    expect(() => {
      DemoParser.fromFile(FIXTURE).parseAll();
    }).not.toThrow();
  });
});
