import { describe, expect, it } from "vitest";
import { enrichBombExploded } from "../../../../src/events/enrichers/bombExploded.js";
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
    name: "bomb_exploded",
    eventId: 110,
    data: Object.freeze(data),
  };
}

describe("enrichBombExploded", () => {
  it("happy path: surfaces site without resolving any player, never returns null", () => {
    const result = enrichBombExploded(
      makeRaw({ userid: 109, site: 425 }),
      makeCtx(),
    );

    expect(result).not.toBeNull();
    expect(result!.eventName).toBe("bomb_exploded");
    expect(result!.eventId).toBe(110);
    expect(result!.site).toBe(425);
    expect(Object.isFrozen(result!)).toBe(true);
  });

  it("missing site coerces to 0 (defensive default), still emits", () => {
    const result = enrichBombExploded(makeRaw({}), makeCtx());

    expect(result).not.toBeNull();
    expect(result!.site).toBe(0);
  });
});
