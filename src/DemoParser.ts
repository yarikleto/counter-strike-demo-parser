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
import { parseHeader } from "./frame/header.js";
import type { DemoHeader } from "./frame/header.js";
import { iterateFrames } from "./frame/FrameParser.js";
import { MessageDispatcher } from "./packet/MessageDispatch.js";
import type { CSVCMsg_ServerInfo } from "./proto/index.js";

export class DemoParser extends EventEmitter {
  private readonly buffer: Buffer;
  private _header: DemoHeader | undefined;
  private _serverInfo: CSVCMsg_ServerInfo | undefined;

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
    });

    for (const frame of iterateFrames(reader)) {
      if (frame.packetData) {
        dispatcher.dispatch(frame.packetData);
      }
    }
  }
}
