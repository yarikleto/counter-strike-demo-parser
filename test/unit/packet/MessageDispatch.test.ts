/**
 * Unit tests for MessageDispatcher.
 *
 * We hand-build packet streams using ts-proto encoders so the tests stay
 * decoupled from any real .dem fixture (the integration test in
 * `test/integration/serverinfo.test.ts` covers the file-driven path).
 *
 * Wire format inside a packet payload:
 *   [varint cmd_id][varint size][size bytes of protobuf payload]
 * repeated until the buffer is exhausted.
 */
import { describe, it, expect, vi } from "vitest";
import { Buffer } from "node:buffer";
import _m0 from "protobufjs/minimal";
import {
  MessageDispatcher,
  iterateRawMessages,
} from "../../../src/packet/MessageDispatch.js";
import {
  CNETMsg_Tick,
  CSVCMsg_ServerInfo,
} from "../../../src/proto/index.js";
import { NETMessages, SVCMessages } from "../../../src/generated/netmessages.js";

/**
 * Helper: build a packet stream from (cmd_id, encoded payload) pairs.
 *
 * Each entry is written as `varint cmd_id, varint size, raw payload bytes`.
 * We use protobufjs's writer just to encode the two leading varints — the
 * payload itself is appended verbatim because it's already a complete
 * protobuf-encoded message body produced by ts-proto.
 */
function buildStream(messages: Array<{ cmd: number; bytes: Uint8Array }>): Buffer {
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

describe("MessageDispatcher", () => {
  it("decodes and dispatches a CSVCMsg_ServerInfo message", () => {
    const original = CSVCMsg_ServerInfo.fromPartial({
      protocol: 13881,
      mapName: "de_nuke",
      tickInterval: 1 / 128,
      maxClasses: 284,
    });
    const payload = CSVCMsg_ServerInfo.encode(original).finish();
    const stream = buildStream([
      { cmd: SVCMessages.svc_ServerInfo, bytes: payload },
    ]);

    const seen: Array<typeof original> = [];
    const dispatcher = new MessageDispatcher({
      onServerInfo: (info) => {
        seen.push(info);
      },
    });

    dispatcher.dispatch(stream);

    expect(seen).toHaveLength(1);
    expect(seen[0].mapName).toBe("de_nuke");
    expect(seen[0].protocol).toBe(13881);
    expect(seen[0].maxClasses).toBe(284);
    expect(seen[0].tickInterval).toBe(1 / 128);
  });

  it("dispatches multiple messages in a single packet payload", () => {
    const tickPayload = CNETMsg_Tick.encode(CNETMsg_Tick.fromPartial({ tick: 42 })).finish();
    const infoPayload = CSVCMsg_ServerInfo.encode(
      CSVCMsg_ServerInfo.fromPartial({ mapName: "de_dust2" }),
    ).finish();
    const stream = buildStream([
      { cmd: NETMessages.net_Tick, bytes: tickPayload },
      { cmd: SVCMessages.svc_ServerInfo, bytes: infoPayload },
      { cmd: NETMessages.net_Tick, bytes: tickPayload },
    ]);

    const ticks: number[] = [];
    let infoMap: string | undefined;
    const dispatcher = new MessageDispatcher({
      onNetTick: (msg) => {
        if (msg.tick !== undefined) ticks.push(msg.tick);
      },
      onServerInfo: (info) => {
        infoMap = info.mapName;
      },
    });

    dispatcher.dispatch(stream);

    expect(ticks).toEqual([42, 42]);
    expect(infoMap).toBe("de_dust2");
  });

  it("skips unknown command IDs without throwing and warns once", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unknownCmdId = 9999;
    const filler = new Uint8Array([1, 2, 3, 4, 5]);
    const tickPayload = CNETMsg_Tick.encode(CNETMsg_Tick.fromPartial({ tick: 7 })).finish();
    const stream = buildStream([
      { cmd: unknownCmdId, bytes: filler },
      { cmd: unknownCmdId, bytes: filler },
      { cmd: NETMessages.net_Tick, bytes: tickPayload },
    ]);

    const ticks: number[] = [];
    const dispatcher = new MessageDispatcher({
      onNetTick: (msg) => {
        if (msg.tick !== undefined) ticks.push(msg.tick);
      },
    });

    expect(() => dispatcher.dispatch(stream)).not.toThrow();
    expect(ticks).toEqual([7]);
    // Warned exactly once for the repeated unknown id.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("does not invoke a handler that wasn't registered", () => {
    const tickPayload = CNETMsg_Tick.encode(CNETMsg_Tick.fromPartial({ tick: 1 })).finish();
    const stream = buildStream([{ cmd: NETMessages.net_Tick, bytes: tickPayload }]);

    // No handlers registered — should silently consume the stream.
    const dispatcher = new MessageDispatcher();
    expect(() => dispatcher.dispatch(stream)).not.toThrow();
  });

  it("exposes the set of known command IDs", () => {
    const known = MessageDispatcher.knownCommandIds();
    expect(known).toContain(SVCMessages.svc_ServerInfo);
    expect(known).toContain(NETMessages.net_Tick);
  });

  it("iterateRawMessages yields cmd/payload pairs without decoding", () => {
    const tickPayload = CNETMsg_Tick.encode(CNETMsg_Tick.fromPartial({ tick: 99 })).finish();
    const stream = buildStream([{ cmd: NETMessages.net_Tick, bytes: tickPayload }]);

    const messages = Array.from(iterateRawMessages(stream));
    expect(messages).toHaveLength(1);
    expect(messages[0].commandType).toBe(NETMessages.net_Tick);
    expect(messages[0].payload.equals(Buffer.from(tickPayload))).toBe(true);
  });
});
