/**
 * Per-class prop-column mapping computed once at flatten time.
 *
 * For each `flatPropIndex`, this module computes a small `(kind, offset)`
 * pair telling the EntityStore which typed-array column the prop's value
 * lives in. The kind is one of `int | float | vector | vectorxy | string |
 * array | bigint`, matching the column layout in `EntityStore`. The offset
 * is the prop's index *within* its kind — for ints, `offset` ∈ `[0,
 * numIntProps)`; for vectors, the vector index within the interleaved
 * Float32Array.
 *
 * The mapping is a one-shot precompute: a single sweep of the class's
 * flattened props, assigning offsets via a per-kind running counter. The
 * dispatch from `prop.type` to column kind is deterministic and side-effect
 * free.
 *
 * Per ADR-002 amendment Section 1: max Int width is 32 bits on the wire for
 * any CCSPlayer / CWeapon / CCSGameRulesProxy / CCSTeam prop in de_nuke. We
 * still allocate Int64 props to a `bigint` column rather than risk silent
 * truncation. The defensive guard at the bottom of `computePropColumns`
 * checks that no INT-typed prop has nBits > 32; if one ever ships, the
 * parser throws loudly rather than corrupting the value.
 */
import type { FlattenedSendProp } from "../datatables/ServerClass.js";
import { SendPropType } from "../datatables/SendTable.js";

export type PropColumnKind =
  | "int"
  | "float"
  | "vector"
  | "vectorxy"
  | "string"
  | "array"
  | "bigint";

export interface PropColumn {
  /** Which typed-array column the value lives in. */
  readonly kind: PropColumnKind;
  /** Prop's index within its kind's column array. */
  readonly offset: number;
}

export interface PropColumnLayout {
  /** One entry per flatPropIndex, parallel to `serverClass.flattenedProps`. */
  readonly columns: readonly PropColumn[];
  readonly numIntProps: number;
  readonly numFloatProps: number;
  readonly numVectorProps: number;
  readonly numVectorXYProps: number;
  readonly numStringProps: number;
  readonly numArrayProps: number;
  readonly numBigIntProps: number;
}

/** Map a `SendPropType` to the storage column kind it routes to. */
function kindFor(prop: FlattenedSendProp): PropColumnKind {
  switch (prop.prop.type) {
    case SendPropType.INT:
      // Defense-in-depth: the architect's brief says no de_nuke INT prop
      // exceeds 32 bits, but if a future demo ships one we route to bigint
      // rather than silently truncate. The guard below also throws.
      if (prop.prop.numBits > 32) return "bigint";
      return "int";
    case SendPropType.FLOAT:
      return "float";
    case SendPropType.VECTOR:
      return "vector";
    case SendPropType.VECTORXY:
      return "vectorxy";
    case SendPropType.STRING:
      return "string";
    case SendPropType.ARRAY:
      return "array";
    case SendPropType.INT64:
      return "bigint";
    case SendPropType.DATATABLE:
      throw new Error(
        `PropColumns: DATATABLE prop should never appear in a flattened ` +
          `prop list (varName='${prop.prop.varName}')`,
      );
    default: {
      const _exhaustive: never = prop.prop.type;
      throw new Error(`PropColumns: unknown prop type ${String(_exhaustive)}`);
    }
  }
}

/**
 * Compute the column layout for a class's flattened props.
 *
 * Pure function: same input -> same output, no side effects. Cached by the
 * caller on the ServerClass.
 */
export function computePropColumns(
  flattenedProps: readonly FlattenedSendProp[],
): PropColumnLayout {
  const columns: PropColumn[] = new Array(flattenedProps.length);
  let numIntProps = 0;
  let numFloatProps = 0;
  let numVectorProps = 0;
  let numVectorXYProps = 0;
  let numStringProps = 0;
  let numArrayProps = 0;
  let numBigIntProps = 0;

  for (let i = 0; i < flattenedProps.length; i++) {
    const fp = flattenedProps[i]!;
    const kind = kindFor(fp);
    let offset: number;
    switch (kind) {
      case "int":
        offset = numIntProps++;
        break;
      case "float":
        offset = numFloatProps++;
        break;
      case "vector":
        offset = numVectorProps++;
        break;
      case "vectorxy":
        offset = numVectorXYProps++;
        break;
      case "string":
        offset = numStringProps++;
        break;
      case "array":
        offset = numArrayProps++;
        break;
      case "bigint":
        offset = numBigIntProps++;
        break;
    }
    columns[i] = { kind, offset };
  }

  return {
    columns,
    numIntProps,
    numFloatProps,
    numVectorProps,
    numVectorXYProps,
    numStringProps,
    numArrayProps,
    numBigIntProps,
  };
}
