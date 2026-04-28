/**
 * Unit tests for the Float property decoder (TASK-020).
 *
 * Each branch in `decodeFloat`'s flag-priority chain is exercised with a
 * hand-built bit pattern producing a known value. The quantized branch is
 * tested at the three boundary points (bits=0 → low, bits=denom → high,
 * bits=denom/2 → midpoint), plus ROUNDDOWN behavior.
 */
import { describe, it, expect } from "vitest";
import { BitReader } from "../../../src/reader/BitReader.js";
import { decodeFloat } from "../../../src/properties/FloatDecoder.js";
import {
  SendPropType,
  type SendProp,
} from "../../../src/datatables/SendTable.js";
import { SPropFlags } from "../../../src/datatables/SPropFlags.js";
import type { FlattenedSendProp } from "../../../src/datatables/ServerClass.js";

function floatProp(opts: Partial<SendProp> = {}): FlattenedSendProp {
  const prop: SendProp = {
    type: SendPropType.FLOAT,
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

/** Pack the IEEE 754 little-endian bytes of a float32 into a Uint8Array. */
function float32Bytes(f: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, f, true);
  return new Uint8Array(buf);
}

describe("FloatDecoder — branch dispatch", () => {
  it("reads SPROP_NOSCALE as raw IEEE 754 float32", () => {
    for (const value of [Math.PI, -Math.PI, 0, 1.5, -1.5, 1e-6, 1e6]) {
      const reader = new BitReader(float32Bytes(value));
      const decoded = decodeFloat(reader, floatProp({ flags: SPropFlags.NOSCALE }));
      // Round-trip through float32 (the wire is f32 not f64).
      const expected = new Float32Array([value])[0];
      expect(decoded).toBe(expected);
    }
  });

  it("reads SPROP_NORMAL within [-1, 1] and returns 0 for zero magnitude", () => {
    // sign=0, fraction=0 -> 0.0
    const buf = new Uint8Array(2);
    const reader = new BitReader(buf);
    expect(decodeFloat(reader, floatProp({ flags: SPropFlags.NORMAL }))).toBe(0);
    expect(reader.position).toBe(12); // 1 sign bit + 11 fraction bits
  });

  it("reads SPROP_NORMAL with sign bit set yields negative", () => {
    // sign=1 then fraction = 2047 (all 1s)
    // Layout: bit0 = sign, bits 1..11 = fraction.
    // sign=1, fraction = 2047 -> -1.0
    // byte0: bits 0..7 = 0b11111111 = 0xFF
    // byte1: bits 0..3 = 0b1111 (fraction high), upper bits irrelevant
    const buf = new Uint8Array([0xff, 0x0f]);
    const reader = new BitReader(buf);
    const value = decodeFloat(reader, floatProp({ flags: SPropFlags.NORMAL }));
    // 2047 / 2047 with sign = -1.
    expect(value).toBeCloseTo(-1, 6);
  });

  it("reads SPROP_COORD = 0 for two zero header bits", () => {
    const reader = new BitReader(new Uint8Array(4));
    expect(decodeFloat(reader, floatProp({ flags: SPropFlags.COORD }))).toBe(0);
    expect(reader.position).toBe(2);
  });

  it("dispatches COORD_MP / COORD_MP_LP / COORD_MP_INT", () => {
    // For all-zero input the MP coord decoders read in_bounds=0, then for
    // non-integral they read has_int=0 and sign=0 plus a fractional 0,
    // returning 0. We just verify no throw + finite numeric.
    const cases = [
      SPropFlags.COORD_MP,
      SPropFlags.COORD_MP_LP,
      SPropFlags.COORD_MP_INT,
    ];
    for (const flag of cases) {
      const reader = new BitReader(new Uint8Array(4));
      const v = decodeFloat(reader, floatProp({ flags: flag }));
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("dispatches SPROP_CELL_COORD using prop.numBits as integer width", () => {
    // CELL_COORD reads `numBits` int bits + 5 frac bits. Input = 0 → 0.
    const reader = new BitReader(new Uint8Array(4));
    expect(
      decodeFloat(
        reader,
        floatProp({ flags: SPropFlags.CELL_COORD, numBits: 8 }),
      ),
    ).toBe(0);
    expect(reader.position).toBe(13);
  });

  it("dispatches SPROP_CELL_COORD_INT with numBits", () => {
    // input = 0xFF means cellInt = 0xFF (8 bits, integral).
    const reader = new BitReader(new Uint8Array([0xff]));
    expect(
      decodeFloat(
        reader,
        floatProp({ flags: SPropFlags.CELL_COORD_INT, numBits: 8 }),
      ),
    ).toBe(255);
  });
});

describe("FloatDecoder — quantized linear map", () => {
  it("returns lowValue when bits = 0", () => {
    const reader = new BitReader(new Uint8Array(2));
    const v = decodeFloat(
      reader,
      floatProp({ numBits: 10, lowValue: 0, highValue: 1024 }),
    );
    expect(v).toBe(0);
  });

  it("returns highValue when bits = (1<<numBits)-1, no rounding flag", () => {
    // 10 bits all set = 1023. Place 0x03FF (low 10 bits) at bit 0.
    const buf = new Uint8Array([0xff, 0x03]);
    const reader = new BitReader(buf);
    const v = decodeFloat(
      reader,
      floatProp({ numBits: 10, lowValue: 0, highValue: 1024 }),
    );
    expect(v).toBeCloseTo(1024, 6);
  });

  it("returns midpoint when bits ≈ denom/2", () => {
    // bits = 512 (out of 1023), low=0 high=1024 → 0 + (512/1023)*1024 ≈ 512.5
    const buf = new Uint8Array([0x00, 0x02]); // 0x0200 = 512
    const reader = new BitReader(buf);
    const v = decodeFloat(
      reader,
      floatProp({ numBits: 10, lowValue: 0, highValue: 1024 }),
    );
    expect(v).toBeCloseTo((512 / 1023) * 1024, 6);
  });

  it("ROUNDDOWN clips the top step (max bits no longer reaches highValue)", () => {
    const buf = new Uint8Array([0xff, 0x03]);
    const reader = new BitReader(buf);
    const v = decodeFloat(
      reader,
      floatProp({
        numBits: 10,
        lowValue: 0,
        highValue: 1024,
        flags: SPropFlags.ROUNDDOWN,
      }),
    );
    // range adjusted: 1024 - (1024/1023). bits=1023 → 0 + 1*adjusted.
    const adjusted = 1024 - 1024 / 1023;
    expect(v).toBeCloseTo(adjusted, 6);
    expect(v).toBeLessThan(1024);
  });

  it("ROUNDUP shifts the low end up by one step", () => {
    const reader = new BitReader(new Uint8Array(2));
    const v = decodeFloat(
      reader,
      floatProp({
        numBits: 10,
        lowValue: 0,
        highValue: 1024,
        flags: SPropFlags.ROUNDUP,
      }),
    );
    const step = 1024 / 1023;
    expect(v).toBeCloseTo(step, 6);
  });
});
