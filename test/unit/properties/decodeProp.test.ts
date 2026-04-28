/**
 * Tests for the master `decodeProp` dispatch (TASK-021).
 *
 * Verifies each SendPropType routes to the correct sub-decoder and that
 * DATATABLE props throw immediately (they should never reach the
 * decoder — the flattener splices their children inline).
 */
import { describe, it, expect } from "vitest";
import { BitReader } from "../../../src/reader/BitReader.js";
import { decodeProp } from "../../../src/properties/decodeProp.js";
import {
  SendPropType,
  type SendProp,
} from "../../../src/datatables/SendTable.js";
import { SPropFlags } from "../../../src/datatables/SPropFlags.js";
import type { FlattenedSendProp } from "../../../src/datatables/ServerClass.js";

function fp(prop: SendProp, arrayElement?: FlattenedSendProp): FlattenedSendProp {
  return { prop, sourceTableName: "DT_Test", arrayElement };
}

describe("decodeProp dispatch", () => {
  it("routes INT to the int decoder", () => {
    const reader = new BitReader(new Uint8Array([0xff]));
    const v = decodeProp(
      reader,
      fp({
        type: SendPropType.INT,
        varName: "i",
        flags: SPropFlags.UNSIGNED,
        priority: 0,
        numElements: 0,
        lowValue: 0,
        highValue: 0,
        numBits: 8,
      }),
    );
    expect(v).toBe(255);
  });

  it("routes INT64 to the int64 decoder", () => {
    const reader = new BitReader(new Uint8Array([0x00]));
    const v = decodeProp(
      reader,
      fp({
        type: SendPropType.INT64,
        varName: "i",
        flags: SPropFlags.UNSIGNED,
        priority: 0,
        numElements: 0,
        lowValue: 0,
        highValue: 0,
        numBits: 8,
      }),
    );
    expect(v).toBe(0n);
  });

  it("routes FLOAT to the float decoder", () => {
    // SPROP_NOSCALE: 32-bit raw float. Pack 1.0.
    const buf = new Uint8Array(4);
    new DataView(buf.buffer).setFloat32(0, 1.0, true);
    const reader = new BitReader(buf);
    const v = decodeProp(
      reader,
      fp({
        type: SendPropType.FLOAT,
        varName: "f",
        flags: SPropFlags.NOSCALE,
        priority: 0,
        numElements: 0,
        lowValue: 0,
        highValue: 0,
        numBits: 0,
      }),
    );
    expect(v).toBe(1.0);
  });

  it("routes VECTOR to the vector decoder", () => {
    const buf = new Uint8Array(12);
    const dv = new DataView(buf.buffer);
    dv.setFloat32(0, 1, true);
    dv.setFloat32(4, 2, true);
    dv.setFloat32(8, 3, true);
    const reader = new BitReader(buf);
    const v = decodeProp(
      reader,
      fp({
        type: SendPropType.VECTOR,
        varName: "v",
        flags: SPropFlags.NOSCALE,
        priority: 0,
        numElements: 0,
        lowValue: 0,
        highValue: 0,
        numBits: 0,
      }),
    );
    expect(v).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("routes VECTORXY to the vectorxy decoder", () => {
    const buf = new Uint8Array(8);
    const dv = new DataView(buf.buffer);
    dv.setFloat32(0, 5, true);
    dv.setFloat32(4, -5, true);
    const reader = new BitReader(buf);
    const v = decodeProp(
      reader,
      fp({
        type: SendPropType.VECTORXY,
        varName: "v",
        flags: SPropFlags.NOSCALE,
        priority: 0,
        numElements: 0,
        lowValue: 0,
        highValue: 0,
        numBits: 0,
      }),
    );
    expect(v).toEqual({ x: 5, y: -5 });
  });

  it("routes STRING to the string decoder", () => {
    // length=0, returns empty string.
    const reader = new BitReader(new Uint8Array(2));
    const v = decodeProp(
      reader,
      fp({
        type: SendPropType.STRING,
        varName: "s",
        flags: 0,
        priority: 0,
        numElements: 0,
        lowValue: 0,
        highValue: 0,
        numBits: 0,
      }),
    );
    expect(v).toBe("");
  });

  it("routes ARRAY to the array decoder (count=0 → [])", () => {
    const elementTemplate = fp({
      type: SendPropType.INT,
      varName: "el",
      flags: SPropFlags.UNSIGNED | SPropFlags.INSIDEARRAY,
      priority: 0,
      numElements: 0,
      lowValue: 0,
      highValue: 0,
      numBits: 8,
    });
    const reader = new BitReader(new Uint8Array(2));
    const v = decodeProp(
      reader,
      fp(
        {
          type: SendPropType.ARRAY,
          varName: "a",
          flags: 0,
          priority: 0,
          numElements: 5,
          lowValue: 0,
          highValue: 0,
          numBits: 0,
        },
        elementTemplate,
      ),
    );
    expect(v).toEqual([]);
  });

  it("throws for DATATABLE props (must not reach the decoder)", () => {
    const reader = new BitReader(new Uint8Array(1));
    expect(() =>
      decodeProp(
        reader,
        fp({
          type: SendPropType.DATATABLE,
          varName: "d",
          flags: 0,
          priority: 0,
          dtName: "DT_Sub",
          numElements: 0,
          lowValue: 0,
          highValue: 0,
          numBits: 0,
        }),
      ),
    ).toThrow(/DATATABLE/);
  });
});
