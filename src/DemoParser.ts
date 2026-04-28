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
