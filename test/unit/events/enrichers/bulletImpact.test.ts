import { describe, expect, it } from "vitest";
import { enrichBulletImpact } from "../../../../src/events/enrichers/bulletImpact.js";
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
    name: "bullet_impact",
    eventId: 90,
    data: Object.freeze(data),
  };
}

describe("enrichBulletImpact", () => {
  it("happy path: resolves player and frozen position", () => {
    const player = { slot: 2 } as Player;
    const ctx = makeCtx(new Map([[22, player]]));

    const result = enrichBulletImpact(
      makeRaw({ userid: 22, x: 100.5, y: -200.25, z: 64 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("bullet_impact");
    expect(result!.player).toBe(player);
    expect(result!.position).toEqual({ x: 100.5, y: -200.25, z: 64 });
    expect(Object.isFrozen(result!)).toBe(true);
    expect(Object.isFrozen(result!.position)).toBe(true);
  });

  it("player unresolved: still emits with player undefined", () => {
    const ctx = makeCtx(new Map());

    const result = enrichBulletImpact(
      makeRaw({ userid: 0, x: 1, y: 2, z: 3 }),
      ctx,
    );

    expect(result).not.toBeNull();
    expect(result!.player).toBeUndefined();
    expect(result!.position).toEqual({ x: 1, y: 2, z: 3 });
  });
});
