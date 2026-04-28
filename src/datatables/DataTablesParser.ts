/**
 * DataTablesParser — decodes a single dem_datatables frame's payload into
 * a SendTableRegistry plus the list of ServerClasses keyed by class ID.
 *
 * Wire format (verified against Source SDK 2013 and confirmed empirically
 * against de_nuke.dem):
 *
 *   { (varint cmdId == svc_SendTable, varint size, CSVCMsg_SendTable) }*
 *   (varint cmdId == svc_SendTable, ..., is_end == true)   // sentinel
 *   int16  numClasses                                       // raw, NOT framed
 *   { int16 classId, cstring className, cstring dataTableName } * numClasses
 *
 * Two non-obvious details:
 *
 *   1. The class info section is NOT a framed protobuf message — it is raw
 *      bytes appended directly after the terminator. Source's DemoFile
 *      writer calls WriteShort()/WriteString() directly for this section
 *      rather than wrapping it in a CSVCMsg_ClassInfo payload (despite the
 *      proto definition existing). Treating it as a framed message is one
 *      of the most common bugs in Source demo parsers.
 *
 *   2. The SendTable stream may contain two messages with the same
 *      `netTableName`. These are inline duplicates that arise when an
 *      ARRAY prop's element template references a sub-table that's also
 *      defined elsewhere in the tree. We keep the FIRST registration and
 *      silently ignore subsequent duplicates — this matches the behavior
 *      of demoinfocs-golang and other reference parsers.
 */
import { ByteReader } from "../reader/ByteReader.js";
import { SVCMessages } from "../generated/netmessages.js";
import { CSVCMsg_SendTable } from "../proto/index.js";
import type { SendProp, SendPropTypeValue, SendTable } from "./SendTable.js";
import { SendTableRegistry } from "./SendTableRegistry.js";
import type { ServerClass } from "./ServerClass.js";

/** Output of parseDataTables: every SendTable plus every ServerClass. */
export interface DataTablesParseResult {
  readonly sendTables: SendTableRegistry;
  readonly serverClasses: ServerClass[];
}

/**
 * Decode one dem_datatables payload.
 *
 * Returns the populated SendTableRegistry and the ordered list of
 * ServerClasses. Throws if the SendTable stream ends before a terminator
 * (`is_end == true`) is seen, if a non-SendTable message appears in the
 * SendTable section, or if the class-info section runs out of bytes mid-
 * record.
 */
export function parseDataTables(data: Buffer): DataTablesParseResult {
  const reader = new ByteReader(data);
  const sendTables = new SendTableRegistry();

  // 1. Read svc_SendTable messages until the is_end sentinel.
  let sawTerminator = false;
  while (reader.position < reader.length) {
    const commandId = reader.readVarInt32();
    const size = reader.readVarInt32();
    const payload = reader.readBytes(size);

    if (commandId !== SVCMessages.svc_SendTable) {
      throw new Error(
        `parseDataTables: expected svc_SendTable (${SVCMessages.svc_SendTable}) ` +
          `before the terminator, got commandId ${commandId}`,
      );
    }

    const view = new Uint8Array(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    const msg = CSVCMsg_SendTable.decode(view);

    if (msg.isEnd === true) {
      sawTerminator = true;
      break;
    }

    const table = toSendTable(msg);
    // Duplicate SendTables are legal in the wire stream (inline ARRAY
    // element subtables); keep the first, ignore the rest.
    if (!sendTables.has(table.netTableName)) {
      sendTables.register(table);
    }
  }

  if (!sawTerminator) {
    throw new Error(
      "parseDataTables: stream ended before svc_SendTable terminator (is_end)",
    );
  }

  // 2. Read the trailing class-info section as raw bytes.
  const serverClasses = readClassInfo(reader, sendTables);

  return { sendTables, serverClasses };
}

/**
 * Read the class-info section: int16 count followed by `count` records
 * of (int16 classId, cstring className, cstring dataTableName).
 */
function readClassInfo(
  reader: ByteReader,
  sendTables: SendTableRegistry,
): ServerClass[] {
  const numClasses = readInt16LE(reader);
  const out: ServerClass[] = [];
  for (let i = 0; i < numClasses; i++) {
    const classId = readInt16LE(reader);
    const className = readCString(reader);
    const dtName = readCString(reader);
    out.push({
      classId,
      className,
      dtName,
      sendTable: sendTables.get(dtName),
      flattenedProps: [],
    });
  }
  return out;
}

/**
 * Read a signed 16-bit little-endian integer. ByteReader doesn't expose
 * an int16 reader (no other layer needs one yet), so we reconstruct it
 * from two byte reads.
 */
function readInt16LE(reader: ByteReader): number {
  const lo = reader.readUInt8();
  const hi = reader.readUInt8();
  // Sign-extend from 16 bits.
  const unsigned = (hi << 8) | lo;
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}

/**
 * Read a null-terminated UTF-8 string. Consumes bytes up to AND including
 * the terminating null. Throws if no null is found before the buffer ends.
 */
function readCString(reader: ByteReader): string {
  const bytes: number[] = [];
  while (reader.position < reader.length) {
    const byte = reader.readUInt8();
    if (byte === 0) {
      return Buffer.from(bytes).toString("utf8");
    }
    bytes.push(byte);
  }
  throw new Error(
    "parseDataTables: unterminated cstring in class-info section",
  );
}

/**
 * Convert a decoded CSVCMsg_SendTable into our public SendTable type,
 * normalizing proto-default fields to concrete numbers.
 */
function toSendTable(msg: {
  netTableName?: string | undefined;
  needsDecoder?: boolean | undefined;
  props: Array<{
    type?: number | undefined;
    varName?: string | undefined;
    flags?: number | undefined;
    priority?: number | undefined;
    dtName?: string | undefined;
    numElements?: number | undefined;
    lowValue?: number | undefined;
    highValue?: number | undefined;
    numBits?: number | undefined;
  }>;
}): SendTable {
  const props: SendProp[] = msg.props.map((p) => {
    const base = {
      type: (p.type ?? 0) as SendPropTypeValue,
      varName: p.varName ?? "",
      flags: p.flags ?? 0,
      priority: p.priority ?? 0,
      numElements: p.numElements ?? 0,
      lowValue: p.lowValue ?? 0,
      highValue: p.highValue ?? 0,
      numBits: p.numBits ?? 0,
    };
    return p.dtName !== undefined ? { ...base, dtName: p.dtName } : base;
  });

  return {
    netTableName: msg.netTableName ?? "",
    needsDecoder: msg.needsDecoder ?? false,
    props,
  };
}
