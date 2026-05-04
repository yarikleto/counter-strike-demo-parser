import { describe, expect, it } from "vitest";
import { enrichPlayerConnect } from "../../../../src/events/enrichers/playerConnect.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";

function makeCtx(): EnricherContext {
  return {
    players: [],
    entities: undefined,
    gameRules: undefined,
    teams: [],
    userInfoIndex: undefined,
    resolvePlayer: () => undefined,
  } as unknown as EnricherContext;
}

function makeRaw(
  data: Record<string, string | number | boolean>,
): DecodedGameEvent {
  return {
    name: "player_connect",
    eventId: 1,
    data: Object.freeze(data),
  };
}

describe("enrichPlayerConnect", () => {
  it("happy path: human connect surfaces name, steamId, userId, isBot=false", () => {
    const ctx = makeCtx();
    const raw = makeRaw({
      name: "Alice",
      index: 3,
      userid: 42,
      networkid: "STEAM_1:0:12345",
      address: "192.168.1.1:27005",
    });

    const result = enrichPlayerConnect(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("player_connect");
    expect(result!.eventId).toBe(1);
    expect(result!.name).toBe("Alice");
    expect(result!.steamId).toBe("STEAM_1:0:12345");
    expect(result!.userId).toBe(42);
    expect(result!.isBot).toBe(false);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("BOT networkid sets isBot=true", () => {
    const ctx = makeCtx();
    const raw = makeRaw({
      name: "Adrian",
      index: 0,
      userid: 123,
      networkid: "BOT",
      address: "",
    });

    const result = enrichPlayerConnect(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Adrian");
    expect(result!.steamId).toBe("BOT");
    expect(result!.userId).toBe(123);
    expect(result!.isBot).toBe(true);
  });

  it("never returns null even if fields are missing", () => {
    const ctx = makeCtx();
    const raw = makeRaw({});

    const result = enrichPlayerConnect(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("");
    expect(result!.steamId).toBe("");
    expect(result!.userId).toBe(0);
    expect(result!.isBot).toBe(false);
  });

  it("explicit bot field also flips isBot true", () => {
    const ctx = makeCtx();
    // Some builds carry an explicit `bot` boolean alongside networkid;
    // surface that as isBot=true even if networkid weren't "BOT".
    const raw = makeRaw({
      name: "Adrian",
      userid: 99,
      networkid: "STEAM_FAKE_FROM_REPLAY",
      bot: true,
    });

    const result = enrichPlayerConnect(raw, ctx);

    expect(result!.isBot).toBe(true);
  });
});
