/**
 * counter-strike-demo-parser
 *
 * A TypeScript library for parsing CS:GO .dem files.
 * Streaming event-emitter architecture, fully typed, minimal dependencies.
 *
 * @example
 * ```ts
 * import { DemoParser } from 'counter-strike-demo-parser';
 *
 * const buffer = fs.readFileSync('match.dem');
 * const parser = new DemoParser(buffer);
 * parser.parseAll();
 * ```
 */
export { DemoParser } from "./DemoParser.js";
