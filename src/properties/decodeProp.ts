/**
 * Master property decoder dispatch.
 *
 * Reads `prop.prop.type` and routes to the per-type sub-decoder. The
 * dispatch is exhaustive over `SendPropType`. DATATABLE props should
 * never appear in a flattened prop list (Pass 2 of the flattener splices
 * them into their parent table's leaf accumulator) — if one shows up
 * here, something upstream is broken and we throw immediately rather
 * than silently produce garbage.
 *
 * This module is deliberately import-only — no class, no factory, no
 * mutable state. The only state in the property-decoder subsystem lives
 * in the `BitReader` cursor.
 */
import type { BitReader } from "../reader/BitReader.js";
import type { FlattenedSendProp } from "../datatables/ServerClass.js";
import { SendPropType } from "../datatables/SendTable.js";
import type { PropertyValue } from "./Property.js";
import { decodeInt, decodeInt64 } from "./IntDecoder.js";
import { decodeFloat } from "./FloatDecoder.js";
import { decodeVector, decodeVectorXY } from "./VectorDecoder.js";
import { decodeString } from "./StringDecoder.js";
import { decodeArray } from "./ArrayDecoder.js";

export function decodeProp(
  reader: BitReader,
  prop: FlattenedSendProp,
): PropertyValue {
  switch (prop.prop.type) {
    case SendPropType.INT:
      return decodeInt(reader, prop);
    case SendPropType.FLOAT:
      return decodeFloat(reader, prop);
    case SendPropType.VECTOR:
      return decodeVector(reader, prop);
    case SendPropType.VECTORXY:
      return decodeVectorXY(reader, prop);
    case SendPropType.STRING:
      return decodeString(reader, prop);
    case SendPropType.ARRAY:
      return decodeArray(reader, prop);
    case SendPropType.INT64:
      return decodeInt64(reader, prop);
    case SendPropType.DATATABLE:
      throw new Error(
        `decodeProp: DATATABLE props should never appear in a flattened ` +
          `prop list (varName='${prop.prop.varName}', table='${prop.sourceTableName}')`,
      );
    default: {
      // Exhaustiveness check — TypeScript will refuse to compile if a new
      // SendPropType is added without a case above.
      const _exhaustive: never = prop.prop.type;
      throw new Error(`decodeProp: unknown prop type ${String(_exhaustive)}`);
    }
  }
}
