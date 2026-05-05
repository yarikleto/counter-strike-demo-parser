import { describe, it, expect } from "vitest";
import { nativeAddon } from "../../../src/native/index.js";

/**
 * TASK-082 spike: the test must pass whether or not the native addon was
 * built. If `npm run build:native` has been run on this host the addon is
 * loaded and `add(2, 3)` should equal 5; otherwise the export is
 * `undefined` and we exercise the fallback contract.
 */
describe("native addon (TASK-082 spike)", () => {
  const addon = nativeAddon;
  if (addon !== undefined) {
    // eslint-disable-next-line no-console
    console.log("[TASK-082] native path: csdemo_native.node loaded");
    it("exposes a working add(a, b)", () => {
      expect(addon.add(2, 3)).toBe(5);
      expect(addon.add(-1, 1)).toBe(0);
      expect(addon.add(1.5, 2.25)).toBe(3.75);
    });
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "[TASK-082] fallback path: native addon not built (run `npm run build:native`)",
    );
    it("exports undefined when the addon is not built", () => {
      expect(addon).toBeUndefined();
    });
  }
});
