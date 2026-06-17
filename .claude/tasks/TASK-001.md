# TASK-001: Project scaffold and build toolchain

**Milestone:** 0 — Walking Skeleton
**Status:** `DONE`
**Size:** M | **Type:** setup
**Depends on:** nothing

**Goal:** A working TypeScript project with dual CJS/ESM output, test runner, linter, CI-ready package.json, and the DemoParser class stub with all three factory methods.

**Acceptance Criteria:**
- [x] `npm run build` produces CJS + ESM output in `dist/`
- [x] `npm run typecheck` passes with strict mode
- [x] `npm run test` runs vitest and passes
- [x] `npm run lint` passes (ESLint + Prettier)
- [x] `package.json` has correct exports map (import/require with types)
- [x] DemoParser class exists with constructor, `fromFile()`, `fromBuffer()`, `parse()` stubs

**Cycle:** developer (implements + tests) -> reviewer

**Completed:** 2026-04-07
**Notes:** Clean execution. Scaffold is solid: TypeScript 5.7 strict, tsup dual output, vitest, ESLint 9 flat config, Prettier. Directory structure with .gitkeep files for all planned modules. Test fixture `de_dust2.dem` included.
