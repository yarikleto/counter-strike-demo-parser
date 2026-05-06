# Product Vision: counter-strike-demo-parser

> Version 2 | 2026-04-07 | Restored after accidental deletion

## One-Liner

The first feature-complete, fully-typed CS:GO demo parser for Node.js.

## Problem

TypeScript developers building CS:GO tools (stat trackers, heatmap generators, anti-cheat analysis, coaching tools, highlight extractors) have no good parsing library. The options today:

- **demofile** (JS) — abandoned for 3+ years, incomplete entity support, poor TypeScript types
- **demoinfocs-golang** (Go) — excellent but wrong ecosystem; calling Go from Node.js requires FFI or subprocess hacks
- **demoparser2** (Rust/Python) — fast but query-based API, no Node.js native support, no TypeScript types

There is a real gap: TypeScript developers have no production-quality demo parser that gives them full data with full types.

## Solution

An open-source TypeScript library that:

1. Parses CS:GO `.dem` files completely — every entity, every event, every tick
2. Provides two API levels: high-level `async/await` (easy) and low-level streaming (powerful)
3. Is fully typed — every event, every property, every API surface has TypeScript types
4. Has zero native dependencies — works everywhere Node.js runs
5. Offers optional native C++ acceleration for power users who need maximum throughput

## Target User

**Primary:** TypeScript/JavaScript developer building CS:GO tools. They know Node.js well. They may or may not know the Source engine demo format. They want to focus on their application logic, not on parsing binary data.

**Use cases:**
- Match stat aggregation and visualization
- Player position heatmaps
- Round-by-round economy analysis
- Kill/damage analysis and highlight detection
- Anti-cheat behavioral analysis
- Coaching tools (grenade lineups, positioning review)
- Tournament data pipelines

## Scope

### v1 — CS:GO Demo Parsing (current focus)
- Complete CS:GO `.dem` format support
- Full entity system with SendTable/ServerClass decoding
- All game events (100+ types), fully typed
- Player, team, weapon, round state extraction
- Grenade trajectory tracking
- Economy tracking
- Streaming + high-level API
- Optional native C++ addon for hot paths

### v2 — CS2 Demo Parsing (future)
- Source 2 `.dem` format (fundamentally different entity system)
- Separate API surface — CS2 entities have a different schema
- May share utility code (protobuf, binary readers) but game state layer will be entirely new

## Technical Constraints

- **TypeScript 5.x strict mode** — no `any` in public API
- **Node.js 22+** — minimum runtime version
- **ESM-first with CJS dual export** — modern module system with backwards compatibility
- **MIT license** — maximum adoption, community-friendly
- **Zero native dependencies** for the core package — pure TypeScript
- **Two production dependencies only:** `protobufjs/minimal` (protobuf runtime) + `snappyjs` (Snappy decompression)

## Package Identity

- **npm name:** `counter-strike-demo-parser`
- **Repository:** `github.com/yarikleto/counter-strike-demo-parser`
- **License:** MIT
- **Engine:** Node.js >= 22.0.0

## Success Metrics

1. **Correctness** — parses every valid CS:GO demo file without errors. Verified against demoinfocs-golang output.
2. **Completeness** — exposes all data that demoinfocs-golang exposes, with equivalent or better typing.
3. **Developer experience** — a developer unfamiliar with the demo format can extract kills, rounds, and player stats in under 5 minutes with the high-level API.
4. **Performance** — pure TS version parses a typical 100MB demo in under 10 seconds. Native addon brings this under 3 seconds.
5. **Adoption** — becomes the go-to CS:GO parser for the Node.js ecosystem.

## Non-Goals (for v1)

- CS2 support — separate effort, different format
- Browser support — Node.js only (Buffer, fs, etc.)
- Demo recording/writing — read-only parser
- Real-time network packet parsing — only `.dem` file parsing
- GUI or CLI tool — library only; others can build tools on top
