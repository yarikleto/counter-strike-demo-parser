/**
 * Compile-time type-shape test for DemoResult and ParseOptions.
 *
 * The interfaces are pure types. We use the `satisfies` operator to verify
 * that a hand-built object matches the expected shape; if a field is
 * missing, has the wrong type, or the imports break, this file fails to
 * compile and the test suite catches it. Runtime plain-data guarantees
 * (structuredClone / JSON) are checked in test/integration/parse-api.test.ts.
 */

import { describe, it, expect } from "vitest";
import type { DemoResult, ParseOptions } from "../../../src/convenience/DemoResult.js";
import type { RoundSummary } from "../../../src/convenience/RoundTracker.js";
import type { DemoHeader } from "../../../src/frame/header.js";
import type { PlayerInfo } from "../../../src/convenience/PlayerRoster.js";
import type {
  BombRecord,
  ChatRecord,
  DamageRecord,
  GrenadeEffect,
  GrenadeThrow,
  HostageRecord,
  KillRecord,
} from "../../../src/convenience/records.js";
import type { DecodedGameEvent } from "../../../src/events/GameEventDecoder.js";
import type { GrenadeTrajectory } from "../../../src/convenience/GrenadeTrajectoryTracker.js";
import type { PlayerPositions } from "../../../src/convenience/PositionRecorder.js";

function baseResult() {
  return {
    header: {} as DemoHeader,
    tickRate: 128,
    players: [] as PlayerInfo[],
    kills: [] as KillRecord[],
    rounds: [] as RoundSummary[],
    bomb: [] as BombRecord[],
    grenades: [] as GrenadeThrow[],
    grenadeTrajectories: [] as GrenadeTrajectory[],
    grenadeEffects: [] as GrenadeEffect[],
    hostageEvents: [] as HostageRecord[],
    damage: [] as DamageRecord[],
    chatMessages: [] as ChatRecord[],
  };
}

describe("DemoResult types", () => {
  it("DemoResult shape is compile-checkable via satisfies", () => {
    const result = {
      ...baseResult(),
      events: [] as DecodedGameEvent[],
      positions: {} as PlayerPositions,
    } satisfies DemoResult;
    expect(result).toBeDefined();
  });

  it("events and positions are optional", () => {
    const result = baseResult() satisfies DemoResult;
    expect((result as DemoResult).positions).toBeUndefined();
  });

  it("ParseOptions accepts every documented field", () => {
    const controller = new AbortController();
    const opts = {
      includeRawEvents: true,
      collectPlayerPositions: true,
      positionSampleRateTicks: 8,
      onProgress: (p) => void p.fraction,
      signal: controller.signal,
      yieldIntervalMs: 25,
    } satisfies ParseOptions;
    expect(opts.positionSampleRateTicks).toBe(8);
  });

  it("ParseOptions is all-optional", () => {
    const empty = {} satisfies ParseOptions;
    expect(empty).toEqual({});
  });
});
