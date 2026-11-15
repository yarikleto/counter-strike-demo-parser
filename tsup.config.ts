import { defineConfig } from "tsup";

export default defineConfig({
  // index = Node flavour (file paths, streams, native addon loader);
  // browser = the same API without any Node built-ins.
  entry: { index: "src/index.ts", browser: "src/browser.ts" },
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  target: "es2022",
  splitting: false,
  treeshake: true,
  esbuildOptions(options) {
    // Valve's netmessages.proto aliases two ESplitScreenMessageType values
    // (`allow_alias`), so ts-proto's generated JSON helpers contain a
    // repeated `case 1:`. Harmless dead code; hand-written source is still
    // checked by ESLint's no-duplicate-case.
    options.logOverride = { ...options.logOverride, "duplicate-case": "silent" };
  },
});
