/**
 * Unit tests for `VoiceRecorder` — the columnar `DemoResult.voice` — and
 * the roster's speaker resolution. Driven by a fake parser emitting
 * `voiceInit` / `voiceData` events.
 */
import { describe, it, expect } from "vitest";
import { TypedEventEmitter } from "../../../src/events/TypedEventEmitter.js";
import {
  VoiceRecorder,
  VoiceFlags,
  voiceBuffers,
  voiceFrame,
} from "../../../src/convenience/VoiceRecorder.js";
import { NO_PLAYER } from "../../../src/convenience/HitRecorder.js";
import { PlayerRoster } from "../../../src/convenience/PlayerRoster.js";
import type { ParserEventMap } from "../../../src/events/ParserEventMap.js";
import type { DemoParser } from "../../../src/DemoParser.js";

interface FakeUser {
  userId: number;
  slot: number; // zero-based userinfo / client slot
  xuid: string;
  name: string;
}

function setup(initialUsers: FakeUser[]) {
  let users = initialUsers;
  const emitter = new TypedEventEmitter<ParserEventMap>();
  const parser = Object.assign(emitter, {
    players: [],
    userInfoIndex: {
      entitySlotForUserId: (userId: number) => users.find((u) => u.userId === userId)?.slot,
      userIdForEntitySlot: (slot: number) => users.find((u) => u.slot === slot)?.userId,
      userIdForXuid: (xuid: string) => users.find((u) => u.xuid === xuid)?.userId,
      infoForUserId: (userId: number) => {
        const u = users.find((x) => x.userId === userId);
        return u && { name: u.name, xuid: u.xuid, isFakePlayer: false, entitySlot: u.slot };
      },
    },
  }) as unknown as DemoParser;
  const voice = new VoiceRecorder(2, 4); // tiny capacities: exercise growth
  voice.attach(parser);
  return {
    emitter,
    voice,
    roster: PlayerRoster.for(parser),
    setUsers: (next: FakeUser[]) => (users = next),
  };
}

function speak(
  emitter: TypedEventEmitter<ParserEventMap>,
  fields: Partial<ParserEventMap["voiceData"]> & { data: Uint8Array },
) {
  emitter.emit("voiceData", {
    tick: 0,
    player: undefined,
    format: 1,
    proximity: 0,
    client: -1,
    xuid: "0",
    caster: 0,
    audibleMask: 3,
    sequenceBytes: 0,
    sectionNumber: 0,
    uncompressedSampleOffset: 0,
    ...fields,
  });
}

const ALICE: FakeUser = { userId: 11, slot: 0, xuid: "76561198000000011", name: "alice" };
const BOB: FakeUser = { userId: 12, slot: 1, xuid: "76561198000000012", name: "bob" };

function bytes(fill: number, length: number): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

describe("VoiceRecorder", () => {
  it("is empty with no codec before any voice message", () => {
    const { voice } = setup([]);
    const v = voice.snapshot();
    expect(v.length).toBe(0);
    expect(v.codec).toBe("");
    expect(v.sampleRate).toBe(0);
    expect(v.data.length).toBe(0);
    expect(v.offset.length).toBe(0);
  });

  it("reports the vaudio_celt codec and its frame geometry", () => {
    const { emitter, voice } = setup([]);
    emitter.emit("voiceInit", { tick: -5, codec: "vaudio_celt", quality: 5, version: 3 });
    const v = voice.snapshot();
    expect(v).toMatchObject({
      codec: "vaudio_celt",
      quality: 5,
      version: 3,
      sampleRate: 22050,
      frameSamples: 512,
      frameBytes: 64,
    });
  });

  it("leaves the frame geometry at 0 for codecs it does not know", () => {
    const { emitter, voice } = setup([]);
    emitter.emit("voiceInit", { tick: 0, codec: "vaudio_speex", quality: 4, version: 0 });
    const v = voice.snapshot();
    expect(v.codec).toBe("vaudio_speex");
    expect([v.sampleRate, v.frameSamples, v.frameBytes]).toEqual([0, 0, 0]);
  });

  it("packs every message into columns and one concatenated byte array", () => {
    const { emitter, voice } = setup([ALICE, BOB]);
    speak(emitter, {
      tick: 100,
      client: 0,
      xuid: ALICE.xuid,
      data: bytes(1, 64),
      sequenceBytes: 64,
      sectionNumber: 7,
      uncompressedSampleOffset: 1000,
    });
    speak(emitter, {
      tick: 100,
      client: 1,
      xuid: BOB.xuid,
      data: bytes(2, 128),
      proximity: 1,
      sequenceBytes: 128,
      sectionNumber: 3,
      uncompressedSampleOffset: 4_000_000_000,
    });
    speak(emitter, {
      tick: 104,
      client: 0,
      xuid: ALICE.xuid,
      data: bytes(3, 192),
      caster: 1,
      format: 0,
      sequenceBytes: 256,
      sectionNumber: 7,
      uncompressedSampleOffset: 1512,
    });

    const v = voice.snapshot();
    expect(v.length).toBe(3);
    expect(Array.from(v.tick)).toEqual([100, 100, 104]);
    expect(Array.from(v.player)).toEqual([0, 1, 0]);
    expect(Array.from(v.format)).toEqual([1, 1, 0]);
    expect(Array.from(v.flags)).toEqual([0, VoiceFlags.Proximity, VoiceFlags.Caster]);
    expect(Array.from(v.sectionNumber)).toEqual([7, 3, 7]);
    expect(Array.from(v.sequenceBytes)).toEqual([64, 128, 256]);
    expect(Array.from(v.sampleOffset)).toEqual([1000, 4_000_000_000, 1512]);
    expect(Array.from(v.offset)).toEqual([0, 64, 192]);
    expect(Array.from(v.size)).toEqual([64, 128, 192]);
    expect(v.data.length).toBe(384);
    expect(Array.from(voiceFrame(v, 1))).toEqual(Array.from(bytes(2, 128)));
    expect(Array.from(voiceFrame(v, 2))).toEqual(Array.from(bytes(3, 192)));
  });

  it("copies the payload, so the parser may reuse its buffer", () => {
    const { emitter, voice } = setup([ALICE]);
    const payload = bytes(9, 64);
    speak(emitter, { client: 0, xuid: ALICE.xuid, data: payload });
    payload.fill(0);
    expect(voiceFrame(voice.snapshot(), 0)[0]).toBe(9);
  });

  it("keeps a reconnected speaker on the same roster index", () => {
    const { emitter, voice, setUsers, roster } = setup([ALICE, BOB]);
    speak(emitter, { client: 0, xuid: ALICE.xuid, data: bytes(1, 64) });
    // Alice drops and reconnects into slot 5 with a new user id.
    setUsers([BOB, { ...ALICE, userId: 31, slot: 5 }]);
    speak(emitter, { client: 5, xuid: ALICE.xuid, data: bytes(1, 64) });
    speak(emitter, { client: 1, xuid: BOB.xuid, data: bytes(1, 64) });
    const v = voice.snapshot();
    expect(Array.from(v.player)).toEqual([0, 0, 1]);
    expect(roster.snapshot().map((p) => p.name)).toEqual(["alice", "bob"]);
  });

  it("trusts the SteamID over a stale slot", () => {
    const { emitter, voice, setUsers } = setup([ALICE, BOB]);
    speak(emitter, { client: 1, xuid: BOB.xuid, data: bytes(1, 64) });
    // Bob left; Alice now holds slot 1, but a late packet still names Bob.
    setUsers([{ ...ALICE, slot: 1 }]);
    speak(emitter, { client: 1, xuid: BOB.xuid, data: bytes(1, 64) });
    // A speaker the roster has never seen, found through the userinfo table.
    setUsers([
      { ...ALICE, slot: 1 },
      { ...BOB, userId: 40, slot: 7 },
    ]);
    speak(emitter, { client: 3, xuid: ALICE.xuid, data: bytes(1, 64) });
    const v = voice.snapshot();
    expect(Array.from(v.player)).toEqual([0, 0, 1]);
  });

  it("marks speakers it cannot resolve with NO_PLAYER", () => {
    const { emitter, voice } = setup([ALICE]);
    speak(emitter, { client: 9, xuid: "0", data: bytes(1, 64) });
    speak(emitter, { client: -1, xuid: "76561198000000099", data: bytes(1, 64) });
    expect(Array.from(voice.snapshot().player)).toEqual([NO_PLAYER, NO_PLAYER]);
  });

  it("returns right-sized, independently transferable columns", () => {
    const { emitter, voice } = setup([ALICE]);
    for (let i = 0; i < 5; i++) speak(emitter, { client: 0, xuid: ALICE.xuid, data: bytes(i, 64) });
    const v = voice.snapshot();
    const buffers = voiceBuffers(v);
    expect(new Set(buffers).size).toBe(buffers.length);
    expect(buffers).toContain(v.data.buffer);
    for (const c of [v.tick, v.player, v.format, v.flags, v.offset, v.size, v.sampleOffset]) {
      expect(c.length).toBe(5);
      expect(c.byteLength).toBe(c.buffer.byteLength);
    }
    expect(v.data.byteLength).toBe(v.data.buffer.byteLength);
    expect(v.data.length).toBe(320);
  });
});
