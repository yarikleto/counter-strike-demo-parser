import { describe, expect, it } from "vitest";
import { enrichPlayerBlind } from "../../../../src/events/enrichers/playerBlind.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { Player } from "../../../../src/state/Player.js";

function makeCtx(players: Map<number, Player>): EnricherContext {
  return {
    players: [...players.values()],
    entities: undefined,
    gameRules: undefined,
    teams: [],
    userInfoIndex: undefined,
    resolvePlayer: (uid: number) => players.get(uid),
  } as unknown as EnricherContext;
}

function makeRaw(
  data: Record<string, string | number | boolean>,
): DecodedGameEvent {
  return {
    name: "player_blind",
    eventId: 19,
    data: Object.freeze(data),
  };
}

describe("enrichPlayerBlind", () => {
  it("happy path: resolves player and attacker, surfaces blindDuration", () => {
    const player = { slot: 2 } as Player;
    const attacker = { slot: 1 } as Player;
    const ctx = makeCtx(
      new Map([
        [11, attacker],
        [22, player],
      ]),
    );

    const result = enrichPlayerBlind(
      makeRaw({
        userid: 22,
        attacker: 11,
        entityid: 100,
        blind_duration: 2.75,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("player_blind");
    expect(result!.player).toBe(player);
    expect(result!.attacker).toBe(attacker);
    expect(result!.blindDuration).toBe(2.75);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("self-blind: player === attacker (flashed by own grenade)", () => {
    const player = { slot: 5 } as Player;
    const ctx = makeCtx(new Map([[55, player]]));

    const result = enrichPlayerBlind(
      makeRaw({
        userid: 55,
        attacker: 55,
        entityid: 0,
        blind_duration: 1.5,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.player).toBe(player);
    expect(result!.attacker).toBe(player);
  });

  it("returns null when player doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichPlayerBlind(
      makeRaw({
        userid: 999,
        attacker: 0,
        entityid: 0,
        blind_duration: 1,
      }),
      ctx,
    );
    expect(result).toBeNull();
  });
});
