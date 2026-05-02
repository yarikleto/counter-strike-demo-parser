import { describe, it, expect } from "vitest";
import {
  EventDescriptorTable,
  buildDescriptorTable,
} from "../../../src/events/EventDescriptorTable.js";
import type { EventDescriptor } from "../../../src/events/EventDescriptor.js";
import { CSVCMsg_GameEventList } from "../../../src/proto/index.js";

const playerDeath: EventDescriptor = {
  eventId: 24,
  name: "player_death",
  keys: [
    { name: "userid", type: "short" },
    { name: "attacker", type: "short" },
    { name: "weapon", type: "string" },
    { name: "headshot", type: "bool" },
  ],
};

const roundStart: EventDescriptor = {
  eventId: 39,
  name: "round_start",
  keys: [
    { name: "timelimit", type: "long" },
    { name: "fraglimit", type: "long" },
  ],
};

describe("EventDescriptorTable", () => {
  describe("add() / getById() / getByName() / size", () => {
    it("starts empty", () => {
      const table = new EventDescriptorTable();
      expect(table.size).toBe(0);
      expect(table.getById(0)).toBeUndefined();
      expect(table.getByName("player_death")).toBeUndefined();
    });

    it("add() stores a descriptor retrievable by id", () => {
      const table = new EventDescriptorTable();
      table.add(playerDeath);

      expect(table.size).toBe(1);
      expect(table.getById(24)).toEqual(playerDeath);
    });

    it("add() also indexes by name for getByName()", () => {
      const table = new EventDescriptorTable();
      table.add(playerDeath);

      expect(table.getByName("player_death")).toEqual(playerDeath);
    });

    it("getById() returns undefined for unknown id", () => {
      const table = new EventDescriptorTable();
      table.add(playerDeath);

      expect(table.getById(9999)).toBeUndefined();
    });

    it("getByName() returns undefined for unknown name", () => {
      const table = new EventDescriptorTable();
      table.add(playerDeath);

      expect(table.getByName("nope_not_an_event")).toBeUndefined();
    });

    it("supports multiple descriptors and reports correct size", () => {
      const table = new EventDescriptorTable();
      table.add(playerDeath);
      table.add(roundStart);

      expect(table.size).toBe(2);
      expect(table.getById(24)?.name).toBe("player_death");
      expect(table.getById(39)?.name).toBe("round_start");
      expect(table.getByName("player_death")?.eventId).toBe(24);
      expect(table.getByName("round_start")?.eventId).toBe(39);
    });

    it("re-adding the same id overwrites the previous descriptor (last wins)", () => {
      const table = new EventDescriptorTable();
      table.add(playerDeath);
      const replacement: EventDescriptor = {
        eventId: 24,
        name: "player_death_v2",
        keys: [{ name: "userid", type: "short" }],
      };
      table.add(replacement);

      expect(table.size).toBe(1);
      expect(table.getById(24)).toEqual(replacement);
      // Old name index should not point to a stale descriptor.
      expect(table.getByName("player_death_v2")).toEqual(replacement);
    });
  });

  describe("buildDescriptorTable() — from raw CSVCMsg_GameEventList", () => {
    it("builds an empty table from an empty descriptors array", () => {
      const msg = CSVCMsg_GameEventList.fromPartial({ descriptors: [] });
      const table = buildDescriptorTable(msg);
      expect(table.size).toBe(0);
    });

    it("maps every type code to its TypeScript label", () => {
      const msg = CSVCMsg_GameEventList.fromPartial({
        descriptors: [
          {
            eventid: 1,
            name: "all_types",
            keys: [
              { name: "s", type: 1 }, // string
              { name: "f", type: 2 }, // float
              { name: "l", type: 3 }, // long
              { name: "sh", type: 4 }, // short
              { name: "b", type: 5 }, // byte
              { name: "bo", type: 6 }, // bool
              { name: "u", type: 7 }, // uint64
            ],
          },
        ],
      });
      const table = buildDescriptorTable(msg);
      const desc = table.getById(1);
      expect(desc).toBeDefined();
      expect(desc!.keys.map((k) => k.type)).toEqual([
        "string",
        "float",
        "long",
        "short",
        "byte",
        "bool",
        "uint64",
      ]);
      expect(desc!.keys.map((k) => k.name)).toEqual([
        "s",
        "f",
        "l",
        "sh",
        "b",
        "bo",
        "u",
      ]);
    });

    it("preserves eventId, name, and keys array on a realistic descriptor", () => {
      const msg = CSVCMsg_GameEventList.fromPartial({
        descriptors: [
          {
            eventid: 24,
            name: "player_death",
            keys: [
              { name: "userid", type: 4 },
              { name: "attacker", type: 4 },
              { name: "weapon", type: 1 },
              { name: "headshot", type: 6 },
            ],
          },
          {
            eventid: 39,
            name: "round_start",
            keys: [
              { name: "timelimit", type: 3 },
              { name: "fraglimit", type: 3 },
            ],
          },
        ],
      });
      const table = buildDescriptorTable(msg);
      expect(table.size).toBe(2);
      expect(table.getByName("player_death")?.eventId).toBe(24);
      expect(table.getById(39)?.name).toBe("round_start");
      expect(table.getByName("player_death")?.keys).toHaveLength(4);
    });
  });
});
