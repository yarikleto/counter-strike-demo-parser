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
  // Constants from Valve's `coord_const.h`. See bitbuf.cpp for usage.
  /** Integer bit width for full-precision coords. */
  static readonly COORD_INTEGER_BITS = 14;
  /** Integer bit width for in-bounds multiplayer coords. */
  static readonly COORD_INTEGER_BITS_MP = 11;
  /** Fractional bit width for full-precision coords (1/32 resolution). */
  static readonly COORD_FRACTIONAL_BITS = 5;
  /** Fractional bit width for low-precision MP coords (1/8 resolution). */
  static readonly COORD_FRACTIONAL_BITS_MP_LOWPRECISION = 3;
  /** Resolution for full-precision fractional coords: 1 / 32. */
  static readonly COORD_RESOLUTION = 1 / (1 << 5);
  /** Resolution for low-precision fractional coords: 1 / 8. */
  static readonly COORD_RESOLUTION_LOWPRECISION = 1 / (1 << 3);
  /** Fractional bit width for unit normals. */
  static readonly NORMAL_FRACTIONAL_BITS = 11;
  /** Denominator for unit normals: (1 << 11) - 1 = 2047. */
  static readonly NORMAL_DENOMINATOR = (1 << 11) - 1;
  /** Per-step resolution for unit normals: 1 / 2047. */
  static readonly NORMAL_RESOLUTION = 1 / ((1 << 11) - 1);

  /**
   * Shared 4-byte scratch DataView for reinterpreting bit patterns as
   * IEEE 754 floats. Single-threaded JS — safe to share across calls.
   */
  private static readonly floatScratchView = new DataView(new ArrayBuffer(4));

  /** Shared UTF-8 decoder (no allocation per call). */
  private static readonly utf8Decoder = new TextDecoder("utf-8");

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
    const cursor = this.bitCursor;
    if (cursor + 1 > this.totalBits) {
      throw new RangeError(
        `BitReader: cannot read 1 bit at position ${cursor} ` +
          `(total bits: ${this.totalBits})`,
      );
    }
    this.bitCursor = cursor + 1;
    return ((this.view[cursor >>> 3] >>> (cursor & 7)) & 1) as 0 | 1;
  }

  /**
   * Read `n` bits as an unsigned integer. `n` must be in [0, 32].
   * For n === 32 we apply `>>> 0` to keep the result in the unsigned
   * range (JavaScript bitwise ops are signed 32-bit otherwise).
   *
   * Hot path: for n <= 25 we can read 4 bytes and shift, since the
   * worst case cursor offset is 7, so we touch at most 4 source bytes.
   * For n in (25, 32] we use a slower accumulating path that handles
   * the 33-bit window without overflow.
   */
  readBits(n: number): number {
    const cursor = this.bitCursor;
    const totalBits = this.totalBits;
    if (n < 0 || n > 32) {
      throw new RangeError(
        `BitReader: readBits(n) requires 0 <= n <= 32, got ${n}`,
      );
    }
    if (n === 0) return 0;
    if (cursor + n > totalBits) {
      throw new RangeError(
        `BitReader: cannot read ${n} bits at position ${cursor} ` +
          `(total bits: ${totalBits})`,
      );
    }

    const view = this.view;
    const byteIndex = cursor >>> 3;
    const bitIndex = cursor & 7;
    this.bitCursor = cursor + n;

    if (n <= 25) {
      // 25 bits + worst-case bitIndex 7 = 32 bits, fits in 4 bytes.
      // Read up to 4 bytes into a 32-bit word, then shift+mask.
      // Out-of-bounds bytes (when bitIndex === 0 and n <= 24) are not
      // actually read because we mask them off.
      const lastByte = (cursor + n - 1) >>> 3;
      let word = view[byteIndex];
      if (lastByte >= byteIndex + 1) word |= view[byteIndex + 1] << 8;
      if (lastByte >= byteIndex + 2) word |= view[byteIndex + 2] << 16;
      if (lastByte >= byteIndex + 3) word |= view[byteIndex + 3] << 24;
      // Unsigned right shift gives correct unsigned result; mask to n bits.
      return (word >>> bitIndex) & ((1 << n) - 1);
    }

    // n in (25, 32]: window can span up to 5 bytes. Accumulate two halves
    // and combine with a multiplication (avoids signed-shift quirks).
    const lowBits = 16;
    const lowMask = 0xffff;
    const low = (view[byteIndex] |
      (view[byteIndex + 1] << 8) |
      (view[byteIndex + 2] << 16)) >>> bitIndex;
    const lowResult = low & lowMask; // first 16 bits
    const highBitsToTake = n - lowBits;
    // High part: starts (lowBits) bits later than `cursor`.
    const hiCursor = cursor + lowBits;
    const hiByte = hiCursor >>> 3;
    const hiBitIndex = hiCursor & 7;
    let hiWord = view[hiByte];
    if (hiByte + 1 < view.length) hiWord |= view[hiByte + 1] << 8;
    if (hiByte + 2 < view.length) hiWord |= view[hiByte + 2] << 16;
    const high = (hiWord >>> hiBitIndex) & ((1 << highBitsToTake) - 1);
    const result = lowResult + high * 0x10000;
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
   * Read a protobuf-style varint from the bit stream.
   *
   * NOTE: This is *distinct* from {@link readUBitVar}. `readUBitVar` is
   * Source's `bitbuf.cpp` `ReadUBitVar` (6 bits + 2-bit lookup + 0/4/8/28
   * extension). `readVarInt32` is the standard protobuf wire-format
   * varint (groups of 7 data bits + 1 continuation bit), encoded into a
   * bit stream rather than a byte stream. It is used by some entity
   * property sub-encodings where varints appear unaligned.
   *
   * Reads up to 5 groups (35 bits) and accumulates the low 32 bits of
   * the result. The return value is coerced to an unsigned 32-bit number
   * via `>>> 0`.
   */
  readVarInt32(): number {
    // Inline the readBits(8) loop; each iteration reads exactly 8 bits.
    const view = this.view;
    const totalBits = this.totalBits;
    let cursor = this.bitCursor;
    let result = 0;
    for (let i = 0; i < 5; i++) {
      if (cursor + 8 > totalBits) {
        throw new RangeError(
          `BitReader: cannot read 8 bits at position ${cursor} ` +
            `(total bits: ${totalBits})`,
        );
      }
      const byteIndex = cursor >>> 3;
      const bitIndex = cursor & 7;
      const b =
        bitIndex === 0
          ? view[byteIndex]
          : ((view[byteIndex] | (view[byteIndex + 1] << 8)) >>> bitIndex) & 0xff;
      cursor += 8;
      result |= (b & 0x7f) << (7 * i);
      if ((b & 0x80) === 0) break;
    }
    this.bitCursor = cursor;
    return result >>> 0;
  }

  /**
   * Read a zigzag-encoded signed varint from the bit stream. Combines
   * {@link readVarInt32} with the protobuf zigzag decode:
   *   `(n >>> 1) ^ -(n & 1)`
   * Returns a signed 32-bit JS number.
   */
  readSignedVarInt32(): number {
    const n = this.readVarInt32();
    return (n >>> 1) ^ -(n & 1);
  }

  /**
   * Read a Source-engine fractional coordinate. Mirrors `bf_read::ReadBitCoord`
   * in Valve's `bitbuf.cpp`.
   *
   * Wire format:
   *   has_int  = readBit()
   *   has_frac = readBit()
   *   if has_int || has_frac:
   *     sign  = readBit()
   *     int   = has_int  ? readBits(COORD_INTEGER_BITS=14) + 1 : 0
   *     frac  = has_frac ? readBits(COORD_FRACTIONAL_BITS=5)   : 0
   *     value = int + frac * COORD_RESOLUTION (1/32)
   *     if sign: value = -value
   *   else:
   *     value = 0
   *
   * Note Valve adds 1 to the integer part on encode (so 0 is signaled by
   * has_int=0), and subtracts 1 on decode — replicate that here.
   */
  readBitCoord(): number {
    const hasInt = this.readBit();
    const hasFrac = this.readBit();
    if (hasInt === 0 && hasFrac === 0) return 0;
    const sign = this.readBit();
    const intVal = hasInt ? this.readBits(BitReader.COORD_INTEGER_BITS) + 1 : 0;
    const fracVal = hasFrac
      ? this.readBits(BitReader.COORD_FRACTIONAL_BITS)
      : 0;
    const value = intVal + fracVal * BitReader.COORD_RESOLUTION;
    return sign ? -value : value;
  }

  /**
   * Read a multiplayer-optimized coordinate. Mirrors `bf_read::ReadBitCoordMP`
   * in Valve's `bitbuf.cpp`.
   *
   *   in_bounds  = readBit()      // selects 11- vs 14-bit integer width
   *   has_int_or_sign = readBit() // semantics differ by mode (see below)
   *
   * - integral=true:
   *     if has_int_or_sign: read sign, read intBits (11 if in_bounds else 14)
   *     return signed integer
   *
   * - integral=false:
   *     has_int = has_int_or_sign
   *     sign    = readBit()
   *     int     = has_int ? readBits(in_bounds ? 11 : 14) + 1 : 0
   *     frac    = readBits(lowPrecision ? 3 : 5)
   *     value   = int + frac * (lowPrecision ? 1/8 : 1/32)
   *     return sign ? -value : value
   */
  readBitCoordMP(integral: boolean, lowPrecision: boolean): number {
    const inBounds = this.readBit();
    if (integral) {
      const hasIntVal = this.readBit();
      if (!hasIntVal) return 0;
      const sign = this.readBit();
      const intBits = inBounds
        ? BitReader.COORD_INTEGER_BITS_MP
        : BitReader.COORD_INTEGER_BITS;
      const intVal = this.readBits(intBits) + 1;
      return sign ? -intVal : intVal;
    }
    const hasInt = this.readBit();
    const sign = this.readBit();
    const intBits = inBounds
      ? BitReader.COORD_INTEGER_BITS_MP
      : BitReader.COORD_INTEGER_BITS;
    const intVal = hasInt ? this.readBits(intBits) + 1 : 0;
    const fracBits = lowPrecision
      ? BitReader.COORD_FRACTIONAL_BITS_MP_LOWPRECISION
      : BitReader.COORD_FRACTIONAL_BITS;
    const resolution = lowPrecision
      ? BitReader.COORD_RESOLUTION_LOWPRECISION
      : BitReader.COORD_RESOLUTION;
    const fracVal = this.readBits(fracBits);
    const value = intVal + fracVal * resolution;
    return sign ? -value : value;
  }

  /**
   * Read a unit normal component in [-1, 1]. Mirrors `bf_read::ReadBitNormal`
   * in Valve's `bitbuf.cpp`:
   *   sign     = readBit()
   *   fraction = readBits(NORMAL_FRACTIONAL_BITS=11)
   *   value    = fraction / NORMAL_DENOMINATOR  (= 2047)
   *   return sign ? -value : value
   */
  readBitNormal(): number {
    const sign = this.readBit();
    const fraction = this.readBits(BitReader.NORMAL_FRACTIONAL_BITS);
    const value = fraction * BitReader.NORMAL_RESOLUTION;
    return sign ? -value : value;
  }

  /**
   * Read a cell-relative coordinate. Mirrors `bf_read::ReadBitCellCoord` in
   * Valve's `bitbuf.cpp`.
   *
   *   int  = readBits(bits)
   *   if integral:        return int
   *   frac = readBits(lowPrecision ? 3 : 5)
   *   return int + frac * (lowPrecision ? 1/8 : 1/32)
   *
   * Cell coords are unsigned (no sign bit) because cells are always
   * non-negative offsets from a known origin.
   */
  readBitCellCoord(bits: number, integral: boolean, lowPrecision: boolean): number {
    const intVal = this.readBits(bits);
    if (integral) return intVal;
    const fracBits = lowPrecision
      ? BitReader.COORD_FRACTIONAL_BITS_MP_LOWPRECISION
      : BitReader.COORD_FRACTIONAL_BITS;
    const resolution = lowPrecision
      ? BitReader.COORD_RESOLUTION_LOWPRECISION
      : BitReader.COORD_RESOLUTION;
    const fracVal = this.readBits(fracBits);
    return intVal + fracVal * resolution;
  }

  /**
   * Read a raw 32-bit IEEE 754 little-endian float. Equivalent to
   * `bf_read::ReadBitFloat` — read 32 bits, reinterpret as float32.
   */
  readBitFloat(): number {
    const raw = this.readBits(32);
    BitReader.floatScratchView.setUint32(0, raw, true);
    return BitReader.floatScratchView.getFloat32(0, true);
  }

  /**
   * Read an angle quantized into `bits` bits over the [0, 360) range.
   * Mirrors `bf_read::ReadBitAngle`:
   *   raw = readBits(bits)
   *   return raw * 360 / (1 << bits)
   */
  readBitAngle(bits: number): number {
    if (bits < 1 || bits > 32) {
      throw new RangeError(
        `BitReader: readBitAngle(bits) requires 1 <= bits <= 32, got ${bits}`,
      );
    }
    const raw = this.readBits(bits);
    return (raw * 360) / Math.pow(2, bits);
  }

  /**
   * Read a UTF-8 string up to (but not including) a NUL terminator, or
   * up to `maxLength` bytes if no NUL is found earlier. The bit cursor
   * always advances past the terminator (or `maxLength` bytes when no
   * NUL is encountered, in which case an error is also thrown if we hit
   * the end of the buffer first).
   */
  readString(maxLength: number = 512): string {
    if (maxLength < 0) {
      throw new RangeError(
        `BitReader: readString(maxLength) requires maxLength >= 0, got ${maxLength}`,
      );
    }
    const bytes: number[] = [];
    for (let i = 0; i < maxLength; i++) {
      if (this.bitCursor + 8 > this.totalBits) {
        throw new RangeError(
          `BitReader: readString reached end of buffer at byte ${i} ` +
            `without finding NUL terminator (maxLength: ${maxLength})`,
        );
      }
      const byte = this.readBits(8);
      if (byte === 0) {
        return BitReader.utf8Decoder.decode(new Uint8Array(bytes));
      }
      bytes.push(byte);
    }
    return BitReader.utf8Decoder.decode(new Uint8Array(bytes));
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
