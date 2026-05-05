/**
 * Native addon loader with graceful fallback.
 *
 * On import, attempts to load the local-built `.node` binary at
 * `native/build/Release/csdemo_native.node`. If the file is missing
 * (consumer hasn't run `npm run build:native`, or no prebuilt for this
 * platform exists), {@link nativeAddon} is `undefined` and consumers fall
 * back to the pure-TS path.
 *
 * The `.node` binary is a CommonJS module — Node.js only exposes it via
 * `require`. Since this package is ESM, we obtain a `require` instance via
 * {@link createRequire}; this is the only sanctioned use of CJS in the
 * codebase.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Public surface of the native addon. Keep this tight: every function
 * exposed here MUST also have a pure-TS fallback elsewhere in the package.
 *
 * SPIKE (TASK-082): the only export is `add`, used to validate the
 * build/load/fallback cycle. Real methods land in later tasks.
 */
export interface NativeAddon {
  /** Returns `a + b`. Used to verify the toolchain wiring works. */
  add(a: number, b: number): number;
}

function loadNativeAddon(): NativeAddon | undefined {
  try {
    const require = createRequire(import.meta.url);
    // src/native/index.ts -> dist/native/index.js after bundling, but we
    // always resolve relative to the package root (../../native/...).
    // Using `resolve` keeps the path absolute and toolchain-agnostic.
    const here = dirname(fileURLToPath(import.meta.url));
    const binaryPath = resolve(
      here,
      "..",
      "..",
      "native",
      "build",
      "Release",
      "csdemo_native.node",
    );
    const mod = require(binaryPath) as unknown;
    if (
      mod !== null &&
      typeof mod === "object" &&
      typeof (mod as { add?: unknown }).add === "function"
    ) {
      return mod as NativeAddon;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * The loaded native addon, or `undefined` if it could not be loaded.
 *
 * Consumers should always check for `undefined` and use the pure-TS
 * fallback when the native module is unavailable.
 */
export const nativeAddon: NativeAddon | undefined = loadNativeAddon();
