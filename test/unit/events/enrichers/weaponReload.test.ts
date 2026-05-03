import { describe, expect, it } from "vitest";
import { enrichWeaponReload } from "../../../../src/events/enrichers/weaponReload.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { Player } from "../../../../src/state/Player.js";

// `weapon_reload` descriptor: { userid: short }. The Tier-1 enricher
// resolves the userid to a `Player` and surfaces it as the only field
// beyond the inherited eventName/eventId.
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
    name: "weapon_reload",
    eventId: 32,
    data: Object.freeze(data),
  };
}

describe("enrichWeaponReload", () => {
  it("returns the typed event when the player resolves", () => {
    const player = { slot: 9 } as Player;
    const ctx = makeCtx((uid) => (uid === 42 ? player : undefined));
    const raw = makeRaw({ userid: 42 });

    const result = enrichWeaponReload(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.player).toBe(player);
    expect(result!.eventName).toBe("weapon_reload");
    expect(result!.eventId).toBe(32);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns null when the player does not resolve", () => {
    const ctx = makeCtx(() => undefined);
    const raw = makeRaw({ userid: 999 });

    expect(enrichWeaponReload(raw, ctx)).toBeNull();
  });
});
