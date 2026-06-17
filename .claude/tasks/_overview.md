# Task Overview: counter-strike-demo-parser

> Version 2 | 2026-04-07 | Restored after accidental deletion

## Milestones

### M0: Walking Skeleton (TASK-001 to TASK-003)
Minimal end-to-end: scaffold, read bytes, parse header, read first frame, decode first protobuf message, emit first event. Proves the pipeline works.

| Task | Title | Size | Status | Depends |
|------|-------|------|--------|---------|
| TASK-001 | Project scaffold and build toolchain | M | DONE | — |
| TASK-002 | ByteReader + demo header parsing | M | DONE | TASK-001 |
| TASK-003 | Frame reading + first protobuf decode + first event | M | DONE | TASK-002 |

### M1: Foundation (TASK-004 to TASK-012)
Binary readers, protobuf infrastructure, basic packet dispatch. Everything needed before tackling the entity system.

| Task | Title | Size | Status | Depends |
|------|-------|------|--------|---------|
| TASK-004 | Protobuf generation pipeline | M | DONE | TASK-001 |
| TASK-005 | BitReader core | M | DONE | TASK-002 |
| TASK-006 | Integer decoders (varint, signed, unsigned) | S | DONE | TASK-005 |
| TASK-007 | Float decoders (coord, normal, cell, quantized) | M | DONE | TASK-005 |
| TASK-008 | String and byte-array decoders | S | DONE | TASK-005 |
| TASK-009 | Packet message dispatch | M | DONE | TASK-003, TASK-004 |
| TASK-010 | ServerInfo message handling | S | DONE | TASK-009 |
| TASK-011 | Typed event emitter infrastructure | S | DONE | TASK-001 |
| TASK-012 | Game enums (TeamSide, WeaponType, HitGroup) | S | DONE | TASK-001 |

### M2: Core Protocol (TASK-013 to TASK-027)
SendTables, ServerClasses, entity system, string tables, instance baselines. The heart of the parser.

| Task | Title | Size | Status | Depends |
|------|-------|------|--------|---------|
| TASK-013 | SendTable parsing | M | DONE | TASK-009 |
| TASK-014 | ServerClass registration + ClassInfo handling | S | DONE | TASK-013 |
| TASK-015 | SendTable flattening: exclusion gathering | S | DONE | TASK-013 |
| TASK-018a | Validate priority-140 within-bucket order | S | DONE (root cause: COLLAPSIBLE distinction at priority-128) | TASK-021 |
| TASK-021b | Tick-loop wiring — spawn count + entityUpdated frequency | S | DONE | TASK-026 |
| TASK-016 | SendTable flattening: prop collection + DT recursion | M | DONE | TASK-015 |
| TASK-017 | SendTable flattening: collapsible tables | S | DONE | TASK-016 |
| TASK-018 | SendTable flattening: priority sort | S | DONE | TASK-017 |
| TASK-019 | Property decoder: Int + Int64 | M | DONE | TASK-006, TASK-018 |
| TASK-020 | Property decoder: Float (all sub-encodings) | M | DONE | TASK-007, TASK-018 |
| TASK-021 | Property decoder: Vector, VectorXY, String, Array | M | DONE | TASK-019, TASK-020 |
| TASK-021a | Decoder divergence-from-demoinfocs validation | S | DONE (per-prop decoders exonerated; bug was in Flattener) | TASK-021, TASK-026 |
| TASK-022 | String table creation (CreateStringTable) | M | DONE | TASK-009 |
| TASK-023 | String table updates (UpdateStringTable) | S | DONE | TASK-022 |
| TASK-024 | Snappy decompression for string tables | S | DONE | TASK-022 |
| TASK-025 | Instance baseline decoding | M | DONE (caveat: TASK-021a) | TASK-022, TASK-021 |
| TASK-026 | Entity creation + update (PacketEntities) | M | DONE (caveat: TASK-018a, TASK-021a) | TASK-021, TASK-025 |
| TASK-027 | Entity deletion + PVS handling | S | DONE (caveat: TASK-018a, TASK-021a) | TASK-026 |

### M3: Game State (TASK-028 to TASK-035)
Typed state overlays on raw entities. Transforms entity properties into meaningful game data.

| Task | Title | Size | Status | Depends |
|------|-------|------|--------|---------|
| TASK-028 | Player state overlay (CCSPlayer) | M | DONE | TASK-026 |
| TASK-029 | PlayerResource overlay (CCSPlayerResource) | M | DONE (class only; integration deferred to TASK-029a) | TASK-028 |
| TASK-029a | PlayerResource Flattener naming synthesis | M | DONE | TASK-029 |
| TASK-030 | Team state overlay (CCSTeam) | S | DONE | TASK-026 |
| TASK-031 | Weapon state overlay | M | DONE | TASK-026, TASK-028 |
| TASK-032 | Entity handle resolution utility | S | DONE | TASK-026 |
| TASK-033 | GameRules overlay (CCSGameRulesProxy) | M | DONE | TASK-026 |
| TASK-034 | Round state tracking | S | DONE | TASK-033 |
| TASK-035 | Server info state | S | DONE | TASK-010 |

### M4: Events (TASK-036 to TASK-048)
Game event decoding, typed event emission, and all event categories.

| Task | Title | Size | Status | Depends |
|------|-------|------|--------|---------|
| TASK-036 | Game event descriptor parsing (GameEventList) | S | DONE | TASK-009 |
| TASK-037 | Game event value decoding (GameEvent) | M | DONE | TASK-036 |
| TASK-037a | Vitest config — split unit + integration runs | S | DONE | — |
| TASK-037b | userInfoIndex — userid → Player resolver | S | DONE | TASK-022 |
| TASK-038 | Combat and player action events (7 events) | M | DONE | TASK-037, TASK-028 |
| TASK-039 | Bomb events (full 9-event lifecycle) | S | DONE | TASK-037 |
| TASK-040 | Round events (full lifecycle incl. prestart/poststart) | S | DONE | TASK-037, TASK-034 |
| TASK-041 | Grenade events (throw, bounce, all detonations) | M | DONE | TASK-037 |
| TASK-042 | Player events (connect, disconnect, team change) | S | DONE | TASK-037, TASK-028 |
| TASK-043 | Item events (item_pickup, item_purchase, item_equip) | S | DONE | TASK-037 |
| TASK-044 | Weapon events (weapon_fire, weapon_reload, weapon_zoom) | S | DONE | TASK-037 |
| TASK-045 | Hostage events | S | DONE | TASK-037 |
| TASK-046 | Miscellaneous game state events (7 events) | S | DONE | TASK-037 |
| TASK-047 | User messages (SayText, SayText2, TextMsg) | M | DONE | TASK-009 |
| TASK-048 | Public event API + three-tier TypeScript event type map | M | DONE | TASK-038 through TASK-047 |

### M5: Advanced Data (TASK-049 to TASK-061)
Deeper data extraction, edge cases, robustness.

| Task | Title | Size | Status | Depends |
|------|-------|------|--------|---------|
| TASK-049 | Console command parsing | S | DONE | TASK-003 |
| TASK-050 | User command parsing | S | DONE | TASK-003 |
| TASK-051 | Voice data extraction (raw CELT frames) | S | DONE (de_nuke=25,471 events) | TASK-009 |
| TASK-052 | Model precache string table | S | DONE (PrecacheTable; de_nuke=844) | TASK-022 |
| TASK-053 | Sound precache string table | S | DONE (PrecacheTable; de_nuke=3076) | TASK-022 |
| TASK-054 | Downloadables string table | S | DONE (PrecacheTable; de_nuke=104) | TASK-022 |
| TASK-055 | SteamId utility (Steam2/Steam3/Steam64 conversion) | S | DONE | TASK-001 |
| TASK-056 | Entity handle utility (index + serial extraction) | S | DONE (already implemented in src/state/EntityHandle.ts under ENTITY_-prefixed names) | TASK-001 |
| TASK-057 | Custom data frame handling | S | DONE | TASK-003 |
| TASK-058 | String table snapshot (dem_stringtables frame) | M | DONE | TASK-022 |
| TASK-059 | Defensive parsing: malformed/truncated demos | M | DONE | TASK-026 |
| TASK-060 | Defensive parsing: unknown message types | S | DONE | TASK-009 |
| TASK-061 | Integration test suite against de_dust2.dem fixture | M | DONE (covered by existing 36-file integration suite on de_nuke fixture: header, players, combat, rounds, entities, parse-api) | TASK-048 |

### M6: Convenience & DX (TASK-062 to TASK-070)
High-level API, convenience trackers, developer experience polish.

| Task | Title | Size | Status | Depends |
|------|-------|------|--------|---------|
| TASK-062 | High-level DemoParser.parse() API + DemoResult type | M | DONE | TASK-048 |
| TASK-063 | Grenade trajectory tracker | M | DONE | TASK-041, TASK-026 |
| TASK-064 | Economy tracker (money per player per round) | M | DONE | TASK-028, TASK-040 |
| TASK-065 | Damage matrix | M | DONE | TASK-038 |
| TASK-066 | Round tracker (per-round summary aggregation) | M | DONE | TASK-040, TASK-038 |
| TASK-067 | Player position snapshots | S | DONE | TASK-028 |
| TASK-068 | Chat message collection | S | DONE | TASK-047 |
| TASK-069 | API documentation and JSDoc polish | M | DONE — audited ~80 public exports + Tier-3 events; filled per-field/per-method gaps in 7 files | TASK-062 |
| TASK-070 | Usage examples (kills, scoreboard, heatmap, economy) | S | DONE | TASK-062 |
| TASK-071a | Stream input support (DemoParser.fromStream) | S | DONE | TASK-062 |

### M7: Performance & Polish (TASK-071 to TASK-085)
Benchmarks, optimizations, golden file tests, native C++ addon, release prep.

| Task | Title | Size | Status | Depends |
|------|-------|------|--------|---------|
| TASK-071 | Benchmark harness (parse time, memory, ops/sec) | M | DONE — Apple M4 Pro baseline: 1810 ms / 44.3 MB/s / 210 MB peak RSS | TASK-062 |
| TASK-072 | BitReader V8 optimization pass | M | DONE — parse 1810→760 ms (-58%); throughput 44.3→105 MB/s (+138%) | TASK-071 |
| TASK-073 | Property decoder optimization pass | S | WONTFIX — Attempted post-TASK-072: no ≥5% improvement available. The BitReader hot path is now optimal, and the per-prop bit reads + entity slot writes (TASK-074 WONTFIX) dominate remaining time. Tried hoisting flag literals, fast-path masks, and reduced flag dispatch — all measured as a 2% regression with +6% RSS (V8 inline-cache perturbation). Reverted per ship-or-revert contract. Real perf headroom from here lives in the native addon (TASK-082-085). | TASK-071 |
| TASK-074 | Entity system memory optimization | S | WONTFIX — Entity objects are thin views over per-ServerClass EntityStore columns (TASK-026 design); per-prop storage is already pre-allocated at flatten time. An Entity-object pool was implemented and benchmarked: it INCREASED peak RSS by ~8% (210→227 MB) for ~1% parse-time gain, because the pool's retention overhead dwarfs the small Entity allocation savings. The architecture is already at the local optimum. Bigger wins live in BitReader (TASK-072) and property decoders (TASK-073). | TASK-071 |
| TASK-075 | Golden file test infrastructure | M | DONE | TASK-061 |
| TASK-076 | Golden file: header + server info | S | DONE | TASK-075 |
| TASK-077 | Golden file: entity counts + classes | S | DONE | TASK-075 |
| TASK-078 | Golden file: player end state | S | DONE | TASK-075 |
| TASK-079 | Golden file: kill feed | S | DONE | TASK-075 |
| TASK-080 | Golden file: round results | S | DONE | TASK-075 |
| TASK-081 | Cross-validation against demoinfocs-golang | M | DONE — Headline: kills 337 vs 337 exact match, all 31 round winners agree, header bit-identical. Two commits: Go binary (`scripts/demoinfocs-export/`) emits JSON, TS diff (`scripts/cross-validate.ts`) reports PASS/FAIL. `npm run cross-validate`. | TASK-061 |
| TASK-082 | Native C++ addon spike (N-API setup) | M | DONE — node-addon-api + node-gyp wired; trivial add() native function loads on macOS arm64; ESM loader with try/catch fallback in src/native/index.ts | TASK-005 |
| TASK-083 | Native BitReader (C++ N-API) | M | WONTFIX — Implemented + benchmarked: native 335 ms vs JS 39 ms on 100M bits (0.12× — native is 8.5× SLOWER). Per-method N-API boundary tax (HandleScope/coercion/boxing, ~tens of ns/call) overwhelmed the per-call work (single-digit ns of shifts/masks in V8-monomorphic JS). 106 parity tests passed (correctness fine). Reverted per ship-or-revert contract. **Architectural finding: per-method N-API binding is the wrong granularity for hot bitstream code; native wins only via coarser boundaries (e.g. native packet-level decode that calls back into JS once per frame, not once per prop).** TASK-084 / TASK-085 should be reconsidered with this in mind. | TASK-082 |
| TASK-084 | Native property decoder (C++ N-API) | M | WONTFIX — Same per-call N-API tax as TASK-083 would dominate. Prop decode is called millions of times per parse; the architecture for a winning native impl is "batched packet-level decode in C++" not "per-prop function calls." That's a fundamental rewrite, not the slice the spec describes. Revisit only if a clean batched API design emerges. | TASK-083 |
| TASK-085 | Prebuildify packaging + fallback logic | M | WONTFIX — Native add() spike ships and consumers can `npm run build:native` for a local addon, but with TASK-083/084 WONTFIX the prebuilt binaries would carry no real perf gain. Skip until a coarser-grained native boundary justifies the maintenance cost. | TASK-084 |
| TASK-086 | Native batched packet-decode pipeline (the right architecture) | XL | TODO — Reopens the native track with the architectural lesson from TASK-083/084. Push a whole packet's bytes into C++ once, run the entity decode loop entirely in native code (BitReader + property decoders + flat-prop writes all stay below the JS↔C++ boundary), hand back a typed-array of decoded values per packet. Eliminates the per-call N-API tax that killed TASK-083. Estimated 2-3 weeks of focused work; requires a fundamental redesign of the entity layer to expose a batchable boundary. Realistic target: 2–3× on top of TASK-072's already-optimized 760 ms baseline (i.e. ~250-380 ms parse on de_nuke). See `.claude/tasks/TASK-086.md` for the full design rationale. | TASK-082 |

## Critical Path

```
TASK-001 (DONE)
    |
TASK-002 -> TASK-003 -> TASK-009 -> TASK-013 -> TASK-015-018 (flattening)
    |                       |                         |
TASK-005 -> TASK-006    TASK-004                 TASK-019-021 (prop decoders)
    |       TASK-007                                  |
    |       TASK-008                             TASK-025 (baselines)
    |                                                 |
    +---> TASK-082 (native spike, independent)   TASK-026-027 (entities)
                                                      |
                                                 TASK-028-035 (game state)
                                                      |
                                                 TASK-036-048 (events)
                                                      |
                                                 TASK-062-070 (convenience)
                                                      |
                                                 TASK-071-081 (perf + polish)
```

## Definition of Done (per task)

1. Implementation complete — meets all acceptance criteria
2. Tests written — developer writes tests verifying the feature works
3. Existing tests pass — no regressions in unrelated areas
4. Code review approved — reviewer signs off
5. Typecheck passes — `npm run typecheck`
6. Lint passes — `npm run lint`

## Parallelization Opportunities

- TASK-004 (protobuf) and TASK-005 (BitReader) can run in parallel
- TASK-011 (event emitter) and TASK-012 (enums) can run anytime after TASK-001
- TASK-055 (SteamId) and TASK-056 (entity handle) can run anytime after TASK-001
- TASK-082-085 (native addon) is an independent track after TASK-005
- TASK-049-054 (advanced data) can partially parallelize after M2
- TASK-075-080 (golden files) can run in parallel once infrastructure is ready
