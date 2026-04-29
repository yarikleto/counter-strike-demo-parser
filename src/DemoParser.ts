/**
 * DemoParser — main public API for parsing CS:GO .dem files.
 *
 * This is the entry point for consumers of the library. It accepts a Buffer
 * containing the raw .dem file data and emits typed events as it parses
 * through frames, packets, entities, and game state.
 *
 * Architecture: The parser is a pipeline of layers, each feeding the next:
 *   ByteReader -> FrameParser -> PacketDecoder -> DataTables/Entities -> GameState -> Events
 *
 * Three ways to create a parser:
 *   - new DemoParser(buffer)        — from an existing Buffer
 *   - DemoParser.fromBuffer(buffer) — same, explicit factory
 *   - DemoParser.fromFile(path)     — read a .dem file from disk
 *
 * One-shot convenience:
 *   - DemoParser.parse(buffer)      — create + parseAll in one call
 *
 * Event emission: extends Node.js EventEmitter. Currently emits:
 *   - 'serverInfo' — when CSVCMsg_ServerInfo is decoded (decoded by ts-proto
 *                    via the MessageDispatcher; payload is the generated
 *                    CSVCMsg_ServerInfo type).
 */
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { ByteReader } from "./reader/ByteReader.js";
import { BitReader } from "./reader/BitReader.js";
import { parseHeader } from "./frame/header.js";
import type { DemoHeader } from "./frame/header.js";
import { iterateFrames } from "./frame/FrameParser.js";
import { MessageDispatcher } from "./packet/MessageDispatch.js";
import type {
  CSVCMsg_CreateStringTable,
  CSVCMsg_PacketEntities,
  CSVCMsg_ServerInfo,
  CSVCMsg_UpdateStringTable,
} from "./proto/index.js";
import { parseDataTables } from "./datatables/DataTablesParser.js";
import type { SendTableRegistry } from "./datatables/SendTableRegistry.js";
import { ServerClassRegistry } from "./datatables/ServerClassRegistry.js";
import { StringTable } from "./stringtables/StringTable.js";
import type { StringTableEntry } from "./stringtables/StringTable.js";
import { StringTableManager } from "./stringtables/StringTableManager.js";
import { parseStringTableEntries } from "./stringtables/StringTableParser.js";
import { decompressSnappy } from "./stringtables/Compression.js";
import { EntityList, decodePacketEntities } from "./entities/index.js";
import { buildServerInfo } from "./state/ServerInfo.js";
import type { TypedServerInfo } from "./state/ServerInfo.js";
import { Player } from "./state/Player.js";
import { Weapon } from "./state/Weapon.js";
// PlayerResource overlay deferred to TASK-029a — needs Flattener
// to synthesize array-element parent names. The PlayerResource class
// works on synthetic data (see test/unit/state/PlayerResource.test.ts)
// but cannot construct against real entities until that lands. The
// type re-export stays in `src/state/index.ts` so downstream consumers
// can still reference the snapshot types.

export class DemoParser extends EventEmitter {
  private readonly buffer: Buffer;
  private _header: DemoHeader | undefined;
  private _serverInfo: CSVCMsg_ServerInfo | undefined;
  private _sendTables: SendTableRegistry | undefined;
  private _serverClasses: ServerClassRegistry | undefined;
  private _stringTables: StringTableManager | undefined;
  /** Per-table-id history rings, keyed by table id. UpdateStringTable
   * continues the same ring its corresponding CreateStringTable used. */
  private readonly stringTableHistories = new Map<number, string[]>();
  /** Live entity list, populated as PacketEntities messages are decoded. */
  private readonly _entities: EntityList = new EntityList();
  /**
   * Once a PacketEntities decode throws (TASK-021a wire divergence, etc.),
   * skip subsequent messages — re-attempting them would only burn CPU on
   * already-desynced cursors. The error is surfaced via the
   * `entityDecodeError` event the first time it happens.
   */
  private _entityDecodeDisabled = false;
  /**
   * Memoized typed ServerInfo overlay (TASK-035). Lazily built on first
   * access of `serverInfoState`. Both source values (`_serverInfo` and
   * `_header`) are frozen post-`parseAll`, so a single build is correct
   * for the lifetime of the parser. `null` means "not yet built";
   * `undefined` is reserved for the legitimate "raw ServerInfo not yet
   * decoded" return value the getter exposes.
   */
  private _typedServerInfo: TypedServerInfo | undefined | null = null;
  /**
   * Memoized typed overlays (M3). Each is built lazily on first access by
   * walking `this._entities` and filtering by ServerClass shape. `null`
   * means "not yet computed". Cache invalidation is intentionally skipped
   * for v0.1 — held overlays whose entity has been recycled will throw
   * `StaleEntityError` on read (per ADR-004), which is the right loudness.
   */
  private _playersCache: Player[] | null = null;
  private _weaponsCache: Weapon[] | null = null;

  constructor(buffer: Buffer) {
    super();
    this.buffer = buffer;
  }

  /** The parsed demo header. Available after parseAll() completes. */
  get header(): DemoHeader | undefined {
    return this._header;
  }

  /**
   * The latest decoded `CSVCMsg_ServerInfo` message.
   *
   * `undefined` until parsing reaches the signon phase — i.e., before
   * `parseAll()` is invoked or before the first packet/signon frame
   * carrying a ServerInfo message is processed. Later parsing stages
   * (entity system, etc.) read this synchronously without subscribing
   * to the `serverInfo` event. Synchronous `serverInfo` event listeners
   * observe a consistent state: this property is assigned before the
   * event is emitted.
   */
  get serverInfo(): CSVCMsg_ServerInfo | undefined {
    return this._serverInfo;
  }

  /**
   * Typed roll-up of the demo header and `CSVCMsg_ServerInfo` packet —
   * see {@link TypedServerInfo}. Joins map name, tick interval, max
   * classes, computed `tickRate`, header playback duration / ticks, and
   * the `isGOTV` flag into a single read-only object.
   *
   * Returns `undefined` until both the header and the `CSVCMsg_ServerInfo`
   * packet have been observed (i.e., before the first `serverInfo` event
   * fires). Lazily built on first access and memoized — both source
   * values are immutable for the rest of the parser's lifetime.
   */
  get serverInfoState(): TypedServerInfo | undefined {
    if (this._typedServerInfo !== null) return this._typedServerInfo;
    if (this._header === undefined) return undefined;
    const built = buildServerInfo(this._serverInfo, this._header);
    if (built === undefined) {
      // Don't memoize "not yet decoded" — keep retrying on each access
      // until the underlying ServerInfo arrives. Once built it sticks.
      return undefined;
    }
    this._typedServerInfo = built;
    return built;
  }

  /**
   * Live `Player` overlays for every CCSPlayer entity currently in the
   * entity list. Built lazily on first access by walking
   * `this._entities.entries()` and filtering by `serverClass.className ===
   * "CCSPlayer"`. Each overlay is a *live view* (ADR-004): subsequent reads
   * through `player.position`, `player.health`, etc. observe the latest
   * tick's value automatically. The slot passed to the `Player` constructor
   * is the entity id, which on CCSPlayer is the player's 1-based connection
   * slot in the standard Source convention.
   *
   * The returned array is memoized — repeat calls return the same reference
   * for v0.1. Cache invalidation on disconnect is deferred; held references
   * to disconnected players surface the `StaleEntityError` from the
   * underlying `Entity.assertFresh`, which is the right loudness.
   */
  get players(): Player[] {
    if (this._playersCache !== null) return this._playersCache;
    const out: Player[] = [];
    for (const [id, entity] of this._entities.entries()) {
      if (entity.serverClass.className === "CCSPlayer") {
        out.push(new Player(id, entity));
      }
    }
    this._playersCache = out;
    return out;
  }

  /**
   * Live `Weapon` overlays for every weapon entity currently in the entity
   * list. Filter heuristic: any entity whose ServerClass exposes
   * `m_iClip1` in its flattened-prop schema is a weapon. This is a
   * structural check — it sidesteps the long enumeration of CWeapon*
   * subclasses and stays correct as new guns are added in CSGO updates.
   */
  get weapons(): Weapon[] {
    if (this._weaponsCache !== null) return this._weaponsCache;
    const out: Weapon[] = [];
    for (const [, entity] of this._entities.entries()) {
      const hasClip1 = entity.serverClass.flattenedProps.some(
        (p) => p.prop.varName === "m_iClip1",
      );
      if (hasClip1) {
        out.push(new Weapon(entity));
      }
    }
    this._weaponsCache = out;
    return out;
  }

  /**
   * The SendTable registry parsed from the demo's `dem_datatables` frame.
   *
   * `undefined` until parsing reaches the signon datatables frame. After
   * `parseAll()` completes on a well-formed demo this is always populated;
   * the entity decoder (M2 Slice 4) reads it synchronously.
   */
  get sendTables(): SendTableRegistry | undefined {
    return this._sendTables;
  }

  /**
   * The ServerClass registry parsed from the demo's `dem_datatables` frame.
   *
   * `undefined` until parsing reaches the signon datatables frame. Indexed
   * by both `classId` and C++ `className`.
   */
  get serverClasses(): ServerClassRegistry | undefined {
    return this._serverClasses;
  }

  /**
   * The string-table manager. `undefined` until the first
   * CSVCMsg_CreateStringTable arrives (early in signon). Once any
   * CreateStringTable is processed, this is populated for the rest of
   * parsing. Indexed by both name and wire id.
   */
  get stringTables(): StringTableManager | undefined {
    return this._stringTables;
  }

  /**
   * The live entity list, populated as `svc_PacketEntities` messages are
   * decoded. Empty until parsing reaches the first PacketEntities message
   * (post-datatables / post-stringtables). After `parseAll()` returns on a
   * well-formed demo this contains every entity that survived to dem_stop.
   */
  get entities(): EntityList {
    return this._entities;
  }

  /**
   * One-shot convenience: create a parser from a buffer and parse it immediately.
   */
  static parse(buffer: Buffer): DemoParser {
    const parser = new DemoParser(buffer);
    parser.parseAll();
    return parser;
  }

  /**
   * Create a parser by reading a .dem file from disk.
   */
  static fromFile(path: string): DemoParser {
    const buffer = readFileSync(path);
    return new DemoParser(buffer);
  }

  /**
   * Create a parser from an existing Buffer (explicit factory alternative to constructor).
   */
  static fromBuffer(buffer: Buffer): DemoParser {
    return new DemoParser(buffer);
  }

  /**
   * Parse the entire demo file synchronously, emitting events as they occur.
   */
  parseAll(): void {
    if (this.buffer.length === 0) {
      throw new Error("Empty demo file");
    }

    const reader = new ByteReader(this.buffer);
    this._header = parseHeader(reader);

    const dispatcher = new MessageDispatcher({
      onServerInfo: (info: CSVCMsg_ServerInfo) => {
        // Capture before emit so synchronous listeners that observe both
        // the event and the property see a consistent state.
        this._serverInfo = info;
        this.emit("serverInfo", info);
      },
      onCreateStringTable: (msg: CSVCMsg_CreateStringTable) => {
        this.handleCreateStringTable(msg);
      },
      onUpdateStringTable: (msg: CSVCMsg_UpdateStringTable) => {
        this.handleUpdateStringTable(msg);
      },
      onPacketEntities: (msg: CSVCMsg_PacketEntities) => {
        this.handlePacketEntities(msg);
      },
    });

    for (const frame of iterateFrames(reader)) {
      if (frame.packetData) {
        dispatcher.dispatch(frame.packetData);
      }
      if (frame.dataTablesData !== undefined && this._sendTables === undefined) {
        const { sendTables, serverClasses } = parseDataTables(
          frame.dataTablesData,
        );
        this._sendTables = sendTables;
        const registry = new ServerClassRegistry();
        for (const sc of serverClasses) {
          registry.register(sc);
        }
        this._serverClasses = registry;
      }
    }
  }

  /**
   * Decode a CSVCMsg_CreateStringTable and register the resulting
   * StringTable on the manager. Decompresses the bit-stream payload first
   * if the message indicates Snappy compression. Emits
   * `stringTableCreated` with `{ name, table }`.
   */
  private handleCreateStringTable(msg: CSVCMsg_CreateStringTable): void {
    if (this._stringTables === undefined) {
      this._stringTables = new StringTableManager();
    }
    const table = new StringTable({
      name: msg.name ?? "",
      maxEntries: msg.maxEntries ?? 0,
      userDataFixedSize: msg.userDataFixedSize ?? false,
      userDataSize: msg.userDataSize ?? 0,
      userDataSizeBits: msg.userDataSizeBits ?? 0,
      flags: msg.flags ?? 0,
    });
    const tableId = this._stringTables.register(table);
    const history: string[] = [];
    this.stringTableHistories.set(tableId, history);

    const stringData = msg.stringData;
    const numEntries = msg.numEntries ?? 0;
    if (stringData !== undefined && stringData.length > 0 && numEntries > 0) {
      const decoded = this.decompressIfNeeded(stringData, msg.flags ?? 0);
      // If decompression was needed but the runtime is unavailable (TASK-024
      // not yet enabled or snappy import failed), skip the entry parse but
      // still register the table — downstream consumers can detect missing
      // entries via `table.size === 0`.
      if (decoded !== undefined) {
        const bitReader = new BitReader(decoded);
        // Leading "encode_using_dictionaries" flag bit. Must be 0 — Source
        // never sets this on the wire. demoinfocs panics if it's set.
        const dictBit = bitReader.readBit();
        if (dictBit === 0) {
          parseStringTableEntries(bitReader, table, numEntries, history);
        }
      }
    }
    this.emit("stringTableCreated", { name: table.name, table });
  }

  /**
   * Decode a CSVCMsg_UpdateStringTable and apply it to the existing table.
   * Looks up the table by wire id and threads the same history ring used
   * for the original CreateStringTable. Emits `stringTableUpdated` with
   * `{ name, changedEntries }`.
   */
  private handleUpdateStringTable(msg: CSVCMsg_UpdateStringTable): void {
    if (this._stringTables === undefined) return;
    const tableId = msg.tableId ?? -1;
    const table = this._stringTables.getById(tableId);
    if (table === undefined) return;
    const history = this.stringTableHistories.get(tableId) ?? [];
    const stringData = msg.stringData;
    const numChangedEntries = msg.numChangedEntries ?? 0;
    if (
      stringData === undefined ||
      stringData.length === 0 ||
      numChangedEntries <= 0
    ) {
      return;
    }
    const bitReader = new BitReader(stringData);
    // Leading dictionary-encode flag (always 0 in CSGO demos).
    const dictBit = bitReader.readBit();
    if (dictBit !== 0) return;
    const { changedEntries } = parseStringTableEntries(
      bitReader,
      table,
      numChangedEntries,
      history,
    );
    this.emit("stringTableUpdated", { name: table.name, changedEntries });
  }

  /**
   * Decode a CSVCMsg_PacketEntities message and apply its create / update /
   * delete operations to the entity list. Requires datatables (for the
   * ServerClass registry) and string tables (for instance baselines) — if
   * either is missing the message is dropped silently, since by-design they
   * arrive earlier in the wire stream.
   */
  private handlePacketEntities(msg: CSVCMsg_PacketEntities): void {
    if (
      this._serverClasses === undefined ||
      this._stringTables === undefined ||
      this._entityDecodeDisabled
    ) {
      return;
    }
    try {
      decodePacketEntities(
        msg,
        this._entities,
        this._serverClasses,
        this._stringTables,
        {
          onCreate: (entity) => this.emit("entityCreated", entity),
          onUpdate: (entity) => this.emit("entityUpdated", entity),
          onDelete: (entity) => this.emit("entityDeleted", entity),
        },
      );
    } catch (err) {
      // Per-prop decoder divergence (TASK-021a) or flatten miscount
      // (TASK-018a) can desync the bit stream mid-message. Surface the
      // first failure via `entityDecodeError`, then disable the decoder
      // for the rest of the parse — re-attempting subsequent messages
      // would only burn CPU on already-desynced cursors.
      this._entityDecodeDisabled = true;
      this.emit("entityDecodeError", err);
    }
  }

  /**
   * Detect Snappy compression on a CreateStringTable's stringData blob and
   * decompress if needed.
   *
   * In the CSGO-era proto schema we use, the `flags` field on
   * CSVCMsg_CreateStringTable does NOT carry a compression bit — `flags=1`
   * is `STRINGTABLE_FLAG_PRECACHE`, not data-compressed. Compression
   * detection is done via the magic prefix instead: if the first 4 bytes
   * are ASCII "SNAP" the payload is wrapped in Source's
   * compressed-string-table envelope (`SNAP` + int32 LE length + snappy
   * body); otherwise the bytes are the raw bit-stream.
   *
   * The newer CS2 schema does carry a `data_compressed` bool on the
   * message itself; if/when this parser supports CS2 demos that field
   * should be threaded through here as a separate signal.
   *
   * Returns the decompressed (or pass-through) bytes, or `undefined`
   * when compression is detected but snappyjs is unavailable.
   */
  private decompressIfNeeded(
    data: Uint8Array,
    _flags: number,
  ): Uint8Array | undefined {
    if (data.length < 4) return data;
    const looksCompressed =
      data[0] === 0x53 && data[1] === 0x4e && data[2] === 0x41 && data[3] === 0x50;
    if (!looksCompressed) return data;
    return decompressSnappy(data);
  }
}

/**
 * Re-export of StringTableEntry for the typed event payload below — keeps
 * the symbol referenced so a downstream `import('./DemoParser.js')` sees a
 * compatible event signature.
 */
export type _StringTableEntryEventPayload = StringTableEntry;
