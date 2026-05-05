/**
 * StringTable — a single named string table created by CreateStringTable.
 *
 * Source's network protocol uses string tables to deduplicate strings across
 * the lifetime of a match. Two tables matter for M2:
 *
 *   - `userinfo`           — up to 64 entries, one per player slot, each
 *                            carrying a `player_info_t` userdata blob
 *                            (steamid, name, etc).
 *   - `instancebaseline`   — one entry per ServerClass with a populated
 *                            baseline; the userdata blob is the default-value
 *                            byte stream for an entity of that class. The
 *                            entry KEY is the decimal class ID as a string
 *                            (e.g., "34"), not the C++ class name.
 *
 * Wire-level details (history-based encoding, fixed/variable user data, etc)
 * live in StringTableParser. This class is the storage shape — entries
 * indexed both by integer position (for the wire protocol's index-encoded
 * updates) and by key string (for application-level lookup).
 *
 * Mutability: entries can be appended (CreateStringTable) and overwritten in
 * place (UpdateStringTable). Indices never shift — once an entry exists at
 * index N, it stays at N for the table's lifetime.
 */

/** A single entry in a string table — a string key and an optional userdata blob. */
export interface StringTableEntry {
  /** The string key — e.g. a player slot index, a class ID, a model path. */
  key: string;
  /** Optional userdata blob. For `userinfo` this is `player_info_t`; for
   * `instancebaseline` it's the entity baseline byte stream. */
  userData?: Uint8Array;
}

/**
 * Options for constructing a StringTable. Mirrors the relevant fields from
 * CSVCMsg_CreateStringTable so the caller can pass them through verbatim.
 */
export interface StringTableOptions {
  /** Table name as written by the server (e.g. "userinfo", "instancebaseline"). */
  name: string;
  /** Maximum number of entries this table can hold. Determines `entryBits =
   * ceil(log2(maxEntries))`. */
  maxEntries: number;
  /** True if every entry carries a fixed-size userdata blob; false for
   * variable-size (or no userdata). */
  userDataFixedSize: boolean;
  /** Fixed-size userdata length in BYTES (only meaningful when
   * `userDataFixedSize === true`). */
  userDataSize: number;
  /** Fixed-size userdata length in BITS — same value as `userDataSize * 8`,
   * but Source sends both. We trust this one for the bit-stream read. */
  userDataSizeBits: number;
  /** CreateStringTable flags. Bit semantics are Source-version-dependent;
   * stored verbatim for downstream consumers. */
  flags: number;
}

export class StringTable {
  /** Server-assigned table name (e.g. `"userinfo"`, `"instancebaseline"`). */
  readonly name: string;
  /**
   * Hard cap on entry count for this table. Source uses this both as a
   * range check on entry indices and to derive the bit width of the
   * index field on the wire (`bitsForMaxEntries`).
   */
  readonly maxEntries: number;
  /** True when every entry's userdata is the same fixed bit width. */
  readonly userDataFixedSize: boolean;
  /**
   * Userdata length in bytes when `userDataFixedSize === true`. Always
   * exactly `userDataSizeBits / 8` rounded up; we trust `userDataSizeBits`
   * for the bit-stream read path because Source sometimes ships
   * non-byte-aligned bit widths.
   */
  readonly userDataSize: number;
  /**
   * Userdata length in BITS when `userDataFixedSize === true`. Authoritative
   * for the bit-stream parser; supersedes `userDataSize` when they disagree
   * (Source occasionally networks a non-byte-aligned width).
   */
  readonly userDataSizeBits: number;
  /**
   * `CSVCMsg_CreateStringTable.flags` — bit semantics depend on the demo's
   * Source build. Surfaced verbatim for downstream consumers; the parser
   * itself does not branch on these bits today.
   */
  readonly flags: number;

  /**
   * Entries indexed by their wire position. Sparse by construction — Source
   * may populate only some indices on create, then back-fill via update. We
   * use a plain array (not a Map) because index lookups are the hot path.
   */
  private readonly _entries: StringTableEntry[] = [];

  /** Secondary index: key -> wire position. Rebuilt incrementally. */
  private readonly _keyToIndex = new Map<string, number>();

  constructor(options: StringTableOptions) {
    this.name = options.name;
    this.maxEntries = options.maxEntries;
    this.userDataFixedSize = options.userDataFixedSize;
    this.userDataSize = options.userDataSize;
    this.userDataSizeBits = options.userDataSizeBits;
    this.flags = options.flags;
  }

  /**
   * Insert or overwrite the entry at the given wire index. Returns the
   * resulting entry (the same object stored in the table).
   *
   * If an entry already exists at `index`, its key and userdata are
   * replaced and the secondary key index is repointed; the entry object
   * itself is reused so external references stay live.
   */
  setEntry(index: number, key: string, userData?: Uint8Array): StringTableEntry {
    if (index < 0 || index >= this.maxEntries) {
      throw new RangeError(
        `StringTable("${this.name}"): entry index ${index} out of range ` +
          `[0, ${this.maxEntries})`,
      );
    }
    const existing = this._entries[index];
    if (existing !== undefined) {
      // Update path: repoint the key index if the key changed.
      if (existing.key !== key) {
        // Only drop the old key->index mapping if it still points at this
        // index (a later entry could have reused the same key string).
        if (this._keyToIndex.get(existing.key) === index) {
          this._keyToIndex.delete(existing.key);
        }
        existing.key = key;
        this._keyToIndex.set(key, index);
      }
      existing.userData = userData;
      return existing;
    }
    const entry: StringTableEntry = { key, userData };
    this._entries[index] = entry;
    this._keyToIndex.set(key, index);
    return entry;
  }

  /** Look up an entry by its string key. */
  getByName(key: string): StringTableEntry | undefined {
    const index = this._keyToIndex.get(key);
    if (index === undefined) return undefined;
    return this._entries[index];
  }

  /** Look up an entry by its wire index. */
  getByIndex(index: number): StringTableEntry | undefined {
    if (index < 0 || index >= this._entries.length) return undefined;
    return this._entries[index];
  }

  /**
   * Iterate every populated entry in wire-index order. Skips holes — sparse
   * indices that have not been populated yet.
   */
  *entries(): IterableIterator<StringTableEntry> {
    for (const entry of this._entries) {
      if (entry !== undefined) yield entry;
    }
  }

  /** Number of populated entries. */
  get size(): number {
    let count = 0;
    for (const entry of this._entries) {
      if (entry !== undefined) count += 1;
    }
    return count;
  }
}
