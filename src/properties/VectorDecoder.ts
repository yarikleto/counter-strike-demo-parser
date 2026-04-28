/**
 * Vector / VectorXY property decoders.
 *
 * Source's `dt_vector.cpp` / `Vector_Decode`:
 *
 *   x = Float_Decode(prop)
 *   y = Float_Decode(prop)
 *   if (flags & SPROP_NORMAL):
 *     // Sign bit + magnitude reconstruction. The encoder dropped z because
 *     // |x|, |y| < 1 implies z² = 1 - x² - y², saving the 12 bits a
 *     // SPROP_NORMAL float would otherwise consume.
 *     signZ = readBit()
 *     mag2  = x*x + y*y
 *     z     = mag2 < 1 ? sqrt(1 - mag2) : 0
 *     if signZ: z = -z
 *   else:
 *     z = Float_Decode(prop)
 *   return { x, y, z }
 *
 * VectorXY skips the z entirely:
 *   return { x: Float_Decode(prop), y: Float_Decode(prop) }
 *
 * Both decoders re-use the `decodeFloat` per-component machinery — the
 * SPROP_* flags on the vector prop apply uniformly to all components,
 * which means a SPROP_COORD_MP vector is three SPROP_COORD_MP floats
 * (or two for VectorXY).
 */
import type { BitReader } from "../reader/BitReader.js";
import type { FlattenedSendProp } from "../datatables/ServerClass.js";
import { SPropFlags } from "../datatables/SPropFlags.js";
import { decodeFloat } from "./FloatDecoder.js";
import type { Vector2, Vector3 } from "./Property.js";

export function decodeVector(
  reader: BitReader,
  prop: FlattenedSendProp,
): Vector3 {
  const x = decodeFloat(reader, prop);
  const y = decodeFloat(reader, prop);

  let z: number;
  if ((prop.prop.flags & SPropFlags.NORMAL) !== 0) {
    const signZ = reader.readBit();
    const mag2 = x * x + y * y;
    z = mag2 < 1 ? Math.sqrt(1 - mag2) : 0;
    if (signZ) z = -z;
  } else {
    z = decodeFloat(reader, prop);
  }

  return { x, y, z };
}

export function decodeVectorXY(
  reader: BitReader,
  prop: FlattenedSendProp,
): Vector2 {
  const x = decodeFloat(reader, prop);
  const y = decodeFloat(reader, prop);
  return { x, y };
}
