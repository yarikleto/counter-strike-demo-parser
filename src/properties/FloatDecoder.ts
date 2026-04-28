/**
 * Float property decoder.
 *
 * Source's `dt_float.cpp` / `Float_Decode` (mirrored by demoinfocs's
 * `decodeFloat`) selects an encoding by checking flags in priority order:
 *
 *   1. SPROP_COORD          → readBitCoord
 *   2. SPROP_COORD_MP       → readBitCoordMP(integral=false, lowPrecision=false)
 *   3. SPROP_COORD_MP_LP    → readBitCoordMP(integral=false, lowPrecision=true)
 *   4. SPROP_COORD_MP_INT   → readBitCoordMP(integral=true,  lowPrecision=false)
 *   5. SPROP_NOSCALE        → readBitFloat (raw 32-bit IEEE 754)
 *   6. SPROP_NORMAL         → readBitNormal
 *   7. SPROP_CELL_COORD     → readBitCellCoord(numBits, integral=false, lowPrecision=false)
 *   8. SPROP_CELL_COORD_LP  → readBitCellCoord(numBits, integral=false, lowPrecision=true)
 *   9. SPROP_CELL_COORD_INT → readBitCellCoord(numBits, integral=true, lowPrecision=false)
 *  10. quantized            → linear map of `numBits` bits to [low, high]
 *
 * Quantized formula (matches Source's `DT_GetHighLowFromBits` in
 * `dt_common.h` and demoinfocs's quantized branch):
 *
 *   range  = highValue - lowValue
 *   denom  = (1 << numBits) - 1
 *   if (flags & ROUNDDOWN):
 *     // Encoder rounded down. The top quantization step is unreachable;
 *     // the maximum encoded bits represent (highValue - step).
 *     range -= range / denom
 *   else if (flags & ROUNDUP):
 *     // Mirror image: the bottom step represents (lowValue + step).
 *     lowValue += range / denom
 *     range -= range / denom
 *   bits = readBits(numBits)
 *   value = lowValue + (bits / denom) * range
 *
 * The architect's pre-mortem flagged ROUNDDOWN/ROUNDUP as a likely failure
 * mode (positions match to ~6 decimal places but not bit-for-bit). This
 * implementation matches Source's exact formula. The TASK-026 integration
 * test against demoinfocs will be the ground truth.
 */
import { BitReader } from "../reader/BitReader.js";
import type { FlattenedSendProp } from "../datatables/ServerClass.js";
import { SPropFlags } from "../datatables/SPropFlags.js";

export function decodeFloat(
  reader: BitReader,
  prop: FlattenedSendProp,
): number {
  const flags = prop.prop.flags;

  if ((flags & SPropFlags.COORD) !== 0) {
    return reader.readBitCoord();
  }
  if ((flags & SPropFlags.COORD_MP) !== 0) {
    return reader.readBitCoordMP(false, false);
  }
  if ((flags & SPropFlags.COORD_MP_LP) !== 0) {
    return reader.readBitCoordMP(false, true);
  }
  if ((flags & SPropFlags.COORD_MP_INT) !== 0) {
    return reader.readBitCoordMP(true, false);
  }
  if ((flags & SPropFlags.NOSCALE) !== 0) {
    return reader.readBitFloat();
  }
  if ((flags & SPropFlags.NORMAL) !== 0) {
    return reader.readBitNormal();
  }
  if ((flags & SPropFlags.CELL_COORD) !== 0) {
    return reader.readBitCellCoord(prop.prop.numBits, false, false);
  }
  if ((flags & SPropFlags.CELL_COORD_LP) !== 0) {
    return reader.readBitCellCoord(prop.prop.numBits, false, true);
  }
  if ((flags & SPropFlags.CELL_COORD_INT) !== 0) {
    return reader.readBitCellCoord(prop.prop.numBits, true, false);
  }

  // Quantized: linear interpolation between [lowValue, highValue].
  return decodeQuantizedFloat(reader, prop);
}

function decodeQuantizedFloat(
  reader: BitReader,
  prop: FlattenedSendProp,
): number {
  const { numBits, lowValue, highValue, flags } = prop.prop;

  const denom = (1 << numBits) - 1;
  let low = lowValue;
  let range = highValue - lowValue;

  if ((flags & SPropFlags.ROUNDDOWN) !== 0) {
    range -= range / denom;
  } else if ((flags & SPropFlags.ROUNDUP) !== 0) {
    const step = range / denom;
    low += step;
    range -= step;
  }

  const bits = reader.readBits(numBits);
  return low + (bits / denom) * range;
}
