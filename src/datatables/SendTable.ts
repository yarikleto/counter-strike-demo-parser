/**
 * SendTable & SendProp — typed mirror of CSVCMsg_SendTable / sendprop_t.
 *
 * Source's networking layer describes every networked entity as a tree of
 * SendTables. Each table has a name (`netTableName`, e.g. `DT_CSPlayer`),
 * a flag indicating whether it requires a client-side decoder, and an array
 * of SendProps. A SendProp is one networked field on the entity (an int,
 * float, vector, string, array, or sub-table reference).
 *
 * Design: this is a pure data record — no methods, no derived state. Field
 * names mirror the proto exactly (camelCase via ts-proto). Required-but-
 * sometimes-zero fields like `priority` are normalized to numbers (proto
 * defaults applied) so consumers don't have to handle `undefined`. Only
 * `dtName` and the float quantization range fields stay optional because
 * "missing" carries semantic meaning (no sub-table reference; not a
 * quantized float).
 */

/** SendProp type tag — matches Source's `SendPropType` enum (DT_SEND_NUMSENDPROPTYPES). */
export const SendPropType = {
  /** 32-bit integer (signed/unsigned per flags). */
  INT: 0,
  /** Float, optionally quantized (numBits, lowValue, highValue). */
  FLOAT: 1,
  /** Three packed floats (x, y, z). */
  VECTOR: 2,
  /** Two packed floats (x, y) — used for 2D angles, e.g. yaw+pitch only. */
  VECTORXY: 3,
  /** Length-prefixed UTF-8 string. */
  STRING: 4,
  /** Variable-length array; element template is the prop immediately preceding. */
  ARRAY: 5,
  /** Sub-table reference; the sub-table's name is in `dtName`. */
  DATATABLE: 6,
  /** 64-bit integer. */
  INT64: 7,
} as const;

export type SendPropTypeValue = (typeof SendPropType)[keyof typeof SendPropType];

/**
 * One SendProp definition from a SendTable.
 *
 * All numeric fields with proto default of 0 are normalized to a concrete
 * number on parse — callers don't need to coalesce `undefined`. Optional
 * fields below are truly optional in the schema.
 */
export interface SendProp {
  /** Wire type — see SendPropType. Always present. */
  readonly type: SendPropTypeValue;
  /** Field name on the C++ class, e.g. `m_iHealth`. Always present. */
  readonly varName: string;
  /** SPROP_* flag bitfield (see Source's `dt_common.h`). */
  readonly flags: number;
  /** Priority for the four-pass flattening sort; default 0. */
  readonly priority: number;
  /** Sub-table name for DATATABLE props; element prop name for ARRAY props. */
  readonly dtName?: string;
  /** Element count for ARRAY props; 0 otherwise. */
  readonly numElements: number;
  /** Quantization low bound for FLOAT/VECTOR/VECTORXY; 0 if unused. */
  readonly lowValue: number;
  /** Quantization high bound for FLOAT/VECTOR/VECTORXY; 0 if unused. */
  readonly highValue: number;
  /** Bit width for INT or quantized FLOAT; 0 if unused. */
  readonly numBits: number;
}

/**
 * A SendTable parsed from a single CSVCMsg_SendTable wire message.
 *
 * Tables form a tree via DATATABLE props that reference other tables by
 * name through `SendProp.dtName`. The root SendTable for each ServerClass
 * is named in CSVCMsg_ClassInfo.dataTableName.
 */
export interface SendTable {
  /** Unique table name, e.g. `DT_CSPlayer`. Used as the registry key. */
  readonly netTableName: string;
  /** True when this table requires a client-side decoder. Default false. */
  readonly needsDecoder: boolean;
  /** Props in their on-wire order. Order matters — array element templates
   *  follow their owning ARRAY prop, and the flattening pass walks this
   *  order. */
  readonly props: readonly SendProp[];
}
