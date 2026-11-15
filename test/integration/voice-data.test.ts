/**
 * Integration test for the `voiceInit` / `voiceData` streaming events on the
 * de_nuke fixture. The fixture is a GOTV recording made with
 * `sv_voicecodec vaudio_celt` and carries voice from its players: every
 * `CSVCMsg_VoiceData` uses the engine format (1) with one or more 64-byte
 * CELT frames, and carries the speaker's slot, SteamID64 and the
 * per-speaker sequence fields a decoder needs.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DemoParser } from "../../src/node.js";
import type { ParserEventMap } from "../../src/events/ParserEventMap.js";
import { fixtureAvailable } from "./_fixture.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

type VoiceEvent = ParserEventMap["voiceData"];

describe.skipIf(!fixtureAvailable)("voiceInit / voiceData events — de_nuke.dem", () => {
  const inits: ParserEventMap["voiceInit"][] = [];
  const events: (Omit<VoiceEvent, "data" | "player"> & { size: number; hasPlayer: boolean })[] = [];

  beforeAll(() => {
    const parser = new DemoParser(readFileSync(FIXTURE));
    parser.on("voiceInit", (e) => inits.push(e));
    parser.on("voiceData", (e) => {
      const { data, player, ...rest } = e;
      events.push({ ...rest, size: data.length, hasPlayer: player !== undefined });
    });
    parser.parseAll();
  });

  it("announces the vaudio_celt codec once, during signon", () => {
    expect(inits).toHaveLength(1);
    expect(inits[0]).toMatchObject({ codec: "vaudio_celt", quality: 5, version: 3 });
  });

  it("emits every voice message with engine-format 64-byte CELT frames", () => {
    expect(events.length).toBe(25471);
    for (const e of events) {
      expect(Number.isFinite(e.tick)).toBe(true);
      expect(e.format).toBe(1);
      expect(e.size % 64).toBe(0);
      expect(e.size).toBeGreaterThan(0);
      expect(e.proximity === 0 || e.proximity === 1).toBe(true);
      expect(e.caster === 0 || e.caster === 1).toBe(true);
    }
  });

  it("identifies the speaker by slot and SteamID64", () => {
    for (const e of events) {
      expect(e.client).toBeGreaterThanOrEqual(0);
      expect(e.xuid).toMatch(/^7656119\d{10}$/);
    }
    expect(events.filter((e) => e.hasPlayer).length).toBeGreaterThan(events.length * 0.9);
  });

  it("carries per-speaker sequence fields that advance with the payload", () => {
    const last = new Map<string, (typeof events)[number]>();
    let checked = 0;
    for (const e of events) {
      const prev = last.get(e.xuid);
      if (prev !== undefined && prev.sectionNumber === e.sectionNumber) {
        // sequenceBytes is the running byte count of the section (end of
        // this message); the sample offset advances 512 samples per frame.
        expect(e.sequenceBytes - prev.sequenceBytes).toBeGreaterThanOrEqual(e.size);
        expect(e.uncompressedSampleOffset - prev.uncompressedSampleOffset).toBeGreaterThanOrEqual(
          (prev.size / 64) * 512,
        );
        checked++;
      }
      last.set(e.xuid, e);
    }
    expect(checked).toBeGreaterThan(events.length * 0.9);
  });
});
