/**
 * Public barrel for the properties layer.
 *
 * Re-exports the master `decodeProp` dispatch function, the per-type
 * sub-decoders, and the `PropertyValue` discriminated union. Consumers of
 * the parser library import from here; internal modules can import the
 * leaf files directly.
 */
export type { PropertyValue, Vector2, Vector3, DecodeProp } from "./Property.js";
export { decodeProp } from "./decodeProp.js";
export { decodeInt, decodeInt64 } from "./IntDecoder.js";
export { decodeFloat } from "./FloatDecoder.js";
export { decodeVector, decodeVectorXY } from "./VectorDecoder.js";
export { decodeString } from "./StringDecoder.js";
export { decodeArray } from "./ArrayDecoder.js";
