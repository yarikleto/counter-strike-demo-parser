# CEO Brain: counter-strike-demo-parser

> Version 2 | 2026-04-07 | Restored after accidental deletion

## Mission

Build the first feature-complete, fully-typed CS:GO demo parser for Node.js. Ship it as an open-source library that TypeScript developers actually want to use.

## Current State

- **TASK-001: DONE** — Project scaffold, build toolchain, dual CJS/ESM output, test infrastructure, CI-ready
- **TASK-002: DONE** — ByteReader (int32, uint32, float32, bytes, strings) + DemoHeader parser with magic validation
- **TASK-003: DONE** — FrameParser (all frame types), PacketReader (protobuf message stream), ServerInfo hand-rolled protobuf decoder, DemoParser wired up with EventEmitter
- **Milestone 0 COMPLETE.** Walking skeleton proves full pipeline: bytes → frames → protobuf → event
- **Working on: Milestone 1 (Foundation)** — TASK-004 and TASK-005 are next
- **Total tasks: 85** across 8 milestones

## Milestones

| # | Name | Tasks | Status |
|---|------|-------|--------|
| M0 | Walking Skeleton | TASK-001 to TASK-003 | DONE |
| M1 | Foundation | TASK-004 to TASK-012 | TODO |
| M2 | Core Protocol | TASK-013 to TASK-027 | TODO |
| M3 | Game State | TASK-028 to TASK-035 | TODO |
| M4 | Events | TASK-036 to TASK-048 | TODO |
| M5 | Advanced Data | TASK-049 to TASK-061 | TODO |
| M6 | Convenience & DX | TASK-062 to TASK-070 | TODO |
| M7 | Performance & Polish | TASK-071 to TASK-085 | TODO |

## Critical Path

M0 (skeleton) -> M1 (binary readers, protobuf) -> M2 (SendTables, entities) -> M3 (game state) -> M4 (events)

M5, M6, M7 can partially parallelize after M4 is done. The native C++ addon track (TASK-082-085) is fully independent after M1.

## Key Decisions Made

1. **Streaming over query-based** (ADR-001) — event emitter architecture, constant memory, natural for Node.js
2. **ts-proto for protobuf** (ADR-002) — static codegen, full types, tiny runtime
3. **Pure TS first, native addon later** (ADR-003) — correctness first, works everywhere, optional perf boost
4. **Hybrid type safety** (ADR-004) — flat arrays for speed, typed overlays for DX
5. **Three-tier test strategy** (ADR-005) — unit + integration + golden file tests
6. **snappyjs for Snappy** (ADR-006) — pure JS, no native dep, string tables only

## Risks

1. **SendTable flattening complexity** — the most error-prone part. Split into 4 tasks (TASK-015-018) to manage risk. Will need extensive testing against known-good parsers.
2. **Property decoder correctness** — bit-packed values with many edge cases (coords, normals, cell coords). Must match Valve's decode logic exactly.
3. **Demo format undocumented** — no official spec. Reverse-engineered from Valve SDK source and other parsers. May encounter edge cases in uncommon demo files.
4. **Performance** — BitReader is extremely hot. If pure TS is too slow, need native addon sooner. Mitigated by the addon track being independent.

## Lessons

- TASK-001 went clean — scaffold is solid, tests pass, build works, dual CJS/ESM verified.
- TASK-002 went clean — ByteReader and header parser implemented, 35 tests passing, reviewer approved first pass. No issues.
- TASK-003 went clean — 54 tests passing. Hand-rolled protobuf decoder for ServerInfo works. Pipeline proven end-to-end.
- Event plan revised (2026-04-07): Researched all 169 CS:GO events from AlliedMods wiki. Adopted three-tier event architecture: Tier 1 (~40 enriched events with Player refs), Tier 2 (all 169 via raw `gameEvent` catch-all), Tier 3 (parser synthetic). Expanded TASK-038/039/040/041/046 scope, redesigned TASK-048.

## Open Questions

None at this time. Next action: execute M1 Foundation tasks (TASK-004 protobuf pipeline, TASK-005 BitReader can run in parallel).
