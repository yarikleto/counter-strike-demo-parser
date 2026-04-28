/**
 * Integration tests for string-table parsing on the real de_nuke.dem
 * fixture. Verifies that:
 *   - CreateStringTable handlers fire for the ~16 tables a CS:GO demo
 *     creates during signon.
 *   - The named tables `userinfo` and `instancebaseline` are present.
 *   - `userinfo` carries at least one entry (a player slot).
 *   - `instancebaseline` is present; its entries are populated only after
 *     TASK-024 enables Snappy decompression (since the table is
 *     compressed on the wire).
 *   - UpdateStringTable updates fire at least once during streaming
 *     parse.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("string tables — integration with de_nuke.dem", () => {
  it("registers at least 16 tables after parseAll", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    expect(parser.stringTables).toBeDefined();
    expect(parser.stringTables!.size).toBeGreaterThanOrEqual(16);
  });

  it("includes userinfo and instancebaseline tables by name", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    expect(parser.stringTables!.getByName("userinfo")).toBeDefined();
    expect(parser.stringTables!.getByName("instancebaseline")).toBeDefined();
  });

  it("populates userinfo with at least one player entry", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    const userinfo = parser.stringTables!.getByName("userinfo");
    expect(userinfo).toBeDefined();
    expect(userinfo!.size).toBeGreaterThan(0);
    // At least one entry must carry actual `player_info_t` userdata —
    // the empty slot entries don't count.
    const realPlayers = [...userinfo!.entries()].filter(
      (e) => e.userData !== undefined && e.userData.length > 0,
    );
    expect(realPlayers.length).toBeGreaterThan(0);
  });

  it("populates instancebaseline with class baselines", () => {
    // de_nuke's instancebaseline arrives uncompressed (no SNAP magic on
    // the bit-stream) so this test passes without exercising the snappy
    // path. The TASK-024 unit test in
    // test/unit/stringtables/Compression.test.ts exercises the snappy
    // path with synthetic SNAP-prefixed data.
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    const ib = parser.stringTables!.getByName("instancebaseline");
    expect(ib).toBeDefined();
    expect(ib!.size).toBeGreaterThan(0);
  });

  it("emits stringTableCreated for every registered table", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    const names: string[] = [];
    parser.on(
      "stringTableCreated",
      (payload: { name: string }) => {
        names.push(payload.name);
      },
    );
    parser.parseAll();
    expect(names.length).toBe(parser.stringTables!.size);
    expect(names).toContain("userinfo");
    expect(names).toContain("instancebaseline");
  });

  it("emits stringTableUpdated at least once during parse", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    let updateCount = 0;
    parser.on("stringTableUpdated", () => {
      updateCount += 1;
    });
    parser.parseAll();
    expect(updateCount).toBeGreaterThan(0);
  });
});
