/**
 * Property value types and the master decoder signature.
 *
 * The property-decoders subsystem (M2 Slice 4 phase 1, TASK-019/020/021)
 * produces `PropertyValue`s by reading a `BitReader` according to a
 * `FlattenedSendProp` shape descriptor. The discriminator for the union is
 * external — it lives in `prop.prop.type` (the `SendPropType`) — and is not
 * encoded in the value itself. Consumers read the type alongside the value
 * to know which arm of the union to expect.
 *
 * Per ADR-002 (2026-04-29 amendment), entity storage stores ints, floats,
 * and vectors in primitive-typed columns. The decoder however returns the
 * tagged-union JS shape because (a) each decoder is a pure function with
 * no class-state to consult, and (b) the entity layer is responsible for
 * routing each `PropertyValue` into the right typed-array column. The
 * decoder is the producer; the entity layer is the consumer.
 *
 * Vector / VectorXY are returned as `{ x, y, z }` / `{ x, y }` plain
 * objects — the simplest readable shape. The entity layer interleaves them
 * into Float32Array columns when storing.
 */
import type { BitReader } from "../reader/BitReader.js";
import type { FlattenedSendProp } from "../datatables/ServerClass.js";

/** A 3D vector. Returned by VECTOR-typed prop decoders. */
export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A 2D vector. Returned by VECTORXY-typed prop decoders. */
export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/**
 * The runtime value produced by `decodeProp`. Discriminated externally by
 * `prop.prop.type`:
 *
 * - INT, FLOAT      → number
 * - INT64           → bigint
 * - STRING          → string
 * - VECTOR          → Vector3
 * - VECTORXY        → Vector2
 * - ARRAY           → PropertyValue[]
 * - DATATABLE       → never appears in flattened output (decoder throws)
 */
export type PropertyValue =
  | number
  | bigint
  | string
  | Vector3
  | Vector2
  | PropertyValue[];

/** Per-type sub-decoder signature. Pure function over the BitReader. */
export type DecodeProp = (
  reader: BitReader,
  prop: FlattenedSendProp,
) => PropertyValue;
