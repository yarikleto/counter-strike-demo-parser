/**
 * Unit tests for UserInfoIndex (TASK-037b).
 *
 * The index resolves CS:GO event `userid` fields (an integer carried in the
 * `userinfo` string-table's `player_info_t` userdata blob) to entity slots
 * and to a typed `UserInfo` shape (`{ name, xuid, isFakePlayer, entitySlot }`).
 *
 * Tests are written against a synthetic `StringTable` populated with hand-
 * built `player_info_t` blobs — no .dem fixture, no parser. The blob layout
 * matches the empirical CSGO struct (340 bytes; all multi-byte integers
 * BIG-endian; offsets verified against de_nuke.dem):
 *
 *     offset  size  field
 *     ------  ----  -----
 *          0     8  unknown / version sentinel (uint64 BE)
 *          8     8  xuid                       (uint64 BE)
 *         16   128  name                       (char[128])
 *        144     4  userId                     (int32  BE)
 *        148    33  guid                       (char[33])
 *        184     4  friendsId                  (uint32 BE)
 *        188   128  friendsName                (char[128])
 *        316     1  fakeplayer                 (bool)
 *        317     1  ishltv                     (bool)
 *        320    16  customFiles[4]             (uint32×4 BE)
 *        336     1  filesDownloaded
 *
 * The mapping `userId -> entitySlot` deserves a one-line explanation: the
 * `player_info_t` blob is keyed in the `userinfo` table by the slot index
 * (as a decimal string, "0".."63"); the SLOT is the table index, the
 * USERID is a separate counter the engine assigns at connection time. So
 * `entitySlotForUserId(userId)` is a lookup that returns the index where
 * the matching blob lives.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { StringTable } from "../../../src/stringtables/StringTable.js";
import { StringTableManager } from "../../../src/stringtables/StringTableManager.js";
import { UserInfoIndex } from "../../../src/state/userInfoIndex.js";

/** Total size of a player_info_t blob in CSGO. */
const BLOB_SIZE = 340;

interface PlayerInfoFields {
  xuid: bigint;
  name: string;
  userId: number;
  guid: string;
  friendsId: number;
  friendsName: string;
  fakeplayer: boolean;
  ishltv: boolean;
}

/**
 * Build a 340-byte player_info_t blob from typed fields, matching the
 * empirical CSGO byte layout (all BE integers). Used to seed synthetic
 * userinfo tables for the unit tests.
 */
function buildBlob(fields: Partial<PlayerInfoFields>): Buffer {
  const blob = Buffer.alloc(BLOB_SIZE);

  // offset 0..7  — unknown / version sentinel. Real CSGO uses
  // 0xFFFFFFFFFFFFF002 here for unauthenticated entries; we leave zeros
  // since the decoder ignores this field.

  // offset 8..15 — uint64 xuid (BE).
  blob.writeBigUInt64BE(fields.xuid ?? 0n, 8);

  // offset 16..143 — char[128] name.
  const name = fields.name ?? "";
  blob.write(name, 16, "utf8");

  // offset 144..147 — int32 userId (BE).
  blob.writeInt32BE(fields.userId ?? 0, 144);

  // offset 148..180 — char[33] guid.
  const guid = fields.guid ?? "";
  blob.write(guid, 148, "utf8");

  // offset 184..187 — uint32 friendsId (BE).
  blob.writeUInt32BE(fields.friendsId ?? 0, 184);

  // offset 188..315 — char[128] friendsName.
  const friendsName = fields.friendsName ?? "";
  blob.write(friendsName, 188, "utf8");

  // offset 316 — bool fakeplayer.
  blob.writeUInt8(fields.fakeplayer ? 1 : 0, 316);

  // offset 317 — bool ishltv.
  blob.writeUInt8(fields.ishltv ? 1 : 0, 317);

  // offset 320..335 — uint32[4] customFiles (left zero).
  // offset 336      — uchar filesDownloaded (left zero).
  // offset 337..339 — trailing pad (left zero).

  return blob;
}

/** Construct a StringTableManager with a populated `userinfo` table. */
function makeRegistryWithUserinfo(
  entries: Array<{ slot: number; blob: Buffer | undefined }>,
): StringTableManager {
  const manager = new StringTableManager();
  const table = new StringTable({
    name: "userinfo",
    maxEntries: 256,
    userDataFixedSize: true,
    userDataSize: BLOB_SIZE,
    userDataSizeBits: BLOB_SIZE * 8,
    flags: 0,
  });
  manager.register(table);
  for (const { slot, blob } of entries) {
    table.setEntry(slot, String(slot), blob === undefined ? undefined : new Uint8Array(blob));
  }
  return manager;
}

describe("UserInfoIndex — happy path", () => {
  let manager: StringTableManager;
  let index: UserInfoIndex;

  beforeEach(() => {
    manager = makeRegistryWithUserinfo([
      {
        slot: 0,
        blob: buildBlob({
          xuid: 76561198000000001n,
          name: "alice",
          userId: 100,
          guid: "STEAM_1:0:1",
          fakeplayer: false,
        }),
      },
      {
        slot: 1,
        blob: buildBlob({
          xuid: 76561198000000002n,
          name: "bob",
          userId: 101,
          guid: "STEAM_1:1:1",
          fakeplayer: false,
        }),
      },
    ]);
    index = new UserInfoIndex(manager);
    index.refresh();
  });

  it("resolves userid -> entity slot", () => {
    expect(index.entitySlotForUserId(100)).toBe(0);
    expect(index.entitySlotForUserId(101)).toBe(1);
  });

  it("returns frozen UserInfo for a known userid", () => {
    const info = index.infoForUserId(100);
    expect(info).toBeDefined();
    expect(info!.name).toBe("alice");
    expect(info!.entitySlot).toBe(0);
    expect(info!.xuid).toBe("76561198000000001");
    expect(info!.isFakePlayer).toBe(false);
    expect(Object.isFrozen(info)).toBe(true);
  });

  it("supports reverse lookup userIdForEntitySlot", () => {
    expect(index.userIdForEntitySlot(0)).toBe(100);
    expect(index.userIdForEntitySlot(1)).toBe(101);
  });
});

describe("UserInfoIndex — fakeplayer flag", () => {
  it("surfaces isFakePlayer === true when fakeplayer byte is 1", () => {
    const manager = makeRegistryWithUserinfo([
      {
        slot: 0,
        blob: buildBlob({
          xuid: 0n,
          name: "BOT Bart",
          userId: 200,
          fakeplayer: true,
        }),
      },
    ]);
    const index = new UserInfoIndex(manager);
    index.refresh();

    const info = index.infoForUserId(200);
    expect(info).toBeDefined();
    expect(info!.isFakePlayer).toBe(true);
    expect(info!.name).toBe("BOT Bart");
  });

  it("surfaces isFakePlayer === false when fakeplayer byte is 0", () => {
    const manager = makeRegistryWithUserinfo([
      {
        slot: 0,
        blob: buildBlob({
          xuid: 76561198000000001n,
          name: "human",
          userId: 201,
          fakeplayer: false,
        }),
      },
    ]);
    const index = new UserInfoIndex(manager);
    index.refresh();

    expect(index.infoForUserId(201)!.isFakePlayer).toBe(false);
  });
});

describe("UserInfoIndex — missing entries", () => {
  it("returns undefined for an unknown userid", () => {
    const manager = makeRegistryWithUserinfo([
      { slot: 0, blob: buildBlob({ name: "alice", userId: 100 }) },
    ]);
    const index = new UserInfoIndex(manager);
    index.refresh();

    expect(index.entitySlotForUserId(99999)).toBeUndefined();
    expect(index.infoForUserId(99999)).toBeUndefined();
    expect(index.userIdForEntitySlot(63)).toBeUndefined();
  });

  it("returns undefined when no userinfo table is registered", () => {
    const empty = new StringTableManager();
    const index = new UserInfoIndex(empty);
    index.refresh();

    expect(index.entitySlotForUserId(100)).toBeUndefined();
    expect(index.infoForUserId(100)).toBeUndefined();
  });
});

describe("UserInfoIndex — malformed blob", () => {
  it("skips entries whose userdata is shorter than the player_info_t struct", () => {
    const shortBlob = Buffer.alloc(50); // way less than 340
    const manager = makeRegistryWithUserinfo([
      { slot: 0, blob: shortBlob },
      {
        slot: 1,
        blob: buildBlob({
          xuid: 76561198000000002n,
          name: "bob",
          userId: 101,
        }),
      },
    ]);
    const index = new UserInfoIndex(manager);

    // Building must not throw on the short blob.
    expect(() => index.refresh()).not.toThrow();

    // The malformed entry contributes nothing.
    // (We can't test "userid for slot 0" because we never decoded one;
    // every other valid entry must still be reachable.)
    expect(index.infoForUserId(101)).toBeDefined();
    expect(index.infoForUserId(101)!.entitySlot).toBe(1);
  });

  it("skips entries with no userdata at all", () => {
    const manager = makeRegistryWithUserinfo([
      { slot: 0, blob: undefined },
      {
        slot: 1,
        blob: buildBlob({
          name: "bob",
          userId: 101,
        }),
      },
    ]);
    const index = new UserInfoIndex(manager);
    expect(() => index.refresh()).not.toThrow();
    expect(index.infoForUserId(101)).toBeDefined();
  });
});

describe("UserInfoIndex — live updates", () => {
  it("rebuilds when refresh() is called after table mutation", () => {
    const manager = makeRegistryWithUserinfo([
      { slot: 0, blob: buildBlob({ name: "alice", userId: 100 }) },
    ]);
    const index = new UserInfoIndex(manager);
    index.refresh();
    expect(index.infoForUserId(100)!.name).toBe("alice");

    // Mid-demo, alice disconnects and dave takes slot 0 with a new userId.
    const userinfo = manager.getByName("userinfo")!;
    userinfo.setEntry(0, "0", new Uint8Array(buildBlob({ name: "dave", userId: 150 })));
    index.refresh();

    expect(index.infoForUserId(100)).toBeUndefined();
    expect(index.infoForUserId(150)).toBeDefined();
    expect(index.infoForUserId(150)!.name).toBe("dave");
    expect(index.infoForUserId(150)!.entitySlot).toBe(0);
    expect(index.userIdForEntitySlot(0)).toBe(150);
  });
});
