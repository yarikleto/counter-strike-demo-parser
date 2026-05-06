# TASK-085: Prebuildify packaging + fallback logic

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** M | **Type:** setup
**Depends on:** TASK-084

**Goal:** Package prebuilt native binaries for common platforms using prebuildify, and implement robust fallback logic so the library works without native binaries.

**Acceptance Criteria:**
- [ ] Prebuildify configuration for: linux-x64, darwin-x64, darwin-arm64, win32-x64
- [ ] Prebuilt binaries included in the npm package (or separate optional package)
- [ ] Fallback logic: attempt to load native, on failure silently fall back to pure TS
- [ ] `parser.isNativeAccelerated` boolean property to check which implementation is active
- [ ] CI builds and tests with both native and pure TS modes

**Cycle:** developer (implements + tests) -> reviewer
