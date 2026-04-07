import { readFileSync } from "node:fs";

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
 */
export class DemoParser {
  private readonly buffer: Buffer;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
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
    // Will be implemented in subsequent tasks.
    // For now, validates that the buffer exists.
    if (this.buffer.length === 0) {
      throw new Error("Empty demo file");
    }
  }
}
