/**
 * Integration test for the opt-in columnar `DemoResult.voice` against the
 * de_nuke fixture (a GOTV recording with `sv_voicecodec vaudio_celt`):
 *   - absent unless `collectVoice` is set
 *   - one row per non-empty `voiceData` event, payloads byte-identical
 *   - vaudio_celt geometry: 64-byte frames, 512 samples, 22050 Hz
 *   - every speaker resolves to a roster entry with a SteamID
 *   - sample clock and sequence bytes advance with the payload
 *   - columns are right-sized, transferable and structured-cloneable
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DemoParser } from "../../src/node.js";
import { NO_PLAYER, VoiceFormat, voiceBuffers, voiceFrame } from "../../src/browser.js";
import type { DemoResult, PlayerVoice } from "../../src/browser.js";
import { fixtureAvailable } from "./_fixture.js";

const FIXTURE = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe.skipIf(!fixtureAvailable)("DemoResult.voice (de_nuke)", () => {
  let plain: DemoResult;
  let result: DemoResult;
  let voice: PlayerVoice;
  const streamed: Uint8Array[] = [];

  beforeAll(async () => {
    const buffer = readFileSync(FIXTURE);
    plain = await DemoParser.parse(buffer);
    result = await DemoParser.parse(buffer, { collectVoice: true });
    voice = result.voice!;
    const parser = new DemoParser(buffer);
    parser.on("voiceData", (e) => streamed.push(e.data.slice()));
    parser.parseAll();
  });

  it("is only collected on request", () => {
    expect(plain.voice).toBeUndefined();
    expect(voice).toBeDefined();
  });

  it("keeps every voice message, byte for byte", () => {
    expect(voice.length).toBe(25471);
    expect(voice.length).toBe(streamed.length);
    expect(voice.data.length).toBe(1756928);
    for (let i = 0; i < voice.length; i += 997) {
      expect(Array.from(voiceFrame(voice, i))).toEqual(Array.from(streamed[i]!));
    }
    let expectedOffset = 0;
    for (let i = 0; i < voice.length; i++) {
      expect(voice.offset[i]).toBe(expectedOffset);
      expectedOffset += voice.size[i]!;
      if (i > 0) expect(voice.tick[i]).toBeGreaterThanOrEqual(voice.tick[i - 1]!);
    }
    expect(expectedOffset).toBe(voice.data.length);
  });

  it("describes the vaudio_celt codec", () => {
    expect(voice).toMatchObject({
      codec: "vaudio_celt",
      quality: 5,
      version: 3,
      sampleRate: 22050,
      frameSamples: 512,
      frameBytes: 64,
    });
    for (let i = 0; i < voice.length; i++) {
      expect(voice.format[i]).toBe(VoiceFormat.Engine);
      expect(voice.size[i]! % voice.frameBytes).toBe(0);
    }
  });

  it("resolves every speaker to a human on the roster", () => {
    const speakers = new Set<number>();
    for (let i = 0; i < voice.length; i++) {
      expect(voice.player[i]).not.toBe(NO_PLAYER);
      speakers.add(voice.player[i]!);
    }
    expect(speakers.size).toBeGreaterThan(1);
    for (const index of speakers) {
      const p = result.players[index]!;
      expect(p.isBot).toBe(false);
      expect(p.steamId).toMatch(/^7656119\d{10}$/);
    }
  });

  it("advances each speaker's sample clock by 512 samples per frame", () => {
    const last = new Map<number, number>();
    let exact = 0;
    let compared = 0;
    for (let i = 0; i < voice.length; i++) {
      const p = voice.player[i]!;
      const prev = last.get(p);
      if (prev !== undefined && voice.sectionNumber[prev] === voice.sectionNumber[i]) {
        compared++;
        const frames = voice.size[prev]! / voice.frameBytes;
        const step = voice.sampleOffset[i]! - voice.sampleOffset[prev]!;
        const bytes = voice.sequenceBytes[i]! - voice.sequenceBytes[prev]!;
        expect(step).toBeGreaterThanOrEqual(frames * voice.frameSamples);
        expect(bytes).toBeGreaterThanOrEqual(voice.size[i]!);
        if (step === frames * voice.frameSamples && bytes === voice.size[i]) exact++;
      }
      last.set(p, i);
    }
    // Almost every message follows the previous one with no lost frames.
    expect(exact).toBeGreaterThan(compared * 0.99);
  });

  it("has right-sized, independently transferable columns", () => {
    const buffers = voiceBuffers(voice);
    expect(new Set(buffers).size).toBe(buffers.length);
    for (const c of [voice.tick, voice.player, voice.flags, voice.offset, voice.sampleOffset]) {
      expect(c.length).toBe(voice.length);
      expect(c.byteLength).toBe(c.buffer.byteLength);
    }
    expect(voice.data.byteLength).toBe(voice.data.buffer.byteLength);
    const clone = structuredClone(voice);
    expect(clone.data.length).toBe(voice.data.length);
  });

  it("does not change anything else in the result", () => {
    expect(result.kills.length).toBe(plain.kills.length);
    expect(result.rounds).toEqual(plain.rounds);
    expect(result.shots.length).toBe(plain.shots.length);
  });
});
