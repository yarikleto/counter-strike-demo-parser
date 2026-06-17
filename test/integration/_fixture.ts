/**
 * Shared fixture guard for the integration + golden suites.
 *
 * Every integration test parses `test/fixtures/de_nuke.dem` — an ~80 MB demo
 * tracked via Git LFS. A fresh clone (or CI without `lfs: true`) has only the
 * 133-byte LFS pointer in its place, which the parser rejects with
 * `Invalid demo file: expected magic "HL2DEMO"`.
 *
 * Rather than crash, suites gate themselves on `fixtureAvailable` via
 * `describe.skipIf(!fixtureAvailable)` so a clone without the fixture reports
 * the integration tests as SKIPPED (with a hint) instead of failing.
 *
 * The underscore prefix keeps this file out of the `**\/*.test.ts` glob.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** Absolute path to the de_nuke.dem integration fixture. */
export const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

/**
 * The smallest plausible real demo dwarfs this; an unresolved Git LFS pointer
 * is ~133 bytes. Anything under 1 KiB is treated as "not a real demo".
 */
const MIN_DEMO_BYTES = 1024;

/**
 * `true` when the de_nuke.dem fixture is present AND is a real demo file
 * (not a missing file or an unresolved Git LFS pointer).
 */
export const fixtureAvailable: boolean =
  existsSync(FIXTURE_PATH) && statSync(FIXTURE_PATH).size >= MIN_DEMO_BYTES;

// Emit the hint once per module evaluation. Vitest isolates each test file in
// its own module graph, so this prints once per skipped suite — enough to make
// the reason obvious without duplicating it within a single file's imports.
const HINT_FLAG = "__csdp_fixture_hint_shown__";
if (!fixtureAvailable && !(globalThis as Record<string, unknown>)[HINT_FLAG]) {
  (globalThis as Record<string, unknown>)[HINT_FLAG] = true;
  console.warn("skipping: de_nuke.dem not available — run `git lfs pull`");
}
