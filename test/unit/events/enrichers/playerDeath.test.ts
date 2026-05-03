import { describe, expect, it } from "vitest";
import { enrichPlayerDeath } from "../../../../src/events/enrichers/playerDeath.js";
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
    name: "player_death",
    eventId: 17,
    data: Object.freeze(data),
  };
}

describe("enrichPlayerDeath", () => {
  it("happy path: resolves attacker, victim, assister and surfaces every field", () => {
    const attacker = { slot: 1 } as Player;
    const victim = { slot: 2 } as Player;
    const assister = { slot: 3 } as Player;
    const ctx = makeCtx(
      new Map([
        [11, attacker],
        [22, victim],
        [33, assister],
      ]),
    );

    const result = enrichPlayerDeath(
      makeRaw({
        userid: 22,
        attacker: 11,
        assister: 33,
        weapon: "ak47",
        headshot: true,
        penetrated: 1,
        noscope: false,
        thrusmoke: true,
        attackerblind: false,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("player_death");
    expect(result!.eventId).toBe(17);
    expect(result!.attacker).toBe(attacker);
    expect(result!.victim).toBe(victim);
    expect(result!.assister).toBe(assister);
    expect(result!.weapon).toBe("ak47");
    expect(result!.headshot).toBe(true);
    expect(result!.penetrated).toBe(true);
    expect(result!.noscope).toBe(false);
    expect(result!.thrusmoke).toBe(true);
    expect(result!.attackerblind).toBe(false);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("world damage: attacker userid 0 surfaces as undefined, victim still resolves", () => {
    const victim = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[22, victim]]));

    const result = enrichPlayerDeath(
      makeRaw({
        userid: 22,
        attacker: 0,
        assister: 0,
        weapon: "world",
        headshot: false,
        penetrated: 0,
        noscope: false,
        thrusmoke: false,
        attackerblind: false,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.attacker).toBeUndefined();
    expect(result!.assister).toBeUndefined();
    expect(result!.victim).toBe(victim);
  });

  it("suicide: attacker === victim points to the same Player", () => {
    const player = { slot: 5 } as Player;
    const ctx = makeCtx(new Map([[55, player]]));

    const result = enrichPlayerDeath(
      makeRaw({
        userid: 55,
        attacker: 55,
        assister: 0,
        weapon: "world",
        headshot: false,
        penetrated: 0,
        noscope: false,
        thrusmoke: false,
        attackerblind: false,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.attacker).toBe(player);
    expect(result!.victim).toBe(player);
    expect(result!.attacker).toBe(result!.victim);
  });

  it("returns null when victim doesn't resolve", () => {
    const ctx = makeCtx(new Map());

    const result = enrichPlayerDeath(
      makeRaw({
        userid: 999,
        attacker: 0,
        assister: 0,
        weapon: "ak47",
        headshot: false,
        penetrated: 0,
        noscope: false,
        thrusmoke: false,
        attackerblind: false,
      }),
      ctx,
    );

    expect(result).toBeNull();
  });
});
