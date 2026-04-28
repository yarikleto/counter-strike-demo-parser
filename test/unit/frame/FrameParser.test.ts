import { describe, it, expect } from "vitest";
import { ByteReader } from "../../../src/reader/ByteReader.js";
import { iterateFrames } from "../../../src/frame/FrameParser.js";
import { DemoCommands } from "../../../src/frame/DemoCommands.js";

/** Size of the command info block in packet frames. */
const COMMAND_INFO_SIZE = 152;

/**
 * Build a minimal frame prefix: command (uint8) + tick (int32 LE) + playerSlot (uint8).
 * Total: 6 bytes.
 */
function buildFramePrefix(command: number, tick: number, playerSlot: number): Buffer {
  const buf = Buffer.alloc(6);
  buf.writeUInt8(command, 0);
  buf.writeInt32LE(tick, 1);
  buf.writeUInt8(playerSlot, 5);
  return buf;
}

describe("iterateFrames", () => {
  it("should yield a synctick frame with correct header fields", () => {
    // synctick (3) has no payload — just the 6-byte prefix
    const prefix = buildFramePrefix(DemoCommands.DEM_SYNCTICK, 42, 0);
    // Follow with dem_stop so iteration terminates cleanly
    const stop = buildFramePrefix(DemoCommands.DEM_STOP, 0, 0);
    const buf = Buffer.concat([prefix, stop]);

    const reader = new ByteReader(buf);
    const frames = [...iterateFrames(reader)];

    expect(frames).toHaveLength(1);
    expect(frames[0].command).toBe(DemoCommands.DEM_SYNCTICK);
    expect(frames[0].tick).toBe(42);
    expect(frames[0].playerSlot).toBe(0);
    expect(frames[0].packetData).toBeUndefined();
  });

  it("should yield nothing when the first frame is dem_stop", () => {
    const stop = buildFramePrefix(DemoCommands.DEM_STOP, 0, 0);
    const reader = new ByteReader(stop);
    const frames = [...iterateFrames(reader)];

    expect(frames).toHaveLength(0);
  });

  it("should parse a packet frame and return packetData", () => {
    const tick = 100;
    const playerSlot = 0;
    const packetPayload = Buffer.from([0xde, 0xad, 0xbe, 0xef]);

    // Build the packet frame: prefix + commandInfo(152) + seqIn(4) + seqOut(4) + dataLen(4) + data
    const prefix = buildFramePrefix(DemoCommands.DEM_PACKET, tick, playerSlot);
    const commandInfo = Buffer.alloc(COMMAND_INFO_SIZE);
    const seqIn = Buffer.alloc(4);
    seqIn.writeInt32LE(1, 0);
    const seqOut = Buffer.alloc(4);
    seqOut.writeInt32LE(2, 0);
    const dataLen = Buffer.alloc(4);
    dataLen.writeInt32LE(packetPayload.length, 0);

    // Terminate with dem_stop
    const stop = buildFramePrefix(DemoCommands.DEM_STOP, 0, 0);

    const buf = Buffer.concat([prefix, commandInfo, seqIn, seqOut, dataLen, packetPayload, stop]);

    const reader = new ByteReader(buf);
    const frames = [...iterateFrames(reader)];

    expect(frames).toHaveLength(1);
    expect(frames[0].command).toBe(DemoCommands.DEM_PACKET);
    expect(frames[0].tick).toBe(tick);
    expect(frames[0].playerSlot).toBe(playerSlot);
    expect(frames[0].packetData).toEqual(packetPayload);
  });

  it("should parse multiple frames in sequence", () => {
    const synctick = buildFramePrefix(DemoCommands.DEM_SYNCTICK, 10, 0);
    const synctick2 = buildFramePrefix(DemoCommands.DEM_SYNCTICK, 20, 0);
    const stop = buildFramePrefix(DemoCommands.DEM_STOP, 0, 0);

    const buf = Buffer.concat([synctick, synctick2, stop]);
    const reader = new ByteReader(buf);
    const frames = [...iterateFrames(reader)];

    expect(frames).toHaveLength(2);
    expect(frames[0].tick).toBe(10);
    expect(frames[1].tick).toBe(20);
  });

  it("should skip consolecmd frames (length-prefixed data)", () => {
    const cmdData = Buffer.from("echo test", "utf8");
    const prefix = buildFramePrefix(DemoCommands.DEM_CONSOLECMD, 50, 0);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeInt32LE(cmdData.length, 0);
    const stop = buildFramePrefix(DemoCommands.DEM_STOP, 0, 0);

    const buf = Buffer.concat([prefix, lenBuf, cmdData, stop]);
    const reader = new ByteReader(buf);
    const frames = [...iterateFrames(reader)];

    expect(frames).toHaveLength(1);
    expect(frames[0].command).toBe(DemoCommands.DEM_CONSOLECMD);
    expect(frames[0].packetData).toBeUndefined();
  });
});
