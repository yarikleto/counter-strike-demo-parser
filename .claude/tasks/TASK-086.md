# TASK-086: Native batched packet-decode pipeline

**Milestone:** 7 — Performance & Polish
**Status:** `TODO`
**Size:** XL (2-3 weeks of focused work) | **Type:** vertical-slice
**Depends on:** TASK-082 (N-API toolchain)

## Goal

Reopen the native track with the right architecture. The TASK-083/084 finding was clear: per-method N-API binding loses to V8-monomorphic JS by ~8.5× because the JS↔C++ boundary tax (HandleScope, arg coercion, return boxing — tens of ns per call) overwhelms the actual per-call work (single-digit ns of shifts/masks). A *batched* native path can win.

The architecture: push a whole packet's bytes into C++ once, run the entity decode loop entirely in native code, hand back a typed-array of decoded values per packet. Everything inside the loop — BitReader reads, property decoders, flat-prop writes — stays below the JS↔C++ boundary. The boundary is crossed once per packet (~thousands per demo), not once per prop (~millions).

## Acceptance Criteria

- [ ] Native packet-level decode entry point: `nativeAddon.decodePacket(buffer, sendTablesHandle, entityStateHandle): TypedArray` (or similar)
- [ ] Entity layer redesigned to expose a batchable boundary — flat-prop columns are passed as TypedArray views, mutated in C++ in place
- [ ] BitReader and property decoders implemented in C++ as private internals (NOT exposed to JS — they live behind the batched boundary)
- [ ] Drop-in dispatch: when the native addon is loaded, `DemoParser.parseAll()` routes packet decode through native; falls back to pure JS otherwise
- [ ] All existing unit tests pass against both implementations
- [ ] All 5 golden files pass byte-identical with native enabled
- [ ] Cross-validation (`npm run cross-validate`) still PASSes
- [ ] Bench: ≥2× faster than the current 760 ms baseline (target ~250-380 ms parse on de_nuke)
- [ ] Peak RSS not regressed > 10%

## Why this is XL

This is not a port — it's a redesign. The current entity layer in `src/entities/` is built around JS objects and per-tick property writes. To expose a batchable boundary, you need:

1. Flat-prop storage that's TypedArray-backed (not JS arrays of polymorphic values)
2. SendTable / ServerClass handles that survive across native calls (probably via opaque integer IDs the C++ side resolves)
3. A wire-format-aware C++ decoder for PacketEntities + the BitReader hot path
4. A bridge for entity create/update/delete events back to JS (so consumers' event listeners still fire)
5. Rebuilt tests for the redesigned entity layer

## Risk register

- **C++ correctness drift over time** — every wire-format change has to be implemented twice (TS and C++). Mitigate with cross-validation in CI and goldens.
- **Build complexity** — prebuildify per-platform (macOS arm64 + x64, linux x64 + arm64, win x64) is a significant CI investment. TASK-085 is reactivated as a real subtask.
- **Maintenance burden vs gain** — if the achieved speedup is < 2×, the maintenance cost isn't worth it. Use the same ship-or-revert discipline TASK-072/083 used.

## Reference

- TASK-072 already shipped a 58% parse-time win in pure JS via word-folding the BitReader. The TS implementation is highly optimized — the bar to clear with native is genuinely high.
- TASK-083 produced empirical numbers proving per-method N-API loses (39 ms JS vs 335 ms native on 100M bits, 0.12×). The fix is architectural, not implementational.
- The post-TASK-072 baseline is 760 ms parse / 105 MB/s on de_nuke. Anything ≤ 380 ms qualifies as a 2× win.

**Cycle:** architect (designs the batchable entity-layer boundary, ADR) → developer (implements native + JS dispatch + test ports) → reviewer (verifies goldens + cross-validation + bench) → DevOps (prebuildify packaging via reactivated TASK-085)
