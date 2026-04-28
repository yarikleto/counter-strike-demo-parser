/**
 * Unit tests for the Array property decoder (TASK-021).
 *
 * Wire format: ceil(log2(numElements + 1)) bits of count, followed by
 * `count` decoded element values using the array's element template.
 */
import { describe, it, expect } from "vitest";
import { BitReader } from "../../../src/reader/BitReader.js";
import { decodeArray } from "../../../src/properties/ArrayDecoder.js";
import {
  SendPropType,
  type SendProp,
} from "../../../src/datatables/SendTable.js";
import { SPropFlags } from "../../../src/datatables/SPropFlags.js";
import type { FlattenedSendProp } from "../../../src/datatables/ServerClass.js";

function intElementTemplate(numBits = 8): FlattenedSendProp {
  return {
    prop: {
      type: SendPropType.INT,
      varName: "el",
      flags: SPropFlags.UNSIGNED | SPropFlags.INSIDEARRAY,
      priority: 0,
      numElements: 0,
      lowValue: 0,
      highValue: 0,
      numBits,
    } satisfies SendProp,
    sourceTableName: "DT_Test",
  };
}

function arrayProp(
  numElements: number,
  element: FlattenedSendProp,
): FlattenedSendProp {
  return {
    prop: {
      type: SendPropType.ARRAY,
      varName: "arr",
      flags: 0,
      priority: 0,
      numElements,
      lowValue: 0,
      highValue: 0,
      numBits: 0,
    } satisfies SendProp,
    sourceTableName: "DT_Test",
    arrayElement: element,
  };
}

describe("ArrayDecoder", () => {
  it("returns [] when count is 0", () => {
    // numElements = 5 → ceil(log2(6)) = 3 bits; count = 0.
    const reader = new BitReader(new Uint8Array(1));
    const result = decodeArray(reader, arrayProp(5, intElementTemplate(8)));
    expect(result).toEqual([]);
    expect(reader.position).toBe(3);
  });

  it("decodes a 5-element array of 8-bit ints", () => {
    // numElements = 5 → 3-bit count = 5 (0b101).
    // Layout (LSB-first within byte):
    //   bits 0..2 = 101 (count = 5)
    //   bits 3..10 = first int (8 bits)
    //   bits 11..18 = second int
    //   etc.
    // Construct bytes by writing bits manually.
    const bits: number[] = [];
    // count = 5, 3 bits LSB-first → push 1, 0, 1.
    bits.push(1, 0, 1);
    // 5 ints: 10, 20, 30, 40, 50. Each 8 bits LSB-first.
    for (const v of [10, 20, 30, 40, 50]) {
      for (let i = 0; i < 8; i++) bits.push((v >>> i) & 1);
    }
    const totalBytes = Math.ceil(bits.length / 8);
    const buf = new Uint8Array(totalBytes);
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) buf[i >>> 3] |= 1 << (i & 7);
    }
    const reader = new BitReader(buf);
    const result = decodeArray(reader, arrayProp(5, intElementTemplate(8)));
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("respects partial-fill (count < numElements)", () => {
    // numElements = 7 → ceil(log2(8)) = 3 bits. count = 2.
    const bits: number[] = [0, 1, 0]; // count = 2 (LSB-first: 010)
    for (const v of [42, 99]) {
      for (let i = 0; i < 8; i++) bits.push((v >>> i) & 1);
    }
    const totalBytes = Math.ceil(bits.length / 8);
    const buf = new Uint8Array(totalBytes);
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) buf[i >>> 3] |= 1 << (i & 7);
    }
    const reader = new BitReader(buf);
    const result = decodeArray(reader, arrayProp(7, intElementTemplate(8)));
    expect(result).toEqual([42, 99]);
  });

  it("throws when arrayElement template is missing", () => {
    const propMissingTemplate: FlattenedSendProp = {
      prop: {
        type: SendPropType.ARRAY,
        varName: "broken",
        flags: 0,
        priority: 0,
        numElements: 4,
        lowValue: 0,
        highValue: 0,
        numBits: 0,
      },
      sourceTableName: "DT_Bad",
    };
    const reader = new BitReader(new Uint8Array(2));
    expect(() => decodeArray(reader, propMissingTemplate)).toThrow(
      /no element template/,
    );
  });
});
