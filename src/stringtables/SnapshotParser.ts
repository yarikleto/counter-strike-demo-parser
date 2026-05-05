/**
 * SnapshotParser — decodes the byte-aligned `dem_stringtables` snapshot frame.
 *
 * `dem_stringtables` is a periodic full snapshot of every server-side string
 * table at the moment the frame was recorded. It is distinct from the
 * incremental `CSVCMsg_CreateStringTable` / `CSVCMsg_UpdateStringTable`
 * messages: those use Source's bit-stream history-encoding scheme, whereas
 * the snapshot frame is a plain `bf_write` byte blob with NO bit packing.
 * Consequently this decoder operates on a {@link ByteReader} alone — it does
 * not touch the bit-level `BitReader` path used by `StringTableParser`.
 *
 * Wire format (CSGO-era, stable since CS:GO release):
 * ```
 *   u8   numTables
 *   for each table:
 *     string  tableName             (null-terminated ASCII)
 *     u16     numEntries
 *     for each entry:
 *       string  key                 (null-terminated ASCII)
 *       u16     dataLength          (bytes; can be 0)
 *       bytes   data[dataLength]
 *     u8      hasClientEntries      (0 or 1)
 *     if hasClientEntries:
 *       u16     numClientEntries
 *       for each client entry:
 *         string  key
 *         u16     dataLength
 *         bytes   data[dataLength]
 * ```
 *
 * Strings are read until a 0x00 terminator; we decode them as UTF-8 (ASCII
 * is a strict subset, so this is safe for the engine's own table/key names).
 */
import { ByteReader } from "../reader/ByteReader.js";

/**
 * Decoded representation of a `dem_stringtables` snapshot frame.
 *
 * Each `tables[i]` mirrors the wire structure: a name + a list of entries
 * (each `key` + raw `data: Uint8Array` blob) + an optional list of client-
 * only entries appended at the end. The decoder is byte-aligned; it does
 * NOT use the bit-stream `BitReader` path that `CreateStringTable` uses —
 * see TASK-058 spec for the format reference.
 */
export interface DecodedStringTableSnapshot {
  readonly tables: ReadonlyArray<DecodedSnapshotTable>;
}

/** A single decoded table inside a snapshot. */
export interface DecodedSnapshotTable {
  readonly name: string;
  readonly entries: ReadonlyArray<DecodedSnapshotEntry>;
  readonly clientEntries: ReadonlyArray<DecodedSnapshotEntry>;
}

/** A single decoded entry — a string key plus an optional userdata blob. */
export interface DecodedSnapshotEntry {
  readonly key: string;
  readonly data: Uint8Array;
}

/**
 * Decode the body of a `dem_stringtables` frame into a list of decoded tables.
 *
 * The input `buffer` is the raw length-prefixed payload that the frame parser
 * extracted from the demo file (without the leading int32 length, which has
 * already been consumed). Throws `RangeError` if the buffer is truncated mid-
 * structure, matching the failure mode of the rest of the parser stack.
 */
export function parseStringTableSnapshot(buffer: Buffer): DecodedStringTableSnapshot {
  const reader = new ByteReader(buffer);
  const numTables = reader.readUInt8();
  const tables: DecodedSnapshotTable[] = [];
  for (let i = 0; i < numTables; i++) {
    tables.push(readTable(reader));
  }
  return { tables };
}

/** Read a single snapshot table at the reader's current cursor. */
function readTable(reader: ByteReader): DecodedSnapshotTable {
  const name = readNullTerminatedString(reader);
  const numEntries = readUInt16LE(reader);
  const entries: DecodedSnapshotEntry[] = [];
  for (let i = 0; i < numEntries; i++) {
    entries.push(readEntry(reader));
  }
  const hasClientEntries = reader.readUInt8();
  const clientEntries: DecodedSnapshotEntry[] = [];
  if (hasClientEntries === 1) {
    const numClientEntries = readUInt16LE(reader);
    for (let i = 0; i < numClientEntries; i++) {
      clientEntries.push(readEntry(reader));
    }
  }
  return { name, entries, clientEntries };
}

/** Read one `(key, dataLength, data[dataLength])` entry. */
function readEntry(reader: ByteReader): DecodedSnapshotEntry {
  const key = readNullTerminatedString(reader);
  const dataLength = readUInt16LE(reader);
  // `readBytes` returns a Buffer, which `extends Uint8Array`. We slice into a
  // standalone Uint8Array view to avoid handing callers a reference back into
  // the demo's underlying buffer (which a future read could re-slice).
  const slice = reader.readBytes(dataLength);
  const data = new Uint8Array(slice.byteLength);
  data.set(slice);
  return { key, data };
}

/**
 * Read a null-terminated ASCII/UTF-8 string from the reader.
 *
 * Source uses C-strings here — read bytes until the first 0x00, advance one
 * past the terminator, and decode the collected bytes as UTF-8 (ASCII is a
 * strict subset; non-ASCII bytes are exceedingly rare in engine table/key
 * names but UTF-8 decode keeps us correct if they appear).
 */
function readNullTerminatedString(reader: ByteReader): string {
  const start = reader.position;
  while (reader.readUInt8() !== 0) {
    // Loop body intentionally empty — `readUInt8` advances the cursor and
    // throws if we walk past the buffer end.
  }
  const end = reader.position - 1;
  const length = end - start;
  // Reset to read the bytes as a contiguous slice, then re-skip the
  // terminator so the cursor ends up exactly one past 0x00.
  reader.position = start;
  const raw = reader.readBytes(length);
  reader.readUInt8();
  return raw.toString("utf8");
}

/** Read an unsigned 16-bit little-endian integer. ByteReader has no native
 * u16 method, so we synthesise it from two u8 reads. */
function readUInt16LE(reader: ByteReader): number {
  const lo = reader.readUInt8();
  const hi = reader.readUInt8();
  return lo | (hi << 8);
}
