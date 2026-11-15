/**
 * VoiceRecorder — every `CSVCMsg_VoiceData` message as one columnar row
 * plus one concatenated byte array, for playing players' voice in sync with
 * a replay and showing who is speaking.
 *
 * Row `i` is one voice message, in wire order (ticks never decrease); its
 * payload is `data.subarray(offset[i], offset[i] + size[i])`
 * ({@link voiceFrame}). `player[i]` indexes `DemoResult.players`, or is
 * `NO_PLAYER` (0xffff) when the speaker could not be resolved.
 *
 * Nothing is decoded. Engine-format payloads (`format` 1, the CS:GO
 * default) are whole frames of the codec named by `codec`; for
 * `vaudio_celt` that is 64-byte CELT frames of 512 samples at 22050 Hz with
 * no header — see the README's "Voice" section for how to decode them.
 */
import type { DemoParser } from "../DemoParser.js";
import type { ParserEventMap } from "../events/ParserEventMap.js";
import { PlayerRoster } from "./PlayerRoster.js";
import { ColumnTable } from "./columns.js";
import { NO_PLAYER } from "./HitRecorder.js";

/** Bits of {@link PlayerVoice.flags}. */
export const VoiceFlags = {
  /** The message's `proximity` field (proximity chat). */
  Proximity: 1,
  /** The message's `caster` field (a GOTV caster speaking). */
  Caster: 2,
} as const;

/** Values of {@link PlayerVoice.format} (`VoiceDataFormat_t`). */
export const VoiceFormat = {
  /** Steam voice packets (`ISteamUser::GetVoice`), not used by CS:GO servers. */
  Steam: 0,
  /** Raw frames of the engine codec announced in `codec` (CS:GO default). */
  Engine: 1,
} as const;

/**
 * Columnar voice messages. Every typed array except `data` has exactly
 * `length` elements.
 */
export interface PlayerVoice {
  /** Number of messages (rows). */
  readonly length: number;
  /** Codec from the server's `svc_VoiceInit` (`"vaudio_celt"` on CS:GO); `""` if none. */
  readonly codec: string;
  /** `svc_VoiceInit` quality (5 for CS:GO's `vaudio_celt`). */
  readonly quality: number;
  /** `svc_VoiceInit` version (3 for CS:GO's `vaudio_celt`). */
  readonly version: number;
  /**
   * Decoder parameters of engine-format payloads, derived from `codec`
   * (22050 / 512 / 64 for `vaudio_celt`); 0 when the codec is unknown.
   */
  readonly sampleRate: number;
  /** Samples per decoded frame. */
  readonly frameSamples: number;
  /** Bytes per encoded frame; a payload holds `size[i] / frameBytes` frames. */
  readonly frameBytes: number;
  /** Frame tick the message arrived at (`DemoParser.currentTick`). */
  readonly tick: Int32Array;
  /** Speaker: index into `DemoResult.players`, or `NO_PLAYER` (0xffff). */
  readonly player: Uint16Array;
  /** {@link VoiceFormat} value. */
  readonly format: Uint8Array;
  /** {@link VoiceFlags} bits. */
  readonly flags: Uint8Array;
  /** Talk-section number; increases by one per push-to-talk burst of a speaker. */
  readonly sectionNumber: Uint32Array;
  /**
   * Bytes the speaker has sent in this section, including this message.
   * When it grows by more than `size[i]`, packets were lost in between.
   */
  readonly sequenceBytes: Int32Array;
  /**
   * The speaker's sample clock (at `sampleRate`) at the start of this
   * payload (`uncompressed_sample_offset`). It runs across sections, so the
   * difference between two messages of one speaker is the exact time between
   * them; use it to place frames and insert silence for gaps.
   */
  readonly sampleOffset: Uint32Array;
  /** Start of the payload in `data`. */
  readonly offset: Uint32Array;
  /** Payload length in bytes. */
  readonly size: Uint32Array;
  /** Every payload, concatenated in row order. */
  readonly data: Uint8Array;
}

/** The payload bytes of row `i` (a view into `voice.data`, no copy). */
export function voiceFrame(voice: PlayerVoice, i: number): Uint8Array {
  const start = voice.offset[i]!;
  return voice.data.subarray(start, start + voice.size[i]!);
}

/** Every column's underlying `ArrayBuffer` — the `postMessage` transfer list. */
export function voiceBuffers(voice: PlayerVoice): ArrayBuffer[] {
  return [
    voice.tick,
    voice.player,
    voice.format,
    voice.flags,
    voice.sectionNumber,
    voice.sequenceBytes,
    voice.sampleOffset,
    voice.offset,
    voice.size,
    voice.data,
  ].map((column) => column.buffer as ArrayBuffer);
}

/** Frame geometry of the engine codecs this recorder knows. */
const CODECS: Readonly<Record<string, readonly [number, number, number]>> = {
  // sampleRate, frameSamples, frameBytes
  vaudio_celt: [22050, 512, 64],
};

const SPEC = {
  tick: Int32Array,
  player: Uint16Array,
  format: Uint8Array,
  flags: Uint8Array,
  sectionNumber: Uint32Array,
  sequenceBytes: Int32Array,
  sampleOffset: Uint32Array,
  offset: Uint32Array,
  size: Uint32Array,
};

export class VoiceRecorder {
  private readonly table: ColumnTable<typeof SPEC>;
  private data: Uint8Array;
  private bytes = 0;
  private init: ParserEventMap["voiceInit"] | undefined;
  private roster: PlayerRoster | null = null;

  /**
   * @param initialRows - rows to allocate up front; grows by doubling.
   * @param initialBytes - payload bytes to allocate up front; grows by doubling.
   */
  constructor(initialRows = 4096, initialBytes = 256 * 1024) {
    this.table = new ColumnTable(SPEC, initialRows);
    this.data = new Uint8Array(Math.max(1, initialBytes));
  }

  attach(parser: DemoParser): void {
    this.roster = PlayerRoster.for(parser);
    parser.on("voiceInit", (e) => (this.init = e));
    parser.on("voiceData", (e) => this.onVoiceData(e));
  }

  /** Right-sized columns of every message so far. */
  snapshot(): PlayerVoice {
    const codec = this.init?.codec ?? "";
    const [sampleRate, frameSamples, frameBytes] = CODECS[codec] ?? [0, 0, 0];
    return {
      length: this.table.length,
      codec,
      quality: this.init?.quality ?? 0,
      version: this.init?.version ?? 0,
      sampleRate,
      frameSamples,
      frameBytes,
      ...this.table.snapshot(),
      data: this.data.slice(0, this.bytes),
    };
  }

  private onVoiceData(e: ParserEventMap["voiceData"]): void {
    const payload = e.data;
    const end = this.bytes + payload.length;
    if (end > this.data.length) {
      let capacity = this.data.length * 2;
      while (capacity < end) capacity *= 2;
      const next = new Uint8Array(capacity);
      next.set(this.data.subarray(0, this.bytes));
      this.data = next;
    }
    this.data.set(payload, this.bytes);

    const i = this.table.addRow();
    const c = this.table.columns;
    c.tick[i] = e.tick;
    c.player[i] = this.roster!.indexOfSpeaker(e.client, e.xuid) ?? NO_PLAYER;
    c.format[i] = e.format;
    c.flags[i] = (e.proximity ? VoiceFlags.Proximity : 0) | (e.caster ? VoiceFlags.Caster : 0);
    c.sectionNumber[i] = e.sectionNumber;
    c.sequenceBytes[i] = e.sequenceBytes;
    c.sampleOffset[i] = e.uncompressedSampleOffset;
    c.offset[i] = this.bytes;
    c.size[i] = payload.length;
    this.bytes = end;
  }
}
