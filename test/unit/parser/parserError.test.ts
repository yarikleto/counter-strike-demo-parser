/**
 * Unit tests for TASK-059: defensive parsing.
 *
 * These tests build small synthetic .dem buffers — a valid header + a handful
 * of frames — that exercise the four recoverable failure modes the parser
 * must surface as a typed `parserError` event without throwing past
 * `parseAll()`:
 *
 *   - `truncated`         — buffer ends mid-frame (the `ByteReader` raises a
 *                           RangeError on out-of-range reads).
 *   - `invalid-frame`     — first byte of a frame is not in the
 *                           `DemoCommands` enum, so `FrameParser.readFrame`
 *                           throws a "FrameParser: unknown command byte"
 *                           error.
 *   - `corrupt-protobuf`  — a known SVC command id with an unparseable
 *                           protobuf body. The dispatcher should swallow
 *                           the per-message decode failure and continue;
 *                           SUBSEQUENT frames in the same buffer must still
 *                           produce events.
 *
 * Note on synthesizing a corrupt protobuf payload: a single 0x0a byte is the
 * tag for "field 1, wire type LEN_DELIM". ts-proto's reader then tries to
 * consume the length varint and runs out of input — throwing. This is the
 * minimum forcing case for `corrupt-protobuf`; larger random blobs often
 * parse silently as garbage `ServerInfo` instances.
 */
import { describe, it, expect } from "vitest";
import { DemoParser } from "../../../src/DemoParser.js";
import { DemoCommands } from "../../../src/frame/DemoCommands.js";

/** Header size: 8 (magic) + 4 + 4 + 260*4 + 4 + 4 + 4 + 4 = 1072 bytes. */
const HEADER_SIZE = 1072;
/** Size of the command info block in dem_packet frames. */
const COMMAND_INFO_SIZE = 152;
/** Numeric id of `svc_ServerInfo` per the generated NETMessages enum. */
const SVC_SERVER_INFO = 8;

/** Minimal valid 1072-byte demo header — magic only, all other fields zero. */
function buildHeader(): Buffer {
  const buf = Buffer.alloc(HEADER_SIZE);
  buf.write("HL2DEMO\0", 0, 8, "utf8");
  return buf;
}

/** 6-byte common frame prefix: command + tick(int32 LE) + playerSlot(u8). */
function buildFramePrefix(command: number, tick: number, playerSlot = 0): Buffer {
  const buf = Buffer.alloc(6);
  buf.writeUInt8(command, 0);
  buf.writeInt32LE(tick, 1);
  buf.writeUInt8(playerSlot, 5);
  return buf;
}

/**
 * Build a `dem_packet` frame whose payload is exactly `payload` (i.e. the raw
 * protobuf message stream bytes the dispatcher iterates over). The 152-byte
 * commandInfo block and the two seq int32 are zero-filled.
 */
function buildPacketFrame(tick: number, payload: Buffer): Buffer {
  const prefix = buildFramePrefix(DemoCommands.DEM_PACKET, tick);
  const commandInfo = Buffer.alloc(COMMAND_INFO_SIZE);
  const seqIn = Buffer.alloc(4);
  const seqOut = Buffer.alloc(4);
  const dataLen = Buffer.alloc(4);
  dataLen.writeInt32LE(payload.length, 0);
  return Buffer.concat([prefix, commandInfo, seqIn, seqOut, dataLen, payload]);
}

/**
 * Encode an unsigned int as a protobuf varint (1..5 bytes). Used for the
 * dispatcher's `cmd_id` and `size` fields inside a dem_packet payload.
 */
function encodeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

/**
 * Encode one (cmd_id, payload) pair as it appears inside a dem_packet's
 * data section: varint cmd, varint size, then `size` bytes of payload.
 */
function encodeMessage(cmdId: number, payload: Buffer): Buffer {
  return Buffer.concat([encodeVarInt(cmdId), encodeVarInt(payload.length), payload]);
}

const STOP_FRAME = buildFramePrefix(DemoCommands.DEM_STOP, 0);

describe("DemoParser parserError event (TASK-059)", () => {
  it("emits parserError(kind: 'truncated') when the buffer ends mid-frame and exits cleanly", () => {
    // A valid header followed by the FIRST byte of a packet-frame prefix.
    // The prefix needs 6 bytes (command + tick + slot) but we only supply 1,
    // so `ByteReader.readInt32` for the tick triggers a RangeError — caught
    // by `parseAll` and surfaced as `truncated`.
    const partialPrefix = Buffer.from([DemoCommands.DEM_PACKET]);
    const buffer = Buffer.concat([buildHeader(), partialPrefix]);

    const parser = new DemoParser(buffer);
    const errors: Array<{
      kind: string;
      tick: number;
      byteOffset: number;
      message: string;
    }> = [];
    parser.on("parserError", (e) => {
      errors.push({
        kind: e.kind,
        tick: e.tick,
        byteOffset: e.byteOffset,
        message: e.message,
      });
    });

    // Must NOT throw — defensive parser swallows malformed-input errors.
    expect(() => parser.parseAll()).not.toThrow();

    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("truncated");
    expect(errors[0].byteOffset).toBeGreaterThanOrEqual(HEADER_SIZE);
    // Sanity-check the failure was localized to the truncated frame.
    expect(errors[0].byteOffset).toBeLessThan(buffer.length + 16);
    expect(errors[0].message).toMatch(/EOF/i);
  });

  it("emits parserError(kind: 'invalid-frame') on an unknown frame command byte and exits cleanly", () => {
    // Command byte 99 is not in DemoCommands — `FrameParser.readFrame` throws
    // its "unknown command byte" error.
    const badPrefix = buildFramePrefix(99, 12345);
    const buffer = Buffer.concat([buildHeader(), badPrefix]);

    const parser = new DemoParser(buffer);
    const errors: Array<{ kind: string; byteOffset: number; message: string }> = [];
    parser.on("parserError", (e) => {
      errors.push({ kind: e.kind, byteOffset: e.byteOffset, message: e.message });
    });

    expect(() => parser.parseAll()).not.toThrow();

    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("invalid-frame");
    expect(errors[0].message).toContain("unknown command byte");
    // The offset should locate the start of the bad frame, i.e. just after
    // the header.
    expect(errors[0].byteOffset).toBe(HEADER_SIZE);
  });

  it("emits parserError(kind: 'corrupt-protobuf') and CONTINUES past the broken message", () => {
    // Frame 1 (tick=10): packet whose data carries one message:
    //   cmd_id = svc_ServerInfo (8), size = 1, payload = 0x0a (field-1
    //   length-delimited tag with no length varint following). ts-proto's
    //   decode throws on this — the dispatcher swallows + reports.
    const corruptMessage = encodeMessage(SVC_SERVER_INFO, Buffer.from([0x0a]));
    const corruptPacketFrame = buildPacketFrame(10, corruptMessage);

    // Frame 2 (tick=20): a benign synctick. If the parser correctly continued
    // past the corrupt-protobuf failure, we should observe `currentTick`
    // advance to 20 by the time we emit our verification listener.
    const synctick = buildFramePrefix(DemoCommands.DEM_SYNCTICK, 20);

    const buffer = Buffer.concat([
      buildHeader(),
      corruptPacketFrame,
      synctick,
      STOP_FRAME,
    ]);

    const parser = new DemoParser(buffer);

    const errors: Array<{ kind: string; tick: number; byteOffset: number }> = [];
    parser.on("parserError", (e) => {
      errors.push({ kind: e.kind, tick: e.tick, byteOffset: e.byteOffset });
    });

    expect(() => parser.parseAll()).not.toThrow();

    // Exactly one corrupt-protobuf parserError fired …
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("corrupt-protobuf");
    // … and the parser advanced past the broken frame: `currentTick` is
    // now the synctick's tick (20), proving the loop did not abort.
    expect(parser.currentTick).toBe(20);
    expect(errors[0].byteOffset).toBeGreaterThanOrEqual(HEADER_SIZE);
  });

  it("attaches a non-empty cause Error and a finite tick to every parserError", () => {
    // Cross-cutting sanity check on the payload contract: cause must be an
    // Error instance and tick must be finite for any parserError event.
    const buffer = Buffer.concat([
      buildHeader(),
      buildFramePrefix(99, 7), // invalid frame command — fires parserError
    ]);

    const parser = new DemoParser(buffer);
    let payload: { tick: number; cause: unknown } | undefined;
    parser.on("parserError", (e) => {
      payload = { tick: e.tick, cause: e.cause };
    });
    parser.parseAll();

    expect(payload).toBeDefined();
    expect(payload!.cause).toBeInstanceOf(Error);
    expect(Number.isFinite(payload!.tick)).toBe(true);
  });
});
