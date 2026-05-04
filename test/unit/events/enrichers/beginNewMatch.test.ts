import { describe, expect, it } from "vitest";
import {
  enrichBeginNewMatch,
  type BeginNewMatchEvent,
} from "../../../../src/events/enrichers/beginNewMatch.js";
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
    name: "begin_new_match",
    eventId: 41,
    data: Object.freeze({}),
  };
}

describe("enrichBeginNewMatch", () => {
  it("emits frozen no-payload event with eventName/eventId carried over", () => {
    const result = enrichBeginNewMatch(makeRaw(), makeCtx()) as Readonly<BeginNewMatchEvent>;

    expect(result).not.toBeNull();
    expect(result.eventName).toBe("begin_new_match");
    expect(result.eventId).toBe(41);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
