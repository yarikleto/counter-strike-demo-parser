/**
 * `parseDemo` — functional form of `DemoParser.parse()` for the browser
 * entry point. Parses raw .dem bytes into a plain-data {@link DemoResult}.
 */
import { DemoParser } from "./DemoParser.js";
import type { DemoResult, ParseOptions } from "./convenience/DemoResult.js";

export function parseDemo(
  input: Uint8Array | ArrayBuffer,
  options: ParseOptions = {},
): Promise<DemoResult> {
  return DemoParser.parse(input, options);
}
