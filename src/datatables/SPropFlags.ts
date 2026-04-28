/**
 * SPROP_* flag bits — mirrors CS:GO's `dt_common.h`.
 *
 * SendProp.flags is a bitfield combining these flags. The flattening pass
 * (TASK-015 / TASK-018), the entity decoder (Slice 4), and the float
 * quantization decoder (TASK-020) all reference these bits. Centralizing
 * them here means callers reference flags by name rather than by
 * `1 << 6`-style magic numbers, which is the dominant source of off-by-one
 * bugs in third-party Source parsers.
 *
 * **CSGO vs Source SDK 2013 bit positions.** The bit layout differs
 * between the two SDKs. We use CS:GO's layout because the demo files we
 * parse are CSGO-encoded — verified empirically against `de_nuke.dem`:
 * `m_flSimulationTime` reports flags=0x40001, which is UNSIGNED (bit 0)
 * + CHANGES_OFTEN (bit 18). The Source SDK 2013 reference has
 * CHANGES_OFTEN at bit 10. Mirrors demoinfocs-golang's `sendproperty.go`
 * flag enum (commit a68aa2fbae...).
 *
 * Constants are declared `as const` so TypeScript infers literal numeric
 * types — useful when the flag name is used in a switch-on-flag pattern.
 */
export const SPropFlags = {
  /** Integer is unsigned (changes the int-decode path). */
  UNSIGNED: 1 << 0,
  /** Float is in COORD encoding (low-precision world coordinates). */
  COORD: 1 << 1,
  /** Float is sent as a raw IEEE 754 float, no quantization. */
  NOSCALE: 1 << 2,
  /** Bias quantization range to round down. Pairs with NOSCALE for high-precision floats. */
  ROUNDDOWN: 1 << 3,
  /** Bias quantization range to round up. */
  ROUNDUP: 1 << 4,
  /** Vector is normalized (signed magnitude, sign bit + 11 bits of value). */
  NORMAL: 1 << 5,
  /** Prop is an exclude marker referencing another table's prop by name. */
  EXCLUDE: 1 << 6,
  /** XYZ vector with extra-precision encoding. */
  XYZE: 1 << 7,
  /** Prop is the element template of a parent ARRAY prop, not a real field. */
  INSIDEARRAY: 1 << 8,
  /** Sub-table proxy always returns true (always-include sub-table). */
  PROXY_ALWAYS_YES: 1 << 9,
  /** Prop is the y or z element of a vector flattened into individual props. */
  IS_VECTOR_ELEM: 1 << 10,
  /** Sub-table is collapsible — its props inline into the parent in flattening. */
  COLLAPSIBLE: 1 << 11,
  /** Multiplayer-quantized world-coord float (medium precision). */
  COORD_MP: 1 << 12,
  /** Multiplayer-quantized world-coord float, low precision. */
  COORD_MP_LP: 1 << 13,
  /** Multiplayer-quantized world-coord float, integer-only encoding. */
  COORD_MP_INT: 1 << 14,
  /** Cell-coord float (origin within a 2D cell, relative to m_cellX/Y/Z). */
  CELL_COORD: 1 << 15,
  /** Cell-coord float, low precision. */
  CELL_COORD_LP: 1 << 16,
  /** Cell-coord float, integer-only. */
  CELL_COORD_INT: 1 << 17,
  /** Prop changes frequently — promoted to priority 64 in the flattening sort. */
  CHANGES_OFTEN: 1 << 18,
  /** Integer is sent as a varint instead of fixed-width. */
  VARINT: 1 << 19,
} as const;

export type SPropFlagsKey = keyof typeof SPropFlags;
