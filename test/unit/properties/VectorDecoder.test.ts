/**
 * Unit tests for the Vector / VectorXY property decoders (TASK-021).
 */
import { describe, it, expect } from "vitest";
import { BitReader } from "../../../src/reader/BitReader.js";
import {
  decodeVector,
  decodeVectorXY,
} from "../../../src/properties/VectorDecoder.js";
import {
  SendPropType,
  type SendProp,
} from "../../../src/datatables/SendTable.js";
import { SPropFlags } from "../../../src/datatables/SPropFlags.js";
import type { FlattenedSendProp } from "../../../src/datatables/ServerClass.js";

function vectorProp(
  type: typeof SendPropType.VECTOR | typeof SendPropType.VECTORXY,
  opts: Partial<SendProp> = {},
): FlattenedSendProp {
  const prop: SendProp = {
    type,
    varName: "test",
    flags: 0,
    priority: 0,
    numElements: 0,
    lowValue: 0,
    highValue: 0,
    numBits: 0,
    ...opts,
  };
  return { prop, sourceTableName: "DT_Test" };
}

/** Pack three IEEE 754 float32 values into a 12-byte buffer. */
function float32x3(a: number, b: number, c: number): Uint8Array {
  const buf = new ArrayBuffer(12);
  const dv = new DataView(buf);
  dv.setFloat32(0, a, true);
  dv.setFloat32(4, b, true);
  dv.setFloat32(8, c, true);
  return new Uint8Array(buf);
}

describe("VectorDecoder — decodeVector", () => {
  it("decodes three NOSCALE floats as { x, y, z }", () => {
    const reader = new BitReader(float32x3(1.5, -2.5, 3.5));
    const v = decodeVector(
      reader,
      vectorProp(SendPropType.VECTOR, { flags: SPropFlags.NOSCALE }),
    );
    expect(v.x).toBeCloseTo(1.5, 6);
    expect(v.y).toBeCloseTo(-2.5, 6);
    expect(v.z).toBeCloseTo(3.5, 6);
  });

  it("recovers z from x,y when SPROP_NORMAL is set (sign bit clear)", () => {
    // x=0.6, y=0.8 → x²+y² = 1.0 → z = 0. Use NOSCALE for x,y so we can
    // hand-pack their floats; the prop has both NOSCALE and NORMAL set.
    // The sign bit follows after the two floats.
    const buf = new Uint8Array(9);
    buf.set(float32x3(0.6, 0.8, 0).subarray(0, 8), 0);
    // bit 64 = sign bit = 0 → leave buf[8] = 0.
    const reader = new BitReader(buf);
    const v = decodeVector(
      reader,
      vectorProp(SendPropType.VECTOR, {
        flags: SPropFlags.NOSCALE | SPropFlags.NORMAL,
      }),
    );
    expect(v.x).toBeCloseTo(0.6, 5);
    expect(v.y).toBeCloseTo(0.8, 5);
    expect(v.z).toBeCloseTo(0, 5);
  });

  it("recovers z from x,y with negative sign", () => {
    // x=0.0, y=0.0 → z² = 1 → z = 1, with sign bit = 1 → -1.
    const buf = new Uint8Array(9);
    // floats already 0; sign bit at byte 8 bit 0 = 1.
    buf[8] = 0b00000001;
    const reader = new BitReader(buf);
    const v = decodeVector(
      reader,
      vectorProp(SendPropType.VECTOR, {
        flags: SPropFlags.NOSCALE | SPropFlags.NORMAL,
      }),
    );
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBeCloseTo(-1, 6);
  });

  it("clamps z to 0 when |x,y| > 1 under NORMAL", () => {
    // x=1.5, y=1.5 → x²+y² = 4.5 > 1 → z = 0 (Source's defensive clamp).
    const buf = new Uint8Array(9);
    buf.set(float32x3(1.5, 1.5, 0).subarray(0, 8), 0);
    const reader = new BitReader(buf);
    const v = decodeVector(
      reader,
      vectorProp(SendPropType.VECTOR, {
        flags: SPropFlags.NOSCALE | SPropFlags.NORMAL,
      }),
    );
    expect(v.z).toBe(0);
  });
});

describe("VectorDecoder — decodeVectorXY", () => {
  it("decodes two floats as { x, y } with no z read", () => {
    // Pack two floats; an extra trailing byte verifies no z consumption.
    const buf = new Uint8Array(9);
    const dv = new DataView(buf.buffer);
    dv.setFloat32(0, 4.25, true);
    dv.setFloat32(4, -8.5, true);
    buf[8] = 0xff;
    const reader = new BitReader(buf);
    const v = decodeVectorXY(
      reader,
      vectorProp(SendPropType.VECTORXY, { flags: SPropFlags.NOSCALE }),
    );
    expect(v.x).toBeCloseTo(4.25, 6);
    expect(v.y).toBeCloseTo(-8.5, 6);
    // Cursor at bit 64 — z untouched.
    expect(reader.position).toBe(64);
  });
});
