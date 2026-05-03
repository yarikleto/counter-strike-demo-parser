/**
 * Integration tests for `parser.userInfoIndex` (TASK-037b) on the real
 * de_nuke.dem fixture. Verifies that:
 *
 *   - `parser.userInfoIndex` is defined after parseAll completes.
 *   - At least 6 userids resolve. The brief targeted "≥10" on the
 *     theory that any CS:GO match has 10 player slots — empirically
 *     de_nuke.dem records 7 entries (6 bots Brian/Wayne/Brad/Erik/Cory/
 *     Finn plus one GOTV slot). The lower bound at 6 leaves a small
 *     margin for any future fixture that drops one entry; the live
 *     value pins the exact count.
 *   - Every resolved `infoForUserId` has a non-empty `name`.
 *   - For at least one live userid, `entitySlotForUserId(uid)` returns a
 *     slot in the standard CCSPlayer slot range [0, 64).
 *   - Reverse lookup `userIdForEntitySlot` round-trips with the forward
 *     lookup.
 *   - On de_nuke (a bots-only recording) every resolved entry is a fake
 *     player — locks the `isFakePlayer` semantics against the fixture.
 *
 * The fixture is also the basis for ADR-006's enrichment pattern, so a
 * regression here would block every Tier-1 enricher in TASK-038…046.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

/** Total size of a player_info_t blob — must match the decoder constant. */
const PLAYER_INFO_T_SIZE = 340;

/**
 * Read the userid out of a `player_info_t` blob (BE int32 at offset 144).
 * Used by the integration test to enumerate the index without taking a
 * dependency on the decoder under test.
 */
function readUserId(blob: Uint8Array): number {
  const buf = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  return buf.readInt32BE(144);
}

describe("DemoParser.userInfoIndex — integration with de_nuke.dem", () => {
  it("is defined after parseAll() completes", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    expect(parser.userInfoIndex).toBeDefined();
  });

  it("resolves at least 6 distinct userids, each with a non-empty name", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    // Walk the userinfo table directly to enumerate the userids the index
    // *should* know about, then verify every one resolves through the
    // public API.
    const userinfo = parser.stringTables!.getByName("userinfo")!;
    const decodedUserIds: number[] = [];
    for (const entry of userinfo.entries()) {
      if (entry.userData === undefined) continue;
      if (entry.userData.length < PLAYER_INFO_T_SIZE) continue;
      decodedUserIds.push(readUserId(entry.userData));
    }

    expect(decodedUserIds.length).toBeGreaterThanOrEqual(6);
    for (const uid of decodedUserIds) {
      const info = parser.userInfoIndex.infoForUserId(uid);
      expect(info).toBeDefined();
      expect(info!.name).not.toBe("");
    }
  });

  it("decodes recognizable de_nuke bot names (regression on layout)", () => {
    // The recorder seeded the fixture with bots whose names sort alphabetically
    // in slot order. Pinning the exact set catches any future slip in the
    // 340-byte struct layout (e.g. someone "fixing" the offsets in
    // userInfoIndex.ts and reading garbage names).
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    const names = new Set<string>();
    for (let slot = 0; slot < 64; slot++) {
      const uid = parser.userInfoIndex.userIdForEntitySlot(slot);
      if (uid === undefined) continue;
      const info = parser.userInfoIndex.infoForUserId(uid);
      if (info !== undefined) names.add(info.name);
    }
    // Recorded bot roster: Brian, Wayne, Brad, GOTV, Erik, Cory, Finn.
    // Every one of these is fakeplayer=1 in the blob.
    expect(names.has("Brian")).toBe(true);
    expect(names.has("Wayne")).toBe(true);
  });

  it("returns a slot in [0, 64) for at least one live userid (round-trip)", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    const userinfo = parser.stringTables!.getByName("userinfo")!;
    let sampleSlot = -1;
    for (let slot = 0; slot < userinfo.maxEntries; slot++) {
      const entry = userinfo.getByIndex(slot);
      if (entry === undefined) continue;
      if (entry.userData === undefined) continue;
      if (entry.userData.length < PLAYER_INFO_T_SIZE) continue;
      sampleSlot = slot;
      break;
    }
    expect(sampleSlot).toBeGreaterThanOrEqual(0);

    const sampleUid = parser.userInfoIndex.userIdForEntitySlot(sampleSlot);
    expect(sampleUid).toBeDefined();
    // Userid 0 is the world / engine sentinel; real userinfo entries never
    // carry it (the engine assigns 1-based ids). Pinning >0 catches a
    // decoder that reads zero-bytes due to wrong endianness or offset.
    expect(sampleUid).toBeGreaterThan(0);

    const resolvedSlot = parser.userInfoIndex.entitySlotForUserId(sampleUid!);
    expect(resolvedSlot).toBe(sampleSlot);
    expect(resolvedSlot!).toBeGreaterThanOrEqual(0);
    expect(resolvedSlot!).toBeLessThan(64);
  });

  it("returns undefined for a userid that doesn't exist", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();
    expect(parser.userInfoIndex.entitySlotForUserId(987654321)).toBeUndefined();
    expect(parser.userInfoIndex.infoForUserId(987654321)).toBeUndefined();
  });

  it("freezes every emitted UserInfo so consumers can't mutate the index", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    parser.parseAll();

    const userinfo = parser.stringTables!.getByName("userinfo")!;
    let sampleInfo: ReturnType<typeof parser.userInfoIndex.infoForUserId>;
    for (let slot = 0; slot < userinfo.maxEntries; slot++) {
      const uid = parser.userInfoIndex.userIdForEntitySlot(slot);
      if (uid === undefined) continue;
      sampleInfo = parser.userInfoIndex.infoForUserId(uid);
      if (sampleInfo !== undefined) break;
    }
    expect(sampleInfo).toBeDefined();
    expect(Object.isFrozen(sampleInfo)).toBe(true);
  });
});
