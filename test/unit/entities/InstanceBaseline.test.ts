/**
 * Unit tests for instance-baseline lazy decode (TASK-025).
 *
 * Hand-builds a 3-prop ServerClass and a synthetic baseline blob, registers
 * it in a StringTableManager under the class id key, and asserts that
 * `getOrDecodeBaseline` decodes the right (propIndex, value) pairs.
 */
import { describe, it, expect } from "vitest";
import { getOrDecodeBaseline } from "../../../src/entities/InstanceBaseline.js";
import { StringTableManager } from "../../../src/stringtables/StringTableManager.js";
import { StringTable } from "../../../src/stringtables/StringTable.js";
import { SendPropType } from "../../../src/datatables/SendTable.js";
import type { ServerClass, FlattenedSendProp } from "../../../src/datatables/ServerClass.js";
import { SPropFlags } from "../../../src/datatables/SPropFlags.js";

class TestBitWriter {
  private bytes: number[] = [];
  private bitCount = 0;
  writeBit(b: 0 | 1): void {
    const byteIndex = this.bitCount >>> 3;
    const bitIndex = this.bitCount & 7;
    if (byteIndex >= this.bytes.length) this.bytes.push(0);
    this.bytes[byteIndex] |= (b & 1) << bitIndex;
    this.bitCount += 1;
  }
  writeBits(value: number, n: number): void {
    for (let i = 0; i < n; i++) this.writeBit(((value >>> i) & 1) as 0 | 1);
  }
  writeUBitVar(value: number): void {
    const low6 = value & 0x3f;
    const ext = value >>> 6;
    let lookup: number;
    let extBits: number;
    if (ext === 0) {
      lookup = 0; extBits = 0;
    } else if (ext < 1 << 4) {
      lookup = 1; extBits = 4;
    } else if (ext < 1 << 8) {
      lookup = 2; extBits = 8;
    } else {
      lookup = 3; extBits = 28;
    }
    this.writeBits(low6, 6);
    this.writeBits(lookup, 2);
    if (extBits > 0) this.writeBits(ext, extBits);
  }
  toBytes(): Uint8Array { return new Uint8Array(this.bytes); }
}

function makeProp(varName: string, type: number, numBits = 16, flags = 0): FlattenedSendProp {
  return {
    prop: {
      type: type as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      varName, flags, priority: 0, numElements: 0,
      lowValue: 0, highValue: 0, numBits,
    },
    sourceTableName: "DT_T",
  };
}

describe("InstanceBaseline", () => {
  it("decodes a 2-prop baseline keyed by classId", () => {
    const props = [
      makeProp("p0", SendPropType.INT, 8, SPropFlags.UNSIGNED),
      makeProp("p1", SendPropType.INT, 8, SPropFlags.UNSIGNED),
      makeProp("p2", SendPropType.INT, 8, SPropFlags.UNSIGNED),
    ];
    const sc: ServerClass = {
      classId: 42, className: "CTest", dtName: "DT_T",
      sendTable: undefined,
      flattenedProps: props,
      entityStore: null, propColumnLayout: null, cachedBaseline: undefined,
    };
    // Encode: changed-prop-list = [0, 2], with values 0xAB and 0xCD.
    // Wire format matches `markus-wa/demoinfocs-golang`'s `ApplyUpdate`:
    //   newWay flag (1 bit) + readFieldIndex loop terminated by 0xFFF.
    const w = new TestBitWriter();
    // newWay = 1
    w.writeBit(1);
    // index 0 (lastIndex=-1 -> 0): newWay-A fast path, readBit()=1.
    w.writeBit(1);
    // index 2 (lastIndex=0 -> 2, delta=1): newWay-A=0, newWay-B=1, readBits(3)=1.
    w.writeBit(0); w.writeBit(1); w.writeBits(1, 3);
    // terminator (return -1): newWay-A=0, newWay-B=0, readBits(7) tag=0x60 path.
    // Final res = 0xFFF = (31) | (127 << 5). 7-bit ret = 0x7F (tag=0x60, low5=31).
    w.writeBit(0); w.writeBit(0);
    w.writeBits(0x7f, 7);
    w.writeBits(0x7f, 7);
    // value at idx 0: readBits(8) of 0xAB
    w.writeBits(0xab, 8);
    // value at idx 2: readBits(8) of 0xcd
    w.writeBits(0xcd, 8);
    const blob = w.toBytes();

    const tables = new StringTableManager();
    const baselineTable = new StringTable({
      name: "instancebaseline",
      maxEntries: 1024,
      userDataFixedSize: false,
      userDataSize: 0, userDataSizeBits: 0, flags: 0,
    });
    baselineTable.setEntry(0, "42", blob);
    tables.register(baselineTable);

    const baseline = getOrDecodeBaseline(sc, tables);
    expect(baseline).toBeDefined();
    expect(baseline!.propIndices).toEqual([0, 2]);
    expect(baseline!.values).toEqual([0xab, 0xcd]);
    // Caching: second call returns the same object.
    expect(getOrDecodeBaseline(sc, tables)).toBe(baseline);
  });

  it("returns undefined when the baseline table is missing", () => {
    const sc: ServerClass = {
      classId: 1, className: "C", dtName: "D",
      sendTable: undefined,
      flattenedProps: [makeProp("p", SendPropType.INT, 8)],
      entityStore: null, propColumnLayout: null, cachedBaseline: undefined,
    };
    const tables = new StringTableManager();
    expect(getOrDecodeBaseline(sc, tables)).toBeUndefined();
  });

  it("returns undefined when the baseline table has no entry for the class", () => {
    const sc: ServerClass = {
      classId: 99, className: "C", dtName: "D",
      sendTable: undefined,
      flattenedProps: [makeProp("p", SendPropType.INT, 8)],
      entityStore: null, propColumnLayout: null, cachedBaseline: undefined,
    };
    const tables = new StringTableManager();
    const t = new StringTable({
      name: "instancebaseline", maxEntries: 16,
      userDataFixedSize: false, userDataSize: 0, userDataSizeBits: 0, flags: 0,
    });
    tables.register(t);
    expect(getOrDecodeBaseline(sc, tables)).toBeUndefined();
  });
});
