import { describe, expect, it } from "vitest";
import { enrichPlayerDisconnect } from "../../../../src/events/enrichers/playerDisconnect.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { Player } from "../../../../src/state/Player.js";
import type { UserInfo } from "../../../../src/state/userInfoIndex.js";

function makeCtx(opts: {
  players?: Map<number, Player>;
  userInfoFor?: Map<number, UserInfo>;
}): EnricherContext {
  const players = opts.players ?? new Map();
  const userInfoFor = opts.userInfoFor ?? new Map();
  return {
    players: [...players.values()],
    entities: undefined,
    gameRules: undefined,
    teams: [],
    userInfoIndex: {
      infoForUserId: (uid: number) => userInfoFor.get(uid),
      entitySlotForUserId: () => undefined,
      userIdForEntitySlot: () => undefined,
      refresh: () => undefined,
    },
    resolvePlayer: (uid: number) => players.get(uid),
  } as unknown as EnricherContext;
}

function makeRaw(
  data: Record<string, string | number | boolean>,
): DecodedGameEvent {
  return {
    name: "player_disconnect",
    eventId: 2,
    data: Object.freeze(data),
  };
}

describe("enrichPlayerDisconnect", () => {
  it("happy path: player overlay still resolves; carries reason and name", () => {
    const player = { slot: 4 } as Player;
    const ctx = makeCtx({ players: new Map([[55, player]]) });
    const raw = makeRaw({
      userid: 55,
      reason: "Disconnect by user.",
      name: "Bob",
      networkid: "STEAM_1:1:9999",
    });

    const result = enrichPlayerDisconnect(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("player_disconnect");
    expect(result!.player).toBe(player);
    expect(result!.userId).toBe(55);
    expect(result!.reason).toBe("Disconnect by user.");
    expect(result!.name).toBe("Bob");
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("falls back to userInfoIndex name when overlay already gone", () => {
    const ctx = makeCtx({
      userInfoFor: new Map([
        [
          77,
          Object.freeze({
            name: "FromIndex",
            xuid: "0",
            isFakePlayer: true,
            entitySlot: 5,
          }) as UserInfo,
        ],
      ]),
    });
    const raw = makeRaw({
      userid: 77,
      reason: "Kicked by Console",
      // name missing or empty in raw — should fall back to userinfo index
      name: "",
      networkid: "BOT",
    });

    const result = enrichPlayerDisconnect(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.player).toBeUndefined();
    expect(result!.userId).toBe(77);
    expect(result!.name).toBe("FromIndex");
    expect(result!.reason).toBe("Kicked by Console");
  });

  it("never returns null — disconnect event meaningful even with no overlay or index", () => {
    const ctx = makeCtx({});
    const raw = makeRaw({
      userid: 999,
      reason: "Timed out",
      name: "Dangling",
    });

    const result = enrichPlayerDisconnect(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.player).toBeUndefined();
    expect(result!.userId).toBe(999);
    expect(result!.name).toBe("Dangling");
    expect(result!.reason).toBe("Timed out");
  });

  it("missing fields coerce to safe defaults", () => {
    const ctx = makeCtx({});
    const result = enrichPlayerDisconnect(makeRaw({}), ctx);
    expect(result).not.toBeNull();
    expect(result!.player).toBeUndefined();
    expect(result!.userId).toBe(0);
    expect(result!.name).toBe("");
    expect(result!.reason).toBe("");
  });
});
