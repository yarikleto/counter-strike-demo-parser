import { describe, expect, it } from "vitest";
import {
  enrichAnnouncePhaseEnd,
  type AnnouncePhaseEndEvent,
} from "../../../../src/events/enrichers/announcePhaseEnd.js";
import type { DecodedGameEvent } from "../../../../src/events/GameEventDecoder.js";
import type { EnricherContext } from "../../../../src/events/EnricherContext.js";

function makeCtx(): EnricherContext {
  return {
    players: [],
    teams: [],
    gameRules: undefined,
    entities: undefined,
    userInfoIndex: {} as EnricherContext["userInfoIndex"],
    resolvePlayer: () => undefined,
  } as unknown as EnricherContext;
}

function makeRaw(): DecodedGameEvent {
  return {
    name: "announce_phase_end",
    eventId: 75,
    data: Object.freeze({}),
  };
}

describe("enrichAnnouncePhaseEnd", () => {
  it("emits frozen no-payload event with eventName/eventId carried over", () => {
    const result = enrichAnnouncePhaseEnd(
      makeRaw(),
      makeCtx(),
    ) as Readonly<AnnouncePhaseEndEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("announce_phase_end");
    expect(result.eventId).toBe(75);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
