/**
 * ByteReader — sequential binary reader over a Node.js Buffer.
 *
 * Tracks a cursor (position) and provides typed read methods for
 * little-endian integers, floats, raw byte slices, and fixed-length
 * null-terminated strings. Every read advances the cursor by the
 * number of bytes consumed.
 *
 * Design note: the cursor is a simple integer offset — no separate
 * "remaining" tracking. The Buffer itself is never copied; reads
 * return slices or values directly from the underlying memory.
 * Out-of-bounds reads throw immediately (fail fast) rather than
 * returning partial data.
 */
export class ByteReader {
  private readonly buffer: Buffer;
  private cursor: number;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this.cursor = 0;
  }

  /** Current read position (byte offset from start). */
  get position(): number {
    return this.cursor;
  }

  /** Seek to an absolute byte offset. */
  set position(offset: number) {
    this.cursor = offset;
  }

  /** Total length of the underlying buffer. */
  get length(): number {
    return this.buffer.length;
  }

  /** Read a signed 32-bit little-endian integer. Advances cursor by 4. */
  readInt32(): number {
    this.ensureAvailable(4);
    const value = this.buffer.readInt32LE(this.cursor);
    this.cursor += 4;
    return value;
  }

  /** Read an unsigned 32-bit little-endian integer. Advances cursor by 4. */
  readUInt32(): number {
    this.ensureAvailable(4);
    const value = this.buffer.readUInt32LE(this.cursor);
    this.cursor += 4;
    return value;
  }

  /** Read a 32-bit little-endian float. Advances cursor by 4. */
  readFloat32(): number {
    this.ensureAvailable(4);
    const value = this.buffer.readFloatLE(this.cursor);
    this.cursor += 4;
    return value;
  }

  /** Read exactly `n` bytes as a new Buffer. Advances cursor by `n`. */
  readBytes(n: number): Buffer {
    this.ensureAvailable(n);
    const slice = this.buffer.subarray(this.cursor, this.cursor + n);
    this.cursor += n;
    return slice;
  }

  /**
   * Read a fixed-length null-terminated string.
   *
   * Always consumes exactly `n` bytes from the buffer, but the returned
   * string is truncated at the first null byte (0x00). This matches the
   * Source engine convention of fixed-width string fields padded with nulls.
   */
  readString(n: number): string {
    const raw = this.readBytes(n);
    const nullIndex = raw.indexOf(0x00);
    const end = nullIndex === -1 ? n : nullIndex;
    return raw.toString("utf8", 0, end);
  }

  /** Throw if fewer than `n` bytes remain from the cursor position. */
  private ensureAvailable(n: number): void {
    if (this.cursor + n > this.buffer.length) {
      throw new RangeError(
        `ByteReader: cannot read ${n} bytes at offset ${this.cursor} ` +
          `(buffer length: ${this.buffer.length})`,
      );
    }
  }
}
