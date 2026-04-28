/**
 * BitReader — sequential bit-level reader over a Uint8Array.
 *
 * Reads individual bits and bit-packed values from the underlying byte
 * buffer. The cursor is tracked in bits, not bytes, so reads at any
 * non-byte-aligned offset are supported. This is the parser's hottest
 * code path — it is intentionally written for V8 monomorphism: every
 * instance field is initialized in the constructor, every public method
 * returns a primitive, and the inner loops avoid allocations.
 *
 * Bit order: little-endian within a byte, matching Source's bitbuf —
 * the first bit read from a byte is the LSB (bit 0). Multi-bit reads
 * pack lower-bit-position bits into the lower bits of the result.
 *
 * Out-of-bounds reads throw a RangeError immediately.
 */
export class BitReader {
  private readonly view: Uint8Array;
  private readonly totalBits: number;
  private bitCursor: number;

  /**
   * @param buffer    The backing byte buffer.
   * @param byteOffset Optional starting byte offset within the buffer.
   * @param byteLength Optional length in bytes (defaults to remainder).
   */
  constructor(buffer: Uint8Array, byteOffset = 0, byteLength?: number) {
    const length = byteLength ?? buffer.length - byteOffset;
    // Subarray shares memory — no copy. byteOffset+length validation:
    if (
      byteOffset < 0 ||
      length < 0 ||
      byteOffset + length > buffer.length
    ) {
      throw new RangeError(
        `BitReader: invalid range byteOffset=${byteOffset} ` +
          `byteLength=${length} (buffer length: ${buffer.length})`,
      );
    }
    this.view = buffer.subarray(byteOffset, byteOffset + length);
    this.totalBits = length * 8;
    this.bitCursor = 0;
  }

  /** Current read position, in bits, from the start of the view. */
  get position(): number {
    return this.bitCursor;
  }

  /** Total number of bits available in the view. */
  get length(): number {
    return this.totalBits;
  }

  /** Bits remaining from the cursor to the end. */
  get remaining(): number {
    return this.totalBits - this.bitCursor;
  }

  /** Seek to an absolute bit position. */
  seek(bitPosition: number): void {
    if (bitPosition < 0 || bitPosition > this.totalBits) {
      throw new RangeError(
        `BitReader: cannot seek to bit ${bitPosition} ` +
          `(total bits: ${this.totalBits})`,
      );
    }
    this.bitCursor = bitPosition;
  }

  /** Read a single bit (0 or 1). Advances cursor by 1. */
  readBit(): 0 | 1 {
    if (this.bitCursor + 1 > this.totalBits) {
      throw new RangeError(
        `BitReader: cannot read 1 bit at position ${this.bitCursor} ` +
          `(total bits: ${this.totalBits})`,
      );
    }
    const byteIndex = this.bitCursor >>> 3;
    const bitIndex = this.bitCursor & 7;
    this.bitCursor += 1;
    return ((this.view[byteIndex] >>> bitIndex) & 1) as 0 | 1;
  }

  /**
   * Read `n` bits as an unsigned integer. `n` must be in [0, 32].
   * For n === 32 we apply `>>> 0` to keep the result in the unsigned
   * range (JavaScript bitwise ops are signed 32-bit otherwise).
   */
  readBits(n: number): number {
    if (n < 0 || n > 32) {
      throw new RangeError(
        `BitReader: readBits(n) requires 0 <= n <= 32, got ${n}`,
      );
    }
    if (n === 0) return 0;
    if (this.bitCursor + n > this.totalBits) {
      throw new RangeError(
        `BitReader: cannot read ${n} bits at position ${this.bitCursor} ` +
          `(total bits: ${this.totalBits})`,
      );
    }

    const view = this.view;
    let cursor = this.bitCursor;
    let result = 0;
    let bitsCollected = 0;

    while (bitsCollected < n) {
      const byteIndex = cursor >>> 3;
      const bitIndex = cursor & 7;
      const bitsAvailableInByte = 8 - bitIndex;
      const bitsToTake =
        bitsAvailableInByte < n - bitsCollected
          ? bitsAvailableInByte
          : n - bitsCollected;
      const mask = (1 << bitsToTake) - 1;
      const chunk = (view[byteIndex] >>> bitIndex) & mask;
      // Use multiplication to shift past 31 safely; for typical small
      // shifts this still emits a fast path in V8.
      result += chunk * Math.pow(2, bitsCollected);
      cursor += bitsToTake;
      bitsCollected += bitsToTake;
    }

    this.bitCursor = cursor;
    return n === 32 ? result >>> 0 : result;
  }

  /**
   * Read `n` bits as a signed integer using two's complement.
   * `n` must be in [1, 32]. Sign bit is the highest bit read.
   */
  readSignedBits(n: number): number {
    if (n < 1 || n > 32) {
      throw new RangeError(
        `BitReader: readSignedBits(n) requires 1 <= n <= 32, got ${n}`,
      );
    }
    const value = this.readBits(n);
    if (n === 32) {
      // Already covers full range; coerce back to signed via |0.
      return value | 0;
    }
    const signBit = 1 << (n - 1);
    if ((value & signBit) !== 0) {
      // Set the upper bits to extend the sign.
      return value - (1 << n);
    }
    return value;
  }

  /**
   * Read a Source-style variable-length unsigned integer from the bit
   * stream. This is Valve's `ReadUBitVar` (a.k.a. `ReadUBitInt`) from
   * `bitbuf.cpp` — NOT a protobuf varint.
   *
   * Wire format:
   *   ret    = readBits(6)
   *   lookup = readBits(2)
   *   switch (lookup):
   *     0: return ret                          // [0, 63]
   *     1: return ret | (readBits(4)  << 6)    // 10-bit
   *     2: return ret | (readBits(8)  << 6)    // 14-bit
   *     3: return ret | (readBits(28) << 6)    // up to 34-bit
   */
  readUBitVar(): number {
    const ret = this.readBits(6);
    const lookup = this.readBits(2);
    switch (lookup) {
      case 0:
        return ret;
      case 1:
        return ret | (this.readBits(4) << 6);
      case 2:
        return ret | (this.readBits(8) << 6);
      default:
        // case 3: high 28 bits — use unsigned multiply to avoid the
        // 32-bit signed quirk of `<< 6` when the upper bits set bit 31.
        return (ret + this.readBits(28) * 64) >>> 0;
    }
  }

  /**
   * Read `n` bytes as a fresh Uint8Array. Works at any bit alignment.
   * When the cursor is byte-aligned this is a fast `slice`; otherwise
   * each output byte is reassembled from two adjacent source bytes.
   */
  readBytes(n: number): Uint8Array {
    if (n < 0) {
      throw new RangeError(`BitReader: readBytes(n) requires n >= 0, got ${n}`);
    }
    if (this.bitCursor + n * 8 > this.totalBits) {
      throw new RangeError(
        `BitReader: cannot read ${n} bytes at bit position ${this.bitCursor} ` +
          `(total bits: ${this.totalBits})`,
      );
    }

    const out = new Uint8Array(n);
    const bitIndex = this.bitCursor & 7;

    if (bitIndex === 0) {
      const byteIndex = this.bitCursor >>> 3;
      out.set(this.view.subarray(byteIndex, byteIndex + n));
      this.bitCursor += n * 8;
      return out;
    }

    // Unaligned: each output byte spans two source bytes.
    const view = this.view;
    let byteIndex = this.bitCursor >>> 3;
    const lowShift = bitIndex;
    const highShift = 8 - bitIndex;
    for (let i = 0; i < n; i++) {
      const lo = view[byteIndex] >>> lowShift;
      const hi = view[byteIndex + 1] << highShift;
      out[i] = (lo | hi) & 0xff;
      byteIndex += 1;
    }
    this.bitCursor += n * 8;
    return out;
  }
}
