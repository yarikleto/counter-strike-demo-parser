/**
 * Node flavour of the public API: everything from the browser-safe entry,
 * with a `DemoParser` that also reads files and drains streams.
 *
 * Kept separate so that bundlers targeting browsers / Web Workers never see
 * `node:fs`, `node:stream` or the native addon loader.
 */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Readable } from "node:stream";
import { DemoParser as CoreDemoParser } from "./DemoParser.js";
import type { DemoResult, ParseOptions } from "./convenience/DemoResult.js";

export * from "./browser.js";

/** Anything the Node `parse()` accepts: a file path, bytes, or a stream. */
export type DemoInput = string | Uint8Array | ArrayBuffer | Readable;

export class DemoParser extends CoreDemoParser {
  /**
   * Parse a demo into a plain-data {@link DemoResult}. Accepts a file path
   * (read with `fs/promises`), bytes (`Buffer`, `Uint8Array`,
   * `ArrayBuffer`), or a Node `Readable` (drained into memory first — see
   * {@link fromStream}).
   */
  static override async parse(input: DemoInput, options: ParseOptions = {}): Promise<DemoResult> {
    return CoreDemoParser.parse(await readInput(input), options);
  }

  /** Create a parser by reading a .dem file from disk. */
  static fromFile(path: string): DemoParser {
    return new DemoParser(readFileSync(path));
  }

  /**
   * Create a parser by draining a Node `Readable` stream (TASK-071a).
   *
   * Accepts any Node `Readable` — `fs.createReadStream(path)`, an
   * `http.IncomingMessage`, an S3 SDK body, or `Readable.from([...])`.
   * Chunks are collected via `for await` and concatenated once. Stream
   * errors reject the returned promise.
   *
   * Trade-off: the entire demo is buffered into memory before parsing
   * begins; the wire format needs the signon datatables before entity data
   * can be decoded, so incremental parsing is a separate redesign.
   *
   * @example
   * ```ts
   * import { createReadStream } from "node:fs";
   * const parser = await DemoParser.fromStream(createReadStream("match.dem"));
   * parser.parseAll();
   * ```
   */
  static async fromStream(readable: Readable): Promise<DemoParser> {
    return new DemoParser(await drain(readable));
  }
}

/** Node version of {@link parseDemo}: also accepts a file path or a stream. */
export function parseDemo(input: DemoInput, options: ParseOptions = {}): Promise<DemoResult> {
  return DemoParser.parse(input, options);
}

// Optional native addon (TASK-082). `nativeAddon` is `undefined` if the
// native module wasn't built for the host; consumers must always check.
export { nativeAddon } from "./native/index.js";
export type { NativeAddon } from "./native/index.js";

async function readInput(input: DemoInput): Promise<Uint8Array | ArrayBuffer> {
  if (typeof input === "string") return readFile(input);
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) return input;
  return drain(input);
}

async function drain(readable: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of readable) {
    chunks.push(Buffer.from(chunk as Uint8Array | string));
  }
  return Buffer.concat(chunks);
}
