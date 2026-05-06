# System Design: counter-strike-demo-parser

> Version 2 | 2026-04-07 | Restored from codebase analysis
> Version 1 was lost during accidental deletion of .claude/ contents.

## Overview

`counter-strike-demo-parser` is a TypeScript library that reads Valve Source Engine `.dem` replay files (CS:GO format) and exposes every piece of data they contain through a typed, streaming API.

The fundamental challenge: `.dem` files are a binary format with nested protobuf messages, bit-packed entity properties, delta-compressed state, and complex table-driven decoding. The parser must decode all of this correctly, efficiently, and expose it through a developer-friendly interface.

## Architecture: Six-Layer Pipeline

The parser is a strict pipeline where each layer feeds the next. Data flows downward synchronously; events bubble upward. No layer reaches past its immediate neighbor.

```
Layer 1: Binary Reader       ByteReader + BitReader
            |
Layer 2: Frame Parser        Demo header, frame types (packet, datatables, synctick, consolecmd, usercmd, stop)
            |
Layer 3: Packet Decoder      Protobuf message dispatch (NET/SVC messages)
            |
Layer 4: Data Tables         SendTable parsing, ServerClass registration, property flattening
            |
Layer 5: Entity System       Entity creation, update (delta decoding), deletion via PacketEntities
            |
Layer 6: Game State           Player, Team, GameRules, Weapons — typed state derived from entities
            |
        Event Emission        Typed events emitted synchronously at each layer
```

### Layer 1: Binary Reader (`src/reader/`)

Two classes that handle the raw binary format:

- **ByteReader** — Reads bytes, integers (LE), floats, strings from a Buffer. Tracks a cursor position. Methods: `readInt32`, `readFloat`, `readBytes`, `readString`, `readVarInt32`, etc.
- **BitReader** — Reads individual bits and bit-packed values. Required because entity property updates are bit-packed, not byte-aligned. Methods: `readBit`, `readBits`, `readVarInt`, `readBitCoord`, `readBitNormal`, `readBitFloat`, `readBitCellCoord`, `readBitAngle`, etc.

The BitReader is the hottest code in the entire parser — it processes millions of calls per demo file. V8 optimization matters here.

### Layer 2: Frame Parser (`src/frame/`)

CS:GO `.dem` files have a fixed structure:

1. **Header** (1072 bytes): magic string `"HL2DEMO\0"`, protocol version, network protocol, server name, client name, map name, game directory, playback time, ticks, frames, sign-on length.
2. **Frames**: sequential records, each with a command byte, tick number, and player slot, followed by command-specific data.

Frame command types:
- `dem_signon` (1) / `dem_packet` (2) — contain protobuf-encoded network packets
- `dem_synctick` (3) — synchronization marker (no data)
- `dem_consolecmd` (4) — console command string
- `dem_usercmd` (5) — user input command
- `dem_datatables` (6) — SendTable definitions (appears once, during signon)
- `dem_stop` (7) — end of demo
- `dem_customdata` (8) — custom data blob
- `dem_stringtables` (9) — string table snapshot

Frames of type `dem_signon` and `dem_packet` contain two sub-headers (command info with view origin/angles for two slots) followed by a sequence of protobuf messages.

### Layer 3: Packet Decoder (`src/packet/`)

Each `dem_packet` / `dem_signon` frame contains a stream of protobuf messages. Each message has a varint command ID and varint size, followed by the protobuf payload.

Key message types:
- `CSVCMsg_ServerInfo` — server metadata, max classes, tick interval
- `CSVCMsg_CreateStringTable` / `CSVCMsg_UpdateStringTable` — string table management
- `CSVCMsg_SendTable` — entity property schema definitions
- `CSVCMsg_ClassInfo` — maps class IDs to ServerClass names
- `CSVCMsg_PacketEntities` — entity creation/update/deletion (the big one)
- `CSVCMsg_GameEventList` — game event descriptor table
- `CSVCMsg_GameEvent` — individual game event instances
- `CSVCMsg_UserMessage` — user messages (chat, HUD text, etc.)
- `CNETMsg_Tick` — tick boundary marker

Protobuf decoding uses `ts-proto` generated code from Valve's vendored `.proto` files. The generated code lives in `src/generated/` and is checked into the repo. Runtime dependency: `protobufjs/minimal` (~15KB).

### Layer 4: Data Tables (`src/datatables/`)

The entity system is table-driven. Before any entities appear, the demo sends `SendTable` definitions that describe every property of every entity class.

**SendTable parsing:**
- Each SendTable has a name (e.g., `DT_CSPlayer`) and a list of property definitions (SendProps)
- SendProps have: name, type (Int, Float, Vector, Array, String, Int64, DataTable), flags, num bits, high/low value, num elements, and a data table name for DT_DataTable type props

**ServerClass registration:**
- `CSVCMsg_ClassInfo` maps numeric class IDs to ServerClass name + DataTable name pairs
- Each ServerClass points to a root SendTable

**Flattening:**
- SendTables form a hierarchy (via DataTable-type props that reference other SendTables)
- Flattening walks this hierarchy and produces a flat array of all properties for a ServerClass
- Must handle: exclusions (`SPROP_EXCLUDE`), collapsible tables (`SPROP_COLLAPSIBLE`), priority sorting
- The flattened property list determines the decode order for entity updates

This is split into four tasks because flattening is the most error-prone part of the entire parser. Getting it wrong means every entity decodes incorrectly.

### Layer 5: Entity System (`src/entities/`)

Entities are the core of the demo format. Every networked object (players, weapons, projectiles, C4, world entities) is an entity with a numeric ID and a set of properties.

**PacketEntities message processing:**
- Contains a delta-compressed stream of entity updates
- Each update specifies: entity ID, operation (create/update/delete/leave)
- For creates: includes ServerClass ID and serial number, then property values
- For updates: includes only changed properties (delta)
- Properties are identified by index into the flattened property list
- Property values are bit-packed according to the SendProp type and flags

**Property storage:**
- Flat array indexed by property index — O(1) read/write
- Each entity holds `properties: (PropertyValue | undefined)[]`
- No Map overhead, no hash lookups — pure array indexing

**Instance baselines:**
- String table `instancebaseline` contains default property values per ServerClass
- When creating an entity, baseline values are applied first, then the create delta on top
- Baselines themselves are decoded using the same property decoder

### Layer 6: Game State (`src/state/`)

Typed overlays on top of raw entity properties. These map entity properties to meaningful game concepts:

- **Player** — maps `CCSPlayer` / `CCSPlayerResource` properties to: name, steamId, team, position (x/y/z), angles, health, armor, hasHelmet, hasDefuser, money, kills, deaths, assists, score, mvps, weapons, activeWeapon, isAlive, flashDuration, etc.
- **Team** — maps `CCSTeam` properties to: name, score, side (CT/T), players
- **GameRules** — maps `CCSGameRulesProxy` properties to: round number, phase, bomb state, freeze time, round time, match phase
- **Weapon** — maps weapon entity properties to: type, name, clip ammo, reserve ammo, owner

Game state is rebuilt every tick from entity properties. No history retained — streaming-first, constant memory.

## Event System (`src/events/`)

Two sources of events:

1. **Game events** — defined by `CSVCMsg_GameEventList` (descriptor table) and emitted via `CSVCMsg_GameEvent`. Examples: `player_death`, `round_start`, `bomb_planted`. Each event has typed fields defined by its descriptor.

2. **Parser events** — synthetic events emitted by the parser itself: `tickStart`, `tickEnd`, `entityCreated`, `entityUpdated`, `entityDeleted`, `stringTableCreated`, `stringTableUpdated`, `datatablesReady`.

All events are emitted synchronously during parsing. The event types are fully typed via TypeScript generics on the `on()` method.

## Public API (`src/DemoParser.ts`, `src/index.ts`)

Two API levels:

### High-level: `DemoParser.parse(pathOrBuffer)`
```typescript
const demo = await DemoParser.parse('match.dem');
// Returns DemoResult with: header, players, kills, rounds, grenades, chatMessages, events
```
Parses the entire file and collects all data into a structured result object. Convenient for most use cases.

### Low-level: `DemoParser.fromFile(path)` / `DemoParser.fromBuffer(buffer)`
```typescript
const parser = await DemoParser.fromFile('match.dem');
parser.on('playerDeath', (event) => { /* ... */ });
await parser.parseAll();
```
Streaming event emitter. Subscribe to events, parse frame-by-frame. Constant memory. For power users processing huge files.

## Convenience Layer (`src/convenience/`)

Higher-level abstractions built on top of the event system:
- **Grenade tracker** — follows grenade entities from throw to detonation, builds trajectory arrays
- **Economy tracker** — tracks money, purchases, equipment value per player per round
- **Damage matrix** — who damaged whom, with what weapon, how much
- **Round tracker** — aggregates events into per-round summaries

## Dependencies

### Production (2 total)
- `protobufjs/minimal` (~15KB) — minimal protobuf runtime for decoding
- `snappyjs` — pure JS Snappy decompression (string table data is Snappy-compressed)

### Development
- `typescript` ~5.7 — compiler
- `tsup` — bundler (CJS + ESM dual output)
- `vitest` — test runner
- `eslint` + `prettier` — linting and formatting
- `ts-proto` — protobuf TypeScript code generation (build-time only)

## Data Model

### Core Types

```typescript
// Demo header (1072 bytes, fixed layout)
interface DemoHeader {
  magic: string;           // "HL2DEMO\0"
  demoProtocol: number;    // Demo protocol version (typically 4)
  networkProtocol: number; // Network protocol version
  serverName: string;      // Server hostname
  clientName: string;      // Recording client name
  mapName: string;         // Map name (e.g., "de_dust2")
  gameDirectory: string;   // Game directory (e.g., "csgo")
  playbackTime: number;    // Total playback time in seconds
  playbackTicks: number;   // Total tick count
  playbackFrames: number;  // Total frame count
  signonLength: number;    // Length of signon data
}

// Entity — the fundamental networked object
interface Entity {
  id: number;              // Entity index (0-2047)
  classId: number;         // ServerClass ID
  serialNumber: number;    // Serial for handle validation
  serverClass: ServerClass;
  properties: (PropertyValue | undefined)[];  // Flat array, O(1) access
}

// Player — typed overlay on CCSPlayer entity
interface Player {
  name: string;
  steamId: SteamId;
  team: TeamSide;          // CT | T | Spectator | Unassigned
  position: Vector3;
  angles: Vector3;
  health: number;
  armor: number;
  hasHelmet: boolean;
  hasDefuser: boolean;
  money: number;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
  mvps: number;
  isAlive: boolean;
  weapons: Weapon[];
  activeWeapon: Weapon | undefined;
  flashDuration: number;
  // ... 30+ properties
}

// High-level parse result
interface DemoResult {
  header: DemoHeader;
  players: Player[];
  kills: KillEvent[];
  rounds: Round[];
  grenades: GrenadeTrajectory[];
  chatMessages: ChatMessage[];
  events: GameEvent[];
}
```

### Entity Handle System

Entity handles in Source engine encode both entity index and serial number in a single 32-bit integer. The `utils/` module provides `handleToIndex(handle)` and `handleToSerial(handle)` for decomposition, and `isValidHandle(handle)` for validation. This is how weapon ownership, player resources, and other entity references are resolved.

### SteamId Utility

`utils/SteamId` converts between the different Steam ID formats:
- Steam2 ID: `STEAM_0:1:12345`
- Steam3 ID: `[U:1:24691]`
- Steam64 ID: `76561198000000001`

## Architecture Decision Records

### ADR-001: Streaming Over Query-Based

**Decision:** Event-emitter streaming architecture over query-based (like demoparser2).

**Context:** Two main approaches exist: (1) parse everything and query results, (2) stream events as they're parsed. demoparser2 (Rust/Python) uses approach 1. demoinfocs-golang uses approach 2.

**Rationale:**
- Constant memory regardless of demo size — critical for processing many files
- Natural fit for Node.js ecosystem (streams, EventEmitter)
- Can always build query on top of streaming (collect into arrays), but not vice versa
- Real-time processing use cases (live demo analysis) require streaming

**Rejected:** Query-based API as primary. We offer `DemoParser.parse()` as a high-level convenience that collects streamed data, giving users both options.

### ADR-002: ts-proto Over protobuf.js

**Decision:** Use `ts-proto` for code generation with `protobufjs/minimal` runtime.

**Context:** Need to decode Valve's protobuf messages. Options: (1) full `protobufjs` with runtime reflection, (2) `ts-proto` static code generation, (3) hand-written decoders.

**Rationale:**
- `ts-proto` generates idiomatic TypeScript with full type information
- Static code — no runtime schema parsing, tree-shakeable
- `protobufjs/minimal` runtime is only ~15KB
- Generated code is checked in — no build-time proto compilation needed for consumers
- Full type safety on all protobuf messages

**Rejected:** Full `protobufjs` (100KB+ runtime, weaker types). Hand-written decoders (maintenance nightmare with 100+ message types).

### ADR-003: Pure TypeScript Over Native (with Optional C++ Addon Later)

**Decision:** Pure TypeScript implementation first. Optional native C++ addon for hot paths as a separate track.

**Context:** Demo parsing is CPU-intensive. BitReader processes millions of calls. Native code would be faster.

**Rationale:**
- Pure TS works everywhere Node.js runs — no native compilation, no prebuild matrix
- Correctness first, performance second (Beck: "make it work, make it right, make it fast")
- V8 is surprisingly good at optimizing hot TypeScript code
- Native addon can be a drop-in replacement for BitReader and property decoders — same API, automatic fallback
- Separate package or optional dependency — users who don't need max throughput aren't burdened

**Plan:** TASK-082 through TASK-085 implement the native C++ addon track: spike, BitReader, property decoder, prebuildify packaging.

### ADR-004: Hybrid Type Safety for Entity Properties

**Decision:** Static typed overlays (Player, Team, etc.) on top of dynamic flat property arrays.

**Context:** Entity properties are fundamentally dynamic — their schema is defined at runtime by SendTables in the demo file. But consumers want typed access.

**Rationale:**
- Flat arrays give O(1) property access — no Map overhead
- Static overlays (Player, Team, Weapon) provide typed getters that read from the flat array
- Property indices are resolved once during SendTable flattening, then cached
- Type safety where it matters (public API), raw performance where it matters (inner decode loop)
- New entity types can be added without changing the core decode path

**Rejected:** Fully static typing (impossible — schema is in the demo file). Fully dynamic with Map (too slow for millions of updates). Class hierarchy per entity type (too many types, too rigid).

### ADR-005: Three-Tier Test Strategy

**Decision:** Unit tests + integration tests + golden file tests.

**Rationale:**
- **Unit tests** — test individual functions in isolation (BitReader, ByteReader, property decoders, SendTable flattener). Fast, deterministic, no .dem files needed.
- **Integration tests** — parse real .dem fixture files and verify extracted data (header values, entity counts, event sequences). Catches regressions in the full pipeline.
- **Golden file tests** — parse a fixture file, snapshot the output, compare against committed golden files. Detects any behavioral change, intentional or not.

Test fixture: `test/fixtures/de_dust2.dem` — a real CS:GO demo file used for integration and golden file tests.

### ADR-006: Snappy Decompression with snappyjs

**Decision:** Use `snappyjs` (pure JavaScript Snappy) for decompressing string table data.

**Context:** CS:GO demos compress string table data with Snappy. Need a decompression library.

**Rationale:**
- `snappyjs` is pure JavaScript — no native compilation needed
- Consistent with ADR-003 (pure TS/JS first)
- String table decompression is not a hot path (happens once during signon)
- Small library, well-tested, MIT licensed

**Rejected:** `snappy` (native N-API binding — adds native dependency). Hand-written Snappy decoder (not worth the effort for a non-hot path).

### Implementation-Level ADRs (`.claude/decisions/`)

Detailed ADRs that govern internal layers but don't affect the public architecture story above live in `.claude/decisions/`. They use an independent numbering scheme:

- **ADR-001** — SendTable flattening algorithm (M1)
- **ADR-002** — Entity property storage (flat columns vs. per-entity maps; M2)
- **ADR-003** — Event-system migration to `TypedEventEmitter` (M2)
- **ADR-004** — Overlay staleness, caching, and missing-entity semantics (M3)
- **ADR-005** — Typed overlay pattern: layout, naming, attachment (M3)
- **ADR-006** — Tier-1 event enrichment pattern: location, shape, userid resolution (M4)

## File Structure

```
counter-strike-demo-parser/
├── src/
│   ├── index.ts              # Public API re-exports
│   ├── DemoParser.ts         # Main parser class (both API levels)
│   ├── reader/               # Layer 1
│   │   ├── ByteReader.ts     # Byte-level binary reader
│   │   └── BitReader.ts      # Bit-level binary reader
│   ├── frame/                # Layer 2
│   │   ├── header.ts         # Demo header parser
│   │   └── FrameParser.ts    # Frame reading loop
│   ├── packet/               # Layer 3
│   │   ├── PacketDecoder.ts  # Protobuf message dispatch
│   │   └── messages.ts       # Message type registry
│   ├── proto/                # Protobuf decode re-exports
│   │   └── index.ts          # Re-exports from generated code
│   ├── datatables/           # Layer 4
│   │   ├── SendTable.ts      # SendTable/SendProp types
│   │   ├── ServerClass.ts    # ServerClass registry
│   │   ├── flatten.ts        # SendTable flattening algorithm
│   │   └── excludes.ts       # Exclusion gathering
│   ├── entities/             # Layer 5
│   │   ├── Entity.ts         # Entity class and property storage
│   │   ├── EntityList.ts     # Entity list management
│   │   ├── PropertyDecoder.ts # Property value decoders (int, float, vector, string, array, int64)
│   │   └── Baseline.ts       # Instance baseline management
│   ├── stringtables/         # String table management
│   │   ├── StringTable.ts    # StringTable class
│   │   └── StringTableManager.ts # Create/update dispatch
│   ├── state/                # Layer 6
│   │   ├── Player.ts         # Player state overlay
│   │   ├── Team.ts           # Team state overlay
│   │   ├── Weapon.ts         # Weapon state overlay
│   │   ├── GameRules.ts      # Game rules overlay
│   │   ├── RoundState.ts     # Round tracking
│   │   └── ServerInfo.ts     # Server metadata
│   ├── events/               # Event system
│   │   ├── EventDescriptor.ts # Game event descriptor parsing
│   │   ├── EventDecoder.ts   # Game event value decoding
│   │   ├── EventTypes.ts     # TypeScript event type definitions
│   │   └── EventEmitter.ts   # Typed event emitter
│   ├── convenience/          # High-level helpers
│   │   ├── GrenadeTracker.ts # Grenade trajectory tracking
│   │   ├── EconomyTracker.ts # Per-round economy
│   │   ├── DamageMatrix.ts   # Damage tracking
│   │   └── RoundTracker.ts   # Round aggregation
│   ├── enums/                # Game enums
│   │   ├── TeamSide.ts       # CT, T, Spectator, Unassigned
│   │   ├── WeaponType.ts     # Weapon categories
│   │   └── HitGroup.ts       # Hit group (head, chest, etc.)
│   └── utils/                # Shared utilities
│       ├── SteamId.ts        # Steam ID format conversion
│       └── EntityHandle.ts   # Entity handle bit manipulation
├── proto/                    # Vendored Valve .proto files
│   ├── netmessages.proto
│   ├── cstrike15_usermessages.proto
│   ├── cstrike15_gcmessages.proto
│   └── ...
├── src/generated/            # ts-proto generated code (checked in)
│   ├── netmessages.ts
│   └── ...
├── test/
│   ├── fixtures/             # Test .dem files
│   │   └── de_dust2.dem
│   ├── unit/                 # Unit tests
│   │   └── DemoParser.test.ts
│   └── integration/          # Integration tests (parse real demos)
├── examples/                 # Usage examples
├── scripts/                  # Build/generation scripts
│   └── generate-proto.sh     # Regenerate TS from .proto files
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc
└── README.md
```

## Build & Distribution

- **tsup** produces dual CJS (`dist/index.cjs`) + ESM (`dist/index.js`) output with TypeScript declarations
- `package.json` uses conditional exports (`import`/`require`) for automatic format selection
- Target: ES2022 (matches Node.js 22+ engine requirement)
- Source maps included for debugging
- Only `dist/` is published to npm (`"files": ["dist"]`)

## Performance Considerations

1. **BitReader hot path** — the innermost loop. Avoid allocations, minimize branching, use bitwise operations. Candidate for native C++ addon.
2. **Flat property arrays** — O(1) entity property access. No Map, no object key lookup.
3. **No tick history** — streaming-first means constant memory. State is overwritten each tick.
4. **Protobuf decoding** — `ts-proto` generates efficient decode methods. No runtime schema parsing.
5. **Snappy decompression** — only during signon phase, not a bottleneck.

---

## ADR-009: DemoParser.parse() — Async Convenience API Shape (TASK-062)

**Date:** 2026-05-04
**Status:** Accepted
**Type:** Type-1 (irreversible — public API contract)

### Decision

1. `static parse(buffer: Buffer): DemoParser` is renamed to `static parseSync(buffer: Buffer): DemoParser` (marked `@deprecated` in JSDoc).
2. A new `static async parse(input: string | Buffer, options?: ParseOptions): Promise<DemoResult>` replaces it as the primary entry point.
3. `DemoResult` and `ParseOptions` live in `src/convenience/DemoResult.ts`, exported from `src/index.ts`.
4. `DemoResult.events` is opt-in via `ParseOptions.includeRawEvents` (default `false`) to prevent memory blowup on competitive demos.
5. `DemoResult.rounds` ships as `RoundEndEvent[]` for TASK-062; TASK-066 will augment with per-round summaries.
6. `DemoResult.grenades` ships as `GrenadeThrownEvent[]` for TASK-062; TASK-063 will replace with trajectory objects.
7. Disconnected players are NOT included in `DemoResult.players` — entity list at dem_stop only contains live entities.

### Rationale

The async signature is justified by the string branch requiring genuine async I/O (`fs.promises.readFile`). The Buffer branch yields one event-loop tick via `setImmediate` before the synchronous parse to avoid surprising callers in server contexts. The union input type (`string | Buffer`) matches Node.js conventions and avoids doubling the documentation surface with two named statics.

### Rejected Alternatives

- **`parseFile` / `parseBuffer` named statics**: more verbose public surface, no ergonomic benefit over the union.
- **Always-on `events` array**: 20k–60k decoded objects on a competitive demo; estimated 5–10 MB peak allocation with no consumer benefit unless they specifically need it.
- **Keep `parse()` returning `DemoParser`**: conflicts with the v1.0 goal of making `DemoParser.parse()` the primary async convenience entry point for 80% of consumers.
- **Typed error class**: insufficient usage data to design a correct hierarchy pre-v1.0.
6. **Entity pooling** — reuse entity objects when entities are deleted and recreated (same ID slot).
