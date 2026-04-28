/**
 * Changed-prop-index decoder for entity updates.
 *
 * Reference: TASK-026 brief Section 4. The wire format is the simple
 * "hasNext + delta" encoding (per `markus-wa/demoinfocs-golang`'s
 * `pkg/demoinfocs/sendtables/entity.go::readFieldIndices`):
 *
 *   fieldIndex = -1
 *   loop:
 *     hasNext = readBit()             # 1 bit
 *     if !hasNext: break
 *     delta = readUBitVar()           # 6 bits + 0/4/8/28-bit extension
 *     fieldIndex += delta + 1
 *     out.push(fieldIndex)
 *
 * Result is an ascending list of `flatPropIndex` values — the props the
 * server changed in this entity update. The caller iterates the list,
 * looks up each prop's `FlattenedSendProp`, and dispatches `decodeProp` to
 * read the new value off the bit stream in order.
 *
 * Notes:
 *   - The empty-update case (no props changed) is encoded as just a single
 *     `0` bit (the terminator).
 *   - `totalProps` is accepted as a defense-in-depth sanity check: a
 *     decoded index past the end of the class's flat prop list indicates
 *     upstream wire corruption (or a flatten miscount), and we throw
 *     immediately rather than silently corrupt downstream decode.
 */
import type { BitReader } from "../reader/BitReader.js";

export function readChangedPropIndices(
  reader: BitReader,
  totalProps: number,
): number[] {
  const out: number[] = [];
  let lastIndex = -1;
  while (reader.readBit() === 1) {
    const delta = reader.readUBitVar();
    lastIndex += delta + 1;
    if (lastIndex < 0 || lastIndex >= totalProps) {
      throw new RangeError(
        `readChangedPropIndices: decoded prop index ${lastIndex} is out of ` +
          `range [0, ${totalProps}) — likely wire corruption or a flatten ` +
          `miscount`,
      );
    }
    out.push(lastIndex);
  }
  return out;
}
