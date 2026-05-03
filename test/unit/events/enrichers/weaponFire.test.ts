import { describe, expect, it } from "vitest";
import { enrichWeaponFire } from "../../../../src/events/enrichers/weaponFire.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { Player } from "../../../../src/state/Player.js";

// `weapon_fire` descriptor (verified from de_nuke decode in
// test/integration/game-event.test.ts): { userid: short, weapon: string,
// silenced: bool }. Tier-1 enricher resolves userid -> Player via the stub
// context and surfaces the wire-level `silenced` and `weapon` directly.
function makeCtx(resolvePlayer: (uid: number) => Player | undefined): EnricherContext {
  return {
    players: [],
    entities: undefined,
    gameRules: undefined,
    teams: [],
    userInfoIndex: {
      entitySlotForUserId: () => undefined,
      infoForUserId: () => undefined,
      userIdForEntitySlot: () => undefined,
      refresh: () => undefined,
    },
    resolvePlayer,
  } as unknown as EnricherContext;
}

function makeRaw(data: Record<string, string | number | boolean>): DecodedGameEvent {
  return {
    name: "weapon_fire",
    eventId: 31,
    data: Object.freeze(data),
  };
}

describe("enrichWeaponFire", () => {
  it("returns the typed event when player resolves (silenced=true)", () => {
    const player = { slot: 5 } as Player;
    const ctx = makeCtx((uid) => (uid === 42 ? player : undefined));
    const raw = makeRaw({ userid: 42, weapon: "weapon_awp", silenced: true });

    const result = enrichWeaponFire(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.player).toBe(player);
    expect(result!.weapon).toBe("weapon_awp");
    expect(result!.silenced).toBe(true);
    expect(result!.eventName).toBe("weapon_fire");
    expect(result!.eventId).toBe(31);
    // Frozen payload (ADR-006 decision 8).
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("defaults silenced to false when the wire payload omits it", () => {
    const player = { slot: 1 } as Player;
    const ctx = makeCtx(() => player);
    const raw = makeRaw({ userid: 7, weapon: "weapon_ak47" });

    const result = enrichWeaponFire(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.silenced).toBe(false);
  });

  it("returns null when the player does not resolve", () => {
    const ctx = makeCtx(() => undefined);
    const raw = makeRaw({ userid: 999, weapon: "weapon_glock", silenced: false });

    expect(enrichWeaponFire(raw, ctx)).toBeNull();
  });
});
