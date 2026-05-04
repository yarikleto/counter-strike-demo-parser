/**
 * Compile-time type-shape test for DemoResult and ParseOptions.
 *
 * There is no runtime behaviour to exercise here — the interfaces are
 * pure types. We use the `satisfies` operator to verify that a hand-built
 * object matches the expected shape. If any field is missing, has the wrong
 * type, or the imports break, this file will fail to compile and the test
 * suite will catch it.
 */

import { describe, it, expect } from "vitest";
import type { DemoResult, ParseOptions } from "../../../src/convenience/DemoResult.js";
import type { DemoHeader } from "../../../src/frame/header.js";
import type { PlayerSnapshot } from "../../../src/state/Player.js";
import type { PlayerDeathEvent } from "../../../src/events/enrichers/playerDeath.js";
import type { RoundEndEvent } from "../../../src/events/enrichers/roundEnd.js";
import type { GrenadeThrownEvent } from "../../../src/events/enrichers/grenadeThrown.js";
import type { ChatMessage } from "../../../src/events/UserMessageDecoder.js";
import type { DecodedGameEvent } from "../../../src/events/GameEventDecoder.js";

describe("DemoResult types", () => {
  it("DemoResult shape is compile-checkable via satisfies", () => {
    // Minimal stubs — real values not needed; the goal is compile-time shape verification.
    const stubHeader = {} as DemoHeader;
    const stubPlayers: PlayerSnapshot[] = [];
    const stubKills: PlayerDeathEvent[] = [];
    const stubRounds: RoundEndEvent[] = [];
    const stubGrenades: GrenadeThrownEvent[] = [];
    const stubChatMessages: ChatMessage[] = [];
    const stubEvents: DecodedGameEvent[] = [];

    // `satisfies` ensures the object literal matches DemoResult without widening.
    const result = {
      header: stubHeader,
      players: stubPlayers,
      kills: stubKills,
      rounds: stubRounds,
      grenades: stubGrenades,
      chatMessages: stubChatMessages,
      events: stubEvents,
    } satisfies DemoResult;

    // Trivial runtime assertion so vitest counts this as a passing test.
    expect(result).toBeDefined();
  });

  it("DemoResult without events also satisfies the type", () => {
    const stubHeader = {} as DemoHeader;

    const result = {
      header: stubHeader,
      players: [] as PlayerSnapshot[],
      kills: [] as PlayerDeathEvent[],
      rounds: [] as RoundEndEvent[],
      grenades: [] as GrenadeThrownEvent[],
      chatMessages: [] as ChatMessage[],
    } satisfies DemoResult;

    expect(result).toBeDefined();
  });

  it("ParseOptions shape is compile-checkable", () => {
    const opts: ParseOptions = { includeRawEvents: true };
    expect(opts.includeRawEvents).toBe(true);

    const optsDefault: ParseOptions = {};
    expect(optsDefault.includeRawEvents).toBeUndefined();
  });
});
