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
});
