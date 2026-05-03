import { describe, expect, it } from "vitest";
import { enrichPlayerHurt } from "../../../../src/events/enrichers/playerHurt.js";
import { HitGroup } from "../../../../src/enums/HitGroup.js";
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
    name: "player_hurt",
    eventId: 23,
    data: Object.freeze(data),
  };
}

describe("enrichPlayerHurt", () => {
  it("happy path: every key resolves and hitGroup is the typed enum", () => {
    const attacker = { slot: 1 } as Player;
    const victim = { slot: 2 } as Player;
    const ctx = makeCtx(
      new Map([
        [11, attacker],
        [22, victim],
      ]),
    );

    const result = enrichPlayerHurt(
      makeRaw({
        userid: 22,
        attacker: 11,
        weapon: "ak47",
        dmg_health: 27,
        dmg_armor: 4,
        hitgroup: HitGroup.Chest,
        health: 73,
        armor: 96,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("player_hurt");
    expect(result!.attacker).toBe(attacker);
    expect(result!.victim).toBe(victim);
    expect(result!.weapon).toBe("ak47");
    expect(result!.damage).toBe(27);
    expect(result!.damageArmor).toBe(4);
    expect(result!.hitGroup).toBe(HitGroup.Chest);
    expect(result!.healthRemaining).toBe(73);
    expect(result!.armorRemaining).toBe(96);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("attacker unresolved: attacker is undefined, victim still resolves", () => {
    const victim = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[22, victim]]));

    const result = enrichPlayerHurt(
      makeRaw({
        userid: 22,
        attacker: 0,
        weapon: "world",
        dmg_health: 5,
        dmg_armor: 0,
        hitgroup: HitGroup.Generic,
        health: 95,
        armor: 100,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.attacker).toBeUndefined();
    expect(result!.victim).toBe(victim);
  });

  it("unknown hitgroup integer surfaces as raw number", () => {
    const victim = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[22, victim]]));

    const result = enrichPlayerHurt(
      makeRaw({
        userid: 22,
        attacker: 0,
        weapon: "ak47",
        dmg_health: 1,
        dmg_armor: 0,
        hitgroup: 99, // not a known HitGroup
        health: 99,
        armor: 100,
      }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.hitGroup).toBe(99);
  });

  it("returns null when victim doesn't resolve", () => {
    const ctx = makeCtx(new Map());
    const result = enrichPlayerHurt(
      makeRaw({
        userid: 999,
        attacker: 0,
        weapon: "ak47",
        dmg_health: 1,
        dmg_armor: 0,
        hitgroup: 0,
        health: 0,
        armor: 0,
      }),
      ctx,
    );
    expect(result).toBeNull();
  });
});
