/**
 * StringTableParser — decode the bit-stream payload of a CreateStringTable
 * or UpdateStringTable message into a sequence of StringTableEntry records.
 *
 * Wire format (per Source SDK 2013 `dem_stringtable.cpp` and corroborated
 * against `markus-wa/demoinfocs-golang/pkg/demoinfocs/stringtable.go`):
 *
 *   For each of the `numEntries` entries:
 *     1. Index encoding:
 *          read 1 bit:
 *            1  -> next index = previous + 1
 *            0  -> read entryBits as the absolute index
 *
 *     2. String encoding:
 *          read 1 bit:
 *            1  -> entry has a string this update; read it as below
 *            0  -> reuse existing string at this index (no string read)
 *
 *        If a string is present:
 *          read 1 bit:
 *            1  -> history-prefix mode:
 *                    historyIndex = readBits(5)
 *                    bytesToCopy  = readBits(SUBSTRING_BITS=5)
 *                    suffix       = readNullTerminatedString()
 *                    finalString  = history[historyIndex].slice(0, bytesToCopy) + suffix
 *            0  -> direct mode:
 *                    finalString = readNullTerminatedString()
 *
 *     3. User data encoding:
 *          read 1 bit:
 *            1  -> userdata follows
 *            0  -> no userdata
 *
 *        If userdata is present:
 *          if table.userDataFixedSize:
 *              userDataBits = userDataSizeBits
 *              read those bits as raw bytes (round up)
 *          else:
 *              userDataLengthBytes = readBits(USER_DATA_SIZE_BITS=14)  // max 16383
 *              read userDataLengthBytes * 8 bits as raw bytes
 *
 *     4. Append the resolved string to the recent-history ring (32-slot
 *        circular buffer). A subsequent entry's history-prefix reference
 *        reads from this ring.
 *
 * The ring is shared across the entire create+update lifecycle of one
 * table — UpdateStringTable does NOT reset it. The implementation here
 * accepts an optional pre-existing history ring so the dispatcher can
 * thread the same ring through subsequent updates.
 *
 * NOTE: A common confusion is whether the `userinfo` table's userdata is
 * also bit-aligned. It isn't — once we've read the 14-bit length, the
 * userdata bytes follow at the current bit alignment. BitReader.readBytes
 * handles unaligned reads transparently.
 */
import { BitReader } from "../reader/BitReader.js";
import type { StringTable, StringTableEntry } from "./StringTable.js";

/** Maximum entries kept in the recent-history ring for prefix references.
 * Source's HISTORY_BITS is 5 (so the index field can address up to 32),
 * but the ring is capped at 31 in practice — demoinfocs's
 * `processStringTable` keeps `len(hist) <= 31` by trimming when it exceeds. */
const HISTORY_SIZE = 31;
/** Bits used for the recent-history index in a prefix-reference entry. */
const HISTORY_BITS = 5;
/** Bits used for the prefix-byte-count in a prefix-reference entry. */
const SUBSTRING_BITS = 5;
/** Bits used for the variable-size userdata length (max 2^14 - 1 = 16383). */
const USER_DATA_SIZE_BITS = 14;
/** Maximum string length we'll read for an entry key (Source's MAX_USER_STRING). */
const MAX_USERDATA_BITS = 14;
/** Hard cap on a single decoded string length (defensive — Source's
 * MAX_VALUE_LEN is 1024 for misc tables; we go a little higher to be safe). */
const MAX_STRING_LENGTH = 4096;

/**
 * Result of parsing one CreateStringTable or UpdateStringTable payload.
 * `changedEntries` is the ordered list of entries created or modified by
 * this message — the dispatcher emits this array verbatim in the
 * `stringTableUpdated` event payload.
 */
export interface ParseStringTableResult {
  changedEntries: StringTableEntry[];
}

/**
 * Decode `numEntries` entries from `bitReader` into `table`, threading the
 * shared history ring through. Returns the list of entries that changed
 * (in wire order), suitable for emitting as an event payload.
 *
 * Mutation: this function appends/overwrites entries on `table` as it goes.
 * It does not assume the table started empty — UpdateStringTable calls in
 * with the same table that CreateStringTable populated.
 *
 * The history ring is mutated: each resolved entry string is pushed into
 * the ring, evicting the oldest slot when full. Pass the same `history`
 * array to subsequent updates of the same table.
 */
export function parseStringTableEntries(
  bitReader: BitReader,
  table: StringTable,
  numEntries: number,
  history: string[] = [],
): ParseStringTableResult {
  const changedEntries: StringTableEntry[] = [];
  let lastIndex = -1;

  for (let i = 0; i < numEntries; i++) {
    // 1. Index encoding.
    //
    // bit=1: sequential (previous + 1, the common case).
    // bit=0: read absolute index in `entryBits` bits.
    //
    // Verified against demoinfocs-golang v3.0.0
    // pkg/demoinfocs/stringtables.go::processStringTable.
    let index: number;
    if (bitReader.readBit() === 1) {
      index = lastIndex + 1;
    } else {
      const entryBits = bitsForMaxEntries(table.maxEntries);
      index = bitReader.readBits(entryBits);
    }
    lastIndex = index;

    // 2. String encoding.
    let entryString: string | undefined;
    if (bitReader.readBit() === 1) {
      if (bitReader.readBit() === 1) {
        // History-prefix mode.
        const historyIndex = bitReader.readBits(HISTORY_BITS);
        const bytesToCopy = bitReader.readBits(SUBSTRING_BITS);
        const suffix = bitReader.readString(MAX_STRING_LENGTH);
        const prefixSource = history[historyIndex] ?? "";
        // Slice the byte prefix using string indexing — Source operates on
        // bytes, not code points, but the strings here are ASCII (player
        // names, model paths, class IDs) so byte == char.
        const prefix = prefixSource.slice(0, bytesToCopy);
        entryString = prefix + suffix;
      } else {
        // Direct mode.
        entryString = bitReader.readString(MAX_STRING_LENGTH);
      }
    }

    // 3. User data encoding.
    let userData: Uint8Array | undefined;
    if (bitReader.readBit() === 1) {
      if (table.userDataFixedSize) {
        // Fixed-size: read userDataSizeBits raw bits, then mask the trailing
        // partial byte if the bit count isn't a multiple of 8. Source rounds
        // up to whole bytes by zero-padding, so we read ceil(bits/8) bytes
        // worth of bits via readBits + accumulation.
        userData = readFixedUserData(bitReader, table.userDataSizeBits);
      } else {
        const lengthBytes = bitReader.readBits(USER_DATA_SIZE_BITS);
        userData = bitReader.readBytes(lengthBytes);
      }
    }

    // Determine the final key for this entry — it's the entry string we just
    // read, OR (if no string this update) the key already at this index.
    let key: string;
    if (entryString !== undefined) {
      key = entryString;
    } else {
      const existing = table.getByIndex(index);
      // If neither side provided a string, the key is empty — this happens
      // for create-time placeholder entries that get filled in later.
      key = existing?.key ?? "";
    }

    const stored = table.setEntry(index, key, userData);
    changedEntries.push(stored);

    // 4. Push the resolved entry string onto the history ring. We push the
    // key we just stored (whether new or carried over) — the ring tracks
    // recent strings regardless of whether they came from the wire or from
    // an earlier entry.
    if (history.length < HISTORY_SIZE) {
      history.push(key);
    } else {
      history.shift();
      history.push(key);
    }
  }

  return { changedEntries };
}

/**
 * Compute the bit width needed to address `maxEntries`. Source uses
 * `Q_log2(maxEntries)` which is `floor(log2)` — ceil isn't right because
 * for a power-of-two N the indices are [0, N-1] and need exactly log2(N)
 * bits, not log2(N)+1.
 *
 * Examples:
 *   maxEntries=64    -> 6 bits  (indices 0..63)
 *   maxEntries=2048  -> 11 bits (indices 0..2047)
 *   maxEntries=1024  -> 10 bits
 *
 * For the (rare) non-power-of-two case we fall back to ceil(log2).
 */
export function bitsForMaxEntries(maxEntries: number): number {
  if (maxEntries <= 1) return 0;
  // Round up to nearest power of two via Math.ceil(log2).
  return Math.ceil(Math.log2(maxEntries));
}

/**
 * Read a fixed-size userdata blob: `userDataSizeBits` bits, returned as a
 * byte array of `ceil(userDataSizeBits / 8)` bytes. Trailing partial-byte
 * bits land in the high bits of the last output byte.
 */
function readFixedUserData(bitReader: BitReader, userDataSizeBits: number): Uint8Array {
  if (userDataSizeBits <= 0) return new Uint8Array(0);
  const fullBytes = userDataSizeBits >>> 3;
  const trailingBits = userDataSizeBits & 7;
  if (trailingBits === 0) {
    return bitReader.readBytes(fullBytes);
  }
  const out = new Uint8Array(fullBytes + 1);
  if (fullBytes > 0) {
    const head = bitReader.readBytes(fullBytes);
    out.set(head);
  }
  out[fullBytes] = bitReader.readBits(trailingBits);
  return out;
}

// Marker imports kept so future subsystems can grep for the bit-budget
// constants (USER_DATA_SIZE_BITS, etc.) without re-deriving them.
export const _BIT_CONSTANTS = Object.freeze({
  HISTORY_SIZE,
  HISTORY_BITS,
  SUBSTRING_BITS,
  USER_DATA_SIZE_BITS,
  MAX_USERDATA_BITS,
});
