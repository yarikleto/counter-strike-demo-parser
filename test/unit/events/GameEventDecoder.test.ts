import { describe, it, expect } from "vitest";
import { decodeGameEvent } from "../../../src/events/GameEventDecoder.js";
import { EventDescriptorTable } from "../../../src/events/EventDescriptorTable.js";
import type { EventDescriptor } from "../../../src/events/EventDescriptor.js";
import { CSVCMsg_GameEvent } from "../../../src/proto/index.js";

/**
 * Helper: build a single-descriptor table for tests.
 */
function tableWith(desc: EventDescriptor): EventDescriptorTable {
  const t = new EventDescriptorTable();
  t.add(desc);
  return t;
}

describe("decodeGameEvent", () => {
  describe("basic decode", () => {
    it("returns undefined when the eventid is not in the descriptor table", () => {
      const table = tableWith({
        eventId: 24,
        name: "player_death",
        keys: [{ name: "userid", type: "short" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 9999, // not in the table
        keys: [{ type: 4, valShort: 5 }],
      });

      const decoded = decodeGameEvent(msg, table);

      expect(decoded).toBeUndefined();
    });

    it("decodes a simple event using descriptor key names", () => {
      const table = tableWith({
        eventId: 39,
        name: "round_start",
        keys: [
          { name: "timelimit", type: "long" },
          { name: "fraglimit", type: "long" },
        ],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 39,
        keys: [
          { type: 3, valLong: 115 },
          { type: 3, valLong: 0 },
        ],
      });

      const decoded = decodeGameEvent(msg, table);

      expect(decoded).toBeDefined();
      expect(decoded!.name).toBe("round_start");
      expect(decoded!.eventId).toBe(39);
      expect(decoded!.data).toEqual({ timelimit: 115, fraglimit: 0 });
    });

    it("freezes the data record so consumers cannot mutate it", () => {
      const table = tableWith({
        eventId: 1,
        name: "tick",
        keys: [{ name: "n", type: "long" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 1,
        keys: [{ type: 3, valLong: 7 }],
      });

      const decoded = decodeGameEvent(msg, table)!;

      expect(Object.isFrozen(decoded.data)).toBe(true);
    });
  });

  describe("type-by-type decoding", () => {
    it("decodes string keys from valString", () => {
      const table = tableWith({
        eventId: 10,
        name: "ev",
        keys: [{ name: "weapon", type: "string" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 10,
        keys: [{ type: 1, valString: "ak47" }],
      });
      expect(decodeGameEvent(msg, table)!.data).toEqual({ weapon: "ak47" });
    });

    it("decodes float keys from valFloat", () => {
      const table = tableWith({
        eventId: 10,
        name: "ev",
        keys: [{ name: "x", type: "float" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 10,
        keys: [{ type: 2, valFloat: 1.5 }],
      });
      expect(decodeGameEvent(msg, table)!.data).toEqual({ x: 1.5 });
    });

    it("decodes long keys from valLong", () => {
      const table = tableWith({
        eventId: 10,
        name: "ev",
        keys: [{ name: "n", type: "long" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 10,
        keys: [{ type: 3, valLong: -42 }],
      });
      expect(decodeGameEvent(msg, table)!.data).toEqual({ n: -42 });
    });

    it("decodes short keys from valShort", () => {
      const table = tableWith({
        eventId: 10,
        name: "ev",
        keys: [{ name: "userid", type: "short" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 10,
        keys: [{ type: 4, valShort: 17 }],
      });
      expect(decodeGameEvent(msg, table)!.data).toEqual({ userid: 17 });
    });

    it("decodes byte keys from valByte", () => {
      const table = tableWith({
        eventId: 10,
        name: "ev",
        keys: [{ name: "team", type: "byte" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 10,
        keys: [{ type: 5, valByte: 3 }],
      });
      expect(decodeGameEvent(msg, table)!.data).toEqual({ team: 3 });
    });

    it("decodes bool keys from valBool", () => {
      const table = tableWith({
        eventId: 10,
        name: "ev",
        keys: [{ name: "headshot", type: "bool" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 10,
        keys: [{ type: 6, valBool: true }],
      });
      expect(decodeGameEvent(msg, table)!.data).toEqual({ headshot: true });
    });

    it("decodes uint64 keys from valUint64 — coerces small bigints to number", () => {
      const table = tableWith({
        eventId: 10,
        name: "ev",
        keys: [{ name: "steamid", type: "uint64" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 10,
        keys: [{ type: 7, valUint64: 12345n }],
      });
      const decoded = decodeGameEvent(msg, table)!;
      expect(decoded.data).toEqual({ steamid: 12345 });
      expect(typeof decoded.data.steamid).toBe("number");
    });

    it("decodes uint64 keys — values exceeding MAX_SAFE_INTEGER stay as string", () => {
      const table = tableWith({
        eventId: 10,
        name: "ev",
        keys: [{ name: "steamid", type: "uint64" }],
      });
      // SteamID64 typically exceeds Number.MAX_SAFE_INTEGER (2^53-1).
      const big = 76561198000000000n;
      expect(big > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 10,
        keys: [{ type: 7, valUint64: big }],
      });
      const decoded = decodeGameEvent(msg, table)!;
      expect(typeof decoded.data.steamid).toBe("string");
      expect(decoded.data.steamid).toBe("76561198000000000");
    });
  });

  describe("defensive behaviour", () => {
    it("decodes the prefix when msg.keys is shorter than descriptor.keys (no throw)", () => {
      const table = tableWith({
        eventId: 5,
        name: "ev",
        keys: [
          { name: "a", type: "long" },
          { name: "b", type: "string" },
          { name: "c", type: "bool" },
        ],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 5,
        keys: [{ type: 3, valLong: 1 }], // only one key on the wire
      });
      const decoded = decodeGameEvent(msg, table)!;
      expect(decoded.data).toEqual({ a: 1 });
    });

    it("decodes the prefix when msg.keys is longer than descriptor.keys (no throw)", () => {
      const table = tableWith({
        eventId: 5,
        name: "ev",
        keys: [{ name: "a", type: "long" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 5,
        keys: [
          { type: 3, valLong: 1 },
          { type: 1, valString: "extra" }, // beyond descriptor schema
        ],
      });
      const decoded = decodeGameEvent(msg, table)!;
      expect(decoded.data).toEqual({ a: 1 });
    });

    it("substitutes a sensible default when the expected value field is missing", () => {
      // Source proto leaves missing fields as schema defaults (empty string,
      // 0, false). We pass through whatever ts-proto materializes — assert
      // that the decoder doesn't throw on a key with no populated value.
      const table = tableWith({
        eventId: 5,
        name: "ev",
        keys: [{ name: "name", type: "string" }],
      });
      const msg = CSVCMsg_GameEvent.fromPartial({
        eventid: 5,
        keys: [{ type: 1 }], // no valString set
      });
      const decoded = decodeGameEvent(msg, table)!;
      // Default for string is "", per ts-proto's createBaseCSVCMsgGameEvent_keyT.
      expect(decoded.data).toEqual({ name: "" });
    });
  });
});
