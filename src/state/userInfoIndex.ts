/**
 * UserInfoIndex — `userid -> entitySlot` resolver for CS:GO event enrichment.
 *
 * Per ADR-006 (Tier-1 event enrichment pattern), CS:GO game-event payloads
 * carry a `userid` integer field that is NOT an entity slot — it's the
 * server-side userId stored in the `player_info_t` userdata blob of the
 * `userinfo` string-table. Without a single canonical decoder, every Tier-1
 * enricher (TASK-038…046) would re-implement the same blob walk against the
 * raw `Uint8Array` exposed by `StringTableEntry.userData`. This module is
 * that one decoder.
 *
 * The `userinfo` string-table holds one entry per CS:GO player slot, keyed by
 * the slot index as a decimal string ("0", "1", ...). Each entry's userdata
 * is a fixed-width `player_info_t` struct (340 bytes on CS:GO). The slot is
 * the table index — i.e., `entitySlotForUserId(userId)` returns the index
 * where the matching blob lives, which is also the entity slot the server's
 * player entity occupies in CCSPlayer-space.
 *
 * Wire layout (Source `player_info_s`, CSGO build, all multi-byte integers
 * are NETWORK byte order = BIG-endian):
 *
 *     offset  size  field
 *     ------  ----  -----
 *          0     8  unknown / version sentinel (uint64 BE)
 *          8     8  xuid                       (uint64 BE — SteamID64)
 *         16   128  name                       (char[128] null-terminated)
 *        144     4  userId                     (int32  BE)
 *        148    33  guid                       (char[33] null-terminated)
 *        181     3  padding (alignment)
 *        184     4  friendsId                  (uint32 BE)
 *        188   128  friendsName                (char[128])
 *        316     1  fakeplayer                 (bool)
 *        317     1  ishltv                     (bool)
 *        318     2  padding
 *        320    16  customFiles[4]             (uint32×4 BE)
 *        336     1  filesDownloaded            (uchar)
 *        337     3  trailing padding
 *
 *     Total: 340 bytes.
 *
 * The all-big-endian convention surprised the original task brief, which
 * spec'd LE for everything except `xuid`. Empirical inspection of de_nuke.dem
 * confirms BE for `userId` and `friendsId` as well — userid bytes for the
 * fixture's bot at slot 0 are `00 00 00 83`, which is 131 (BE) not the
 * nonsensical `-2097152000` (LE). This matches demoinfocs-golang's
 * `playerInfoForUserID` which reads the entire struct in BE.
 *
 * Liveness: the index is rebuilt on demand via `refresh()`. The owning
 * DemoParser calls `refresh()` after every `userinfo`-table create/update
 * so the maps track joins/leaves across the whole parse. Per ADR-006 the
 * index must stay live for Tier-1 enrichers; the rebuild is bounded by
 * `userinfo`'s slot count — trivially cheap.
 *
 * Returned `UserInfo` objects are frozen so consumers can't mutate the
 * index by retaining a reference.
 *
 * Defensive parsing: a `userinfo` entry whose `userData` is missing or
 * shorter than the struct is silently skipped. The skip preserves the
 * invariant that `infoForUserId` returns a fully-populated record OR
 * `undefined` — never a half-decoded one.
 */
import { decodeUtf8 } from "../reader/text.js";
import type { StringTableManager } from "../stringtables/StringTableManager.js";

/**
 * Fixed size of a CSGO `player_info_t` blob. Demos can in principle ship
 * shorter blobs (some legacy builds, certain mid-tick reconnects) — the
 * decoder treats anything below this as malformed and skips it.
 */
const PLAYER_INFO_T_SIZE = 340;

/** Byte offsets within the `player_info_t` blob (see file-level layout). */
const OFFSET_XUID = 8;
const OFFSET_NAME = 16;
const NAME_LENGTH = 128;
const OFFSET_USER_ID = 144;
const OFFSET_FAKEPLAYER = 316;

/**
 * Typed roll-up of a single `player_info_t` entry, suitable for direct
 * exposure on Tier-1 event payloads. Frozen on emit; consumers cannot
 * mutate the index by retaining a reference.
 *
 * `xuid` is exposed as a string because uint64 doesn't fit safely in a JS
 * `number` (only 53 bits of integer precision). The string is the decimal
 * representation of the BigInt — round-trip-stable through `BigInt(info.xuid)`.
 */
export interface UserInfo {
  /** Player display name (null-terminated, up to 128 bytes UTF-8). */
  readonly name: string;
  /** SteamID64 as a decimal string. "0" for bots / unauthenticated. */
  readonly xuid: string;
  /** True if `fakeplayer` byte was non-zero (a bot, not a human). */
  readonly isFakePlayer: boolean;
  /**
   * Entity slot this user occupies — the index into the `userinfo` table
   * where the matching `player_info_t` blob lives. On CS:GO this is also
   * the slot the user's CCSPlayer entity occupies in the entity store.
   */
  readonly entitySlot: number;
}

export class UserInfoIndex {
  private readonly manager: StringTableManager;

  /** userId -> entitySlot. */
  private readonly userIdToSlot = new Map<number, number>();
  /** userId -> frozen UserInfo. */
  private readonly userIdToInfo = new Map<number, UserInfo>();
  /** entitySlot -> userId (reverse lookup for enrichers that have a slot). */
  private readonly slotToUserId = new Map<number, number>();
  /** SteamID64 (decimal) -> userId, for humans only (bots have xuid "0"). */
  private readonly xuidToUserId = new Map<string, number>();

  constructor(manager: StringTableManager) {
    this.manager = manager;
  }

  /**
   * Walk the `userinfo` table and rebuild every map. Idempotent — every
   * call wipes the prior state and decodes from the current table contents.
   * Cheap: `userinfo` has at most 256 entries (typical CSGO recordings cap
   * at 64 player slots; the table's `maxEntries` is set by the recorder).
   */
  refresh(): void {
    this.userIdToSlot.clear();
    this.userIdToInfo.clear();
    this.slotToUserId.clear();
    this.xuidToUserId.clear();

    const table = this.manager.getByName("userinfo");
    if (table === undefined) return;

    for (let slot = 0; slot < table.maxEntries; slot++) {
      const entry = table.getByIndex(slot);
      if (entry === undefined) continue;
      if (entry.userData === undefined) continue;
      if (entry.userData.length < PLAYER_INFO_T_SIZE) continue;

      const decoded = decodePlayerInfo(entry.userData, slot);
      if (decoded === undefined) continue;

      this.userIdToSlot.set(decoded.userId, slot);
      this.slotToUserId.set(slot, decoded.userId);
      this.userIdToInfo.set(decoded.userId, decoded.info);
      if (decoded.info.xuid !== "0") this.xuidToUserId.set(decoded.info.xuid, decoded.userId);
    }
  }

  /**
   * Resolve a CS:GO event userid to the entity slot the player occupies, or
   * `undefined` if the userid isn't currently in the userinfo table (e.g.
   * the player disconnected or the index hasn't been refreshed since the
   * userinfo table was first populated).
   */
  entitySlotForUserId(userId: number): number | undefined {
    return this.userIdToSlot.get(userId);
  }

  /**
   * Resolve a CS:GO event userid to a frozen `UserInfo`, or `undefined` if
   * unknown. The returned object is frozen — consumers cannot mutate the
   * index by retaining a reference.
   */
  infoForUserId(userId: number): UserInfo | undefined {
    return this.userIdToInfo.get(userId);
  }

  /**
   * Reverse lookup: given an entity slot, find the userid the engine
   * currently has bound to that slot. Used by enrichers that receive an
   * entity reference and need the wire-level userid for downstream lookups.
   */
  userIdForEntitySlot(entitySlot: number): number | undefined {
    return this.slotToUserId.get(entitySlot);
  }

  /**
   * Find the userid currently bound to a SteamID64 (decimal string), or
   * `undefined` if no connected human has it. Bots (xuid "0") never match.
   */
  userIdForXuid(xuid: string): number | undefined {
    return this.xuidToUserId.get(xuid);
  }
}

/**
 * Decode a single `player_info_t` blob. Returns `undefined` if the blob is
 * structurally invalid (the caller has already length-checked, but this
 * guards against any byte-level pathology).
 */
function decodePlayerInfo(
  blob: Uint8Array,
  entitySlot: number,
): { userId: number; info: UserInfo } | undefined {
  // DataView gives us big-endian readers (the shared ByteReader in the
  // codebase is LE-only). Source networks every multi-byte integer in
  // `player_info_t` in network byte order. Out-of-range reads throw
  // RangeError, which we map to "structurally invalid".
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);

  let xuid: bigint;
  let userId: number;
  let fakeplayer: number;
  let nameRaw: Uint8Array;
  try {
    xuid = view.getBigUint64(OFFSET_XUID);
    nameRaw = blob.subarray(OFFSET_NAME, OFFSET_NAME + NAME_LENGTH);
    userId = view.getInt32(OFFSET_USER_ID);
    fakeplayer = view.getUint8(OFFSET_FAKEPLAYER);
  } catch {
    return undefined;
  }

  // Truncate `name` at the first null byte (Source's fixed-width string
  // convention — same shape ByteReader.readString produces).
  const nullIndex = nameRaw.indexOf(0);
  const nameEnd = nullIndex === -1 ? nameRaw.length : nullIndex;
  const name = decodeUtf8(nameRaw, 0, nameEnd);

  const info: UserInfo = Object.freeze({
    name,
    xuid: xuid.toString(),
    isFakePlayer: fakeplayer !== 0,
    entitySlot,
  });

  return { userId, info };
}
