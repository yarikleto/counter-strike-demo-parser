/**
 * Unit tests for parseDataTables.
 *
 * We hand-build a minimal dem_datatables payload using ts-proto encoders
 * (for the SendTable section) and direct byte construction (for the raw
 * class-info section, which is NOT a framed protobuf message). This keeps
 * the tests decoupled from any real demo fixture — the integration test
 * in `test/integration/datatables.test.ts` covers the file-driven path.
 *
 * Wire format inside a dem_datatables payload:
 *   [varint cmd_id == svc_SendTable][varint size][SendTable payload]   *N
 *   [varint cmd_id == svc_SendTable][varint size][SendTable with is_end=true]
 *   int16 numClasses
 *   { int16 classId, cstring className, cstring dataTableName } * numClasses
 */
import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import _m0 from "protobufjs/minimal";
import { parseDataTables } from "../../../src/datatables/DataTablesParser.js";
import { SendPropType } from "../../../src/datatables/SendTable.js";
import { CSVCMsg_SendTable } from "../../../src/proto/index.js";
import { SVCMessages } from "../../../src/generated/netmessages.js";

/**
 * Helper: encode a sequence of (cmd_id, payload) entries as a flat
 * varint-cmd / varint-size / payload stream.
 */
function buildFramedStream(
  messages: Array<{ cmd: number; bytes: Uint8Array }>,
): Buffer {
  return Buffer.concat(
    messages.map(({ cmd, bytes }) => {
      const w = _m0.Writer.create();
      w.uint32(cmd);
      w.uint32(bytes.length);
      const prefix = w.finish();
      return Buffer.concat([Buffer.from(prefix), Buffer.from(bytes)]);
    }),
  );
}

/** Encode int16 little-endian. */
function int16LE(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeInt16LE(n, 0);
  return b;
}

/** Encode a null-terminated UTF-8 string. */
function cstring(s: string): Buffer {
  return Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);
}

/** Build a class-info section matching Source's writer. */
function buildClassInfo(
  classes: Array<{ classId: number; className: string; dtName: string }>,
): Buffer {
  return Buffer.concat([
    int16LE(classes.length),
    ...classes.flatMap((c) => [
      int16LE(c.classId),
      cstring(c.className),
      cstring(c.dtName),
    ]),
  ]);
}

describe("parseDataTables", () => {
  it("parses a single SendTable + terminator + class-info into both registries", () => {
    const trivialTable = CSVCMsg_SendTable.encode(
      CSVCMsg_SendTable.fromPartial({
        netTableName: "DT_Trivial",
        needsDecoder: false,
        props: [
          {
            type: SendPropType.INT,
            varName: "m_iCount",
            flags: 0,
            priority: 0,
            numElements: 0,
            lowValue: 0,
            highValue: 0,
            numBits: 32,
          },
        ],
      }),
    ).finish();

    const terminator = CSVCMsg_SendTable.encode(
      CSVCMsg_SendTable.fromPartial({ isEnd: true }),
    ).finish();

    const sendTablesSection = buildFramedStream([
      { cmd: SVCMessages.svc_SendTable, bytes: trivialTable },
      { cmd: SVCMessages.svc_SendTable, bytes: terminator },
    ]);

    const classInfoSection = buildClassInfo([
      { classId: 1, className: "CTrivialEntity", dtName: "DT_Trivial" },
    ]);

    const stream = Buffer.concat([sendTablesSection, classInfoSection]);
    const result = parseDataTables(stream);

    expect(result.sendTables.size).toBe(1);
    expect(result.sendTables.has("DT_Trivial")).toBe(true);
    const table = result.sendTables.get("DT_Trivial")!;
    expect(table.netTableName).toBe("DT_Trivial");
    expect(table.needsDecoder).toBe(false);
    expect(table.props).toHaveLength(1);
    expect(table.props[0].varName).toBe("m_iCount");
    expect(table.props[0].type).toBe(SendPropType.INT);
    expect(table.props[0].numBits).toBe(32);

    expect(result.serverClasses).toHaveLength(1);
    const sc = result.serverClasses[0];
    expect(sc.classId).toBe(1);
    expect(sc.className).toBe("CTrivialEntity");
    expect(sc.dtName).toBe("DT_Trivial");
    expect(sc.sendTable).toBe(table);
    // M2 Slice 2: parseDataTables now flattens each ServerClass's
    // SendTable tree eagerly. The trivial single-prop table becomes one
    // FlattenedSendProp wrapping the original `m_iCount` prop.
    expect(sc.flattenedProps).toHaveLength(1);
    expect(sc.flattenedProps[0]!.prop.varName).toBe("m_iCount");
    expect(sc.flattenedProps[0]!.sourceTableName).toBe("DT_Trivial");
  });

  it("normalizes proto defaults on SendProp fields", () => {
    // Encode a prop with EVERY default-valued field omitted on the wire.
    const tableBytes = CSVCMsg_SendTable.encode(
      CSVCMsg_SendTable.fromPartial({
        netTableName: "DT_Defaults",
        props: [
          {
            // Only varName is meaningful; everything else should land as 0.
            varName: "m_zero",
          },
        ],
      }),
    ).finish();

    const terminator = CSVCMsg_SendTable.encode(
      CSVCMsg_SendTable.fromPartial({ isEnd: true }),
    ).finish();

    const stream = Buffer.concat([
      buildFramedStream([
        { cmd: SVCMessages.svc_SendTable, bytes: tableBytes },
        { cmd: SVCMessages.svc_SendTable, bytes: terminator },
      ]),
      buildClassInfo([]),
    ]);

    const result = parseDataTables(stream);
    const prop = result.sendTables.get("DT_Defaults")!.props[0];
    expect(prop.varName).toBe("m_zero");
    expect(prop.type).toBe(0);
    expect(prop.flags).toBe(0);
    expect(prop.priority).toBe(0);
    expect(prop.numElements).toBe(0);
    expect(prop.lowValue).toBe(0);
    expect(prop.highValue).toBe(0);
    expect(prop.numBits).toBe(0);
    // dtName: ts-proto encodes empty string as "" (the wire actually
    // transmits an empty string field), and our normalizer only treats
    // truly-undefined fields as absent. The decoder produces "" for
    // omitted strings... unless ts-proto's `fromPartial` skipped it.
    // Accept either undefined or empty string here; the decode-time
    // contract is "no sub-table reference if the prop type isn't
    // DATATABLE/ARRAY", which we don't test in isolation.
    if (prop.dtName !== undefined) {
      expect(prop.dtName).toBe("");
    }
  });

  it("keeps the first SendTable and silently drops duplicate registrations", () => {
    // Source's wire stream legitimately contains the same netTableName
    // twice for inline ARRAY element subtables. The parser must NOT
    // throw — it keeps the first.
    const first = CSVCMsg_SendTable.encode(
      CSVCMsg_SendTable.fromPartial({
        netTableName: "DT_Dup",
        props: [{ varName: "first", type: SendPropType.INT }],
      }),
    ).finish();
    const second = CSVCMsg_SendTable.encode(
      CSVCMsg_SendTable.fromPartial({
        netTableName: "DT_Dup",
        props: [{ varName: "second", type: SendPropType.INT }],
      }),
    ).finish();
    const terminator = CSVCMsg_SendTable.encode(
      CSVCMsg_SendTable.fromPartial({ isEnd: true }),
    ).finish();

    const stream = Buffer.concat([
      buildFramedStream([
        { cmd: SVCMessages.svc_SendTable, bytes: first },
        { cmd: SVCMessages.svc_SendTable, bytes: second },
        { cmd: SVCMessages.svc_SendTable, bytes: terminator },
      ]),
      buildClassInfo([]),
    ]);

    const result = parseDataTables(stream);
    expect(result.sendTables.size).toBe(1);
    expect(result.sendTables.get("DT_Dup")!.props[0].varName).toBe("first");
  });

  it("throws when the stream ends without an is_end terminator", () => {
    const lone = CSVCMsg_SendTable.encode(
      CSVCMsg_SendTable.fromPartial({ netTableName: "DT_Lonely" }),
    ).finish();

    const stream = buildFramedStream([
      { cmd: SVCMessages.svc_SendTable, bytes: lone },
    ]);

    expect(() => parseDataTables(stream)).toThrow(/terminator/i);
  });

  it("throws when a non-SendTable message appears before the terminator", () => {
    // Use cmd 10 (svc_ClassInfo) — anything other than svc_SendTable.
    const stream = buildFramedStream([
      { cmd: 10, bytes: new Uint8Array([0x08, 0x00]) },
    ]);

    expect(() => parseDataTables(stream)).toThrow(/svc_SendTable/);
  });
});
