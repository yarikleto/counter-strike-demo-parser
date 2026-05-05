/**
 * Golden-file comparison helper.
 *
 * Reads a committed golden JSON snapshot from `test/golden/<name>.json` and
 * asserts it deep-equals the supplied `actual` payload. On mismatch, vitest
 * prints a structural diff pinpointing the changed fields.
 *
 * To regenerate the goldens after an INTENTIONAL behaviour change, run
 * `npm run goldens:update` and review the diff in git.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Compare a freshly-computed snapshot against the committed golden JSON.
 *
 * The `actual` payload is round-tripped through JSON before the equality
 * check so `undefined` fields (which JSON.stringify drops) compare cleanly
 * against the on-disk shape — the file never holds an `undefined` literal,
 * so the round-trip aligns the two shapes.
 */
export function expectMatchesGolden(name: string, actual: unknown): void {
  const path = join(__dirname, `${name}.json`);
  const expected: unknown = JSON.parse(readFileSync(path, "utf8"));
  // Round-trip `actual` through JSON to drop any `undefined` fields,
  // matching how the on-disk golden was serialised by the generator.
  const normalised: unknown = JSON.parse(JSON.stringify(actual));
  expect(normalised).toEqual(expected);
}
