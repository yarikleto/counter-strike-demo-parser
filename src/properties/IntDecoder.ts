/**
 * Int / Int64 property decoders.
 *
 * Wire formats per Source's `dt_int.cpp` / `Int_Decode` and the matching
 * decoder in `markus-wa/demoinfocs-golang/pkg/demoinfocs/sendtable_decoder.go`:
 *
 *   if (flags & VARINT):
 *     n = readVarInt32() // protobuf-style 7-bit groups, encoded into bits
 *     if (!(flags & UNSIGNED)):
 *       n = zigzagDecode(n)  // (n >>> 1) ^ -(n & 1)
 *     return n
 *
 *   else:
 *     bits = readBits(numBits)
 *     if (flags & UNSIGNED): return bits
 *     // two's complement extension
 *     return bits < (1 << (numBits-1)) ? bits : bits - (1 << numBits)
 *
 * For INT64, the same two branches apply but accumulate into a bigint:
 * varint reads up to 10 bytes; fixed-width reads up to 64 bits in two
 * 32-bit chunks then composes via BigInt arithmetic (JS's `<<` saturates
 * at 32 bits on Numbers). We re-use BitReader's `readVarInt32` for the
 * low 32 bits when numBits ≤ 32, and roll a 64-bit reader for the wider
 * case.
 *
 * Note on the VARINT signedness convention: Source's IntEncoder picks
 * varint encoding when SPROP_VARINT is set. demoinfocs decodes signed
 * varints with zigzag (see `decodeInt`), and BitReader already exposes
 * `readSignedVarInt32` which does exactly that. We mirror demoinfocs.
 */
import type { BitReader } from "../reader/BitReader.js";
import type { FlattenedSendProp } from "../datatables/ServerClass.js";
import { SPropFlags } from "../datatables/SPropFlags.js";

export function decodeInt(
  reader: BitReader,
  prop: FlattenedSendProp,
): number {
  const flags = prop.prop.flags;
  const unsigned = (flags & SPropFlags.UNSIGNED) !== 0;

  if ((flags & SPropFlags.VARINT) !== 0) {
    if (unsigned) {
      return reader.readVarInt32();
    }
    return reader.readSignedVarInt32();
  }

  const numBits = prop.prop.numBits;
  if (unsigned) {
    return reader.readBits(numBits);
  }
  return reader.readSignedBits(numBits);
}

/**
 * Read an unsigned 64-bit varint from a bit stream. Up to 10 bytes (groups
 * of 7 data bits + 1 continuation bit). Returns a non-negative bigint.
 */
function readVarInt64(reader: BitReader): bigint {
  let result = 0n;
  for (let i = 0; i < 10; i++) {
    const b = reader.readBits(8);
    result |= BigInt(b & 0x7f) << BigInt(7 * i);
    if ((b & 0x80) === 0) break;
  }
  // Mask to 64 bits to discard any spillover from the 10th group's
  // partial bits — protobuf spec says only the low bit of the 10th group
  // is meaningful for a uint64.
  return result & 0xffffffffffffffffn;
}

/** Zigzag decode for a 64-bit varint. */
function zigzagDecode64(n: bigint): bigint {
  // (n >>> 1) ^ -(n & 1) — but in BigInt and unsigned-shift semantics.
  return (n >> 1n) ^ -(n & 1n);
}

export function decodeInt64(
  reader: BitReader,
  prop: FlattenedSendProp,
): bigint {
  const flags = prop.prop.flags;
  const unsigned = (flags & SPropFlags.UNSIGNED) !== 0;

  if ((flags & SPropFlags.VARINT) !== 0) {
    const raw = readVarInt64(reader);
    if (unsigned) return raw;
    return zigzagDecode64(raw);
  }

  // Fixed-width: read up to 64 bits in two 32-bit chunks. We split because
  // BitReader.readBits only supports n in [0, 32]. The Source wire layout
  // sends high/low halves the same way: low bits first within a byte, so
  // the first chunk we read is the low 32 of the value.
  const numBits = prop.prop.numBits;
  let value: bigint;
  if (numBits <= 32) {
    value = BigInt(reader.readBits(numBits));
  } else {
    const lo = BigInt(reader.readBits(32));
    const hi = BigInt(reader.readBits(numBits - 32));
    value = lo | (hi << 32n);
  }
  if (unsigned) return value;

  // Two's complement sign extension at width = numBits.
  const signBit = 1n << BigInt(numBits - 1);
  if ((value & signBit) !== 0n) {
    return value - (1n << BigInt(numBits));
  }
  return value;
}
