/**
 * String property decoder.
 *
 * Source's `dt_string.cpp` / `String_Decode`:
 *
 *   length = readBits(DT_MAX_STRING_BITS = 9)   // [0, 511]
 *   bytes  = readBytes(length)
 *   return UTF-8 decode(bytes)
 *
 * NOTE: This is distinct from `BitReader.readString(maxLength)` which
 * reads NUL-terminated strings used in net-message text fields. SendProp
 * STRING uses a 9-bit length prefix and is NOT NUL-terminated on the
 * wire — Source's encoder strips the terminator and the decoder relies on
 * the explicit length.
 *
 * The 511-byte cap is enforced implicitly by the 9-bit prefix; there is
 * no need for a runtime check beyond what the bit-reader already provides.
 */
import type { BitReader } from "../reader/BitReader.js";
import type { FlattenedSendProp } from "../datatables/ServerClass.js";

const DT_MAX_STRING_BITS = 9;
const utf8Decoder = new TextDecoder("utf-8");

export function decodeString(
  reader: BitReader,
  _prop: FlattenedSendProp,
): string {
  const length = reader.readBits(DT_MAX_STRING_BITS);
  if (length === 0) return "";
  const bytes = reader.readBytes(length);
  return utf8Decoder.decode(bytes);
}
