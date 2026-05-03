import { describe, expect, it } from "vitest";
import { enrichWeaponZoom } from "../../../../src/events/enrichers/weaponZoom.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { Player } from "../../../../src/state/Player.js";

// `weapon_zoom` descriptor: { userid: short }. Like `weapon_reload`, the
// Tier-1 enricher resolves the userid and emits a frozen payload.
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
    name: "weapon_zoom",
    eventId: 33,
    data: Object.freeze(data),
  };
}

describe("enrichWeaponZoom", () => {
  it("returns the typed event when the player resolves", () => {
    const player = { slot: 3 } as Player;
    const ctx = makeCtx((uid) => (uid === 42 ? player : undefined));
    const raw = makeRaw({ userid: 42 });

    const result = enrichWeaponZoom(raw, ctx);

    expect(result).not.toBeNull();
    expect(result!.player).toBe(player);
    expect(result!.eventName).toBe("weapon_zoom");
    expect(result!.eventId).toBe(33);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns null when the player does not resolve", () => {
    const ctx = makeCtx(() => undefined);
    const raw = makeRaw({ userid: 999 });

    expect(enrichWeaponZoom(raw, ctx)).toBeNull();
  });
});
