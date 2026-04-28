/**
 * Array property decoder.
 *
 * Source's `dt_array.cpp` / `Array_Decode`:
 *
 *   count = readBits(maxElementsBitWidth)
 *     // maxElementsBitWidth = ceil(log2(numElements + 1))
 *     // Wire encodes the actual element count (≤ numElements).
 *   for i in 0..count:
 *     element[i] = decodeProp(reader, arrayElement)
 *   return element
 *
 * The element template comes from the FlattenedSendProp's `arrayElement`
 * field (attached during flattening — see Flattener.ts pass 2). If the
 * template is missing we throw; valid wire data always pairs ARRAY with
 * an INSIDEARRAY template prop in its source SendTable.
 */
import type { BitReader } from "../reader/BitReader.js";
import type { FlattenedSendProp } from "../datatables/ServerClass.js";
import type { PropertyValue } from "./Property.js";
import { decodeProp } from "./decodeProp.js";

/**
 * Compute the bit width needed to represent values in [0, numElements].
 * Equivalent to ceil(log2(numElements + 1)) with the edge cases:
 *   numElements = 0 → 0 bits (degenerate; means "empty array marker")
 *   numElements = 1 → 1 bit
 *   numElements = 2 → 2 bits ([0, 1, 2] needs 2)
 *   numElements = 4 → 3 bits ([0..4] needs 3)
 */
function maxElementsBitWidth(numElements: number): number {
  if (numElements <= 0) return 0;
  // ceil(log2(numElements + 1)).
  return Math.ceil(Math.log2(numElements + 1));
}

export function decodeArray(
  reader: BitReader,
  prop: FlattenedSendProp,
): PropertyValue[] {
  const elementTemplate = prop.arrayElement;
  if (elementTemplate === undefined) {
    throw new Error(
      `decodeArray: ARRAY prop '${prop.prop.varName}' in table ` +
        `'${prop.sourceTableName}' has no element template — flattener ` +
        `should have attached the preceding INSIDEARRAY prop`,
    );
  }

  const bitWidth = maxElementsBitWidth(prop.prop.numElements);
  const count = bitWidth === 0 ? 0 : reader.readBits(bitWidth);

  const out: PropertyValue[] = [];
  for (let i = 0; i < count; i++) {
    out.push(decodeProp(reader, elementTemplate));
  }
  return out;
}
