# Research: CS:GO Demo Parsing Deep Dive

> Researcher | 2026-04-03 | Confidence: Confirmed (based on Valve SDK source, existing parser analysis)

## BLUF

CS:GO `.dem` files use the Source Engine demo format: a binary container with a fixed header, sequential frames, protobuf-encoded network messages, and a table-driven entity system with delta compression. The format is undocumented by Valve but well reverse-engineered by the community. Three mature parsers exist in other languages that serve as reference implementations.

## Demo File Structure

### Header (1072 bytes, fixed layout)
```
Offset  Size  Field
0       8     Magic: "HL2DEMO\0"
8       4     Demo protocol version (typically 4)
12      4     Network protocol version
16      260   Server name (null-terminated string)
276     260   Client name (null-terminated string)
536     260   Map name (null-terminated string)
796     260   Game directory (null-terminated string, "csgo")
1056    4     Playback time (float, seconds)
1060    4     Playback ticks (int32)
1064    4     Playback frames (int32)
1068    4     Signon length (int32)
```

### Frame Structure
Each frame:
1. Command byte (uint8): identifies frame type
2. Tick number (int32): game tick when frame was recorded
3. Player slot (uint8): recording player slot
4. Command-specific data (variable length)

### Frame Types
| Cmd | Name | Description |
|-----|------|-------------|
| 1 | dem_signon | Signon packet (same format as dem_packet) |
| 2 | dem_packet | Network packet containing protobuf messages |
| 3 | dem_synctick | Sync marker (no data) |
| 4 | dem_consolecmd | Console command (length-prefixed string) |
| 5 | dem_usercmd | User command (outgoing sequence + data) |
| 6 | dem_datatables | SendTable definitions (appears once) |
| 7 | dem_stop | End of demo (no data) |
| 8 | dem_customdata | Custom data blob |
| 9 | dem_stringtables | String table snapshot |

### Packet Frame Internal Structure
`dem_signon` and `dem_packet` frames contain:
1. Command info (152 bytes): split/view origin/angles for two player slots
2. Sequence in (int32)
3. Sequence out (int32)
4. Data length (int32)
5. Data: stream of protobuf messages, each with varint command ID + varint size + payload

## Protobuf Messages

Valve defines messages in `.proto` files shipped with the CS:GO SDK. Key files:
- `netmessages.proto` — NET_* and SVC_* messages
- `cstrike15_usermessages.proto` — CS:GO-specific user messages
- `cstrike15_gcmessages.proto` — Game Coordinator messages

### Critical Message Types

**CSVCMsg_ServerInfo** — sent during signon, contains:
- Max classes (determines ClassInfo table size)
- Tick interval (e.g., 0.015625 for 64-tick, 0.0078125 for 128-tick)
- Map name, game dir, sky name

**CSVCMsg_SendTable** — defines entity property schemas:
- Table name (e.g., "DT_CSPlayer")
- Array of SendProp definitions
- `is_end` flag marks the end of the SendTable stream

**CSVCMsg_ClassInfo** — maps class IDs to names:
- Array of (class_id, data_table_name, class_name)
- `create_on_client` flag

**CSVCMsg_CreateStringTable / CSVCMsg_UpdateStringTable** — manages string tables:
- `instancebaseline` table contains default entity property values
- `userinfo` table contains player info
- `modelprecache`, `soundprecache` — asset precaching
- Data may be Snappy-compressed (flag in message)

**CSVCMsg_PacketEntities** — the big one:
- `max_entries` — max entity ID
- `updated_entries` — number of entities in this update
- `is_delta` — whether this is delta from a previous state
- `baseline` — baseline index
- `delta_from` — tick this is delta from (-1 for full update)
- `entity_data` — bit-packed entity updates

**CSVCMsg_GameEventList** — descriptor table:
- Array of event descriptors, each with: event_id, name, array of key definitions (name + type)
- Types: string, float, long, short, byte, bool, uint64, wstring

**CSVCMsg_GameEvent** — individual event instance:
- event_id (references GameEventList)
- Array of key values matching the descriptor

## Entity System

### SendTable / SendProp

SendProp types:
| Type | Value | Description |
|------|-------|-------------|
| DPT_Int | 0 | Integer (variable bit width) |
| DPT_Float | 1 | Float (various encodings) |
| DPT_Vector | 2 | 3D vector (three floats) |
| DPT_VectorXY | 3 | 2D vector (two floats, Z computed) |
| DPT_String | 4 | String |
| DPT_Array | 5 | Array of props |
| DPT_DataTable | 6 | Reference to another SendTable |
| DPT_Int64 | 7 | 64-bit integer |

SendProp flags (bitfield):
- `SPROP_UNSIGNED` (1<<0) — unsigned integer
- `SPROP_COORD` (1<<1) — coordinate encoding
- `SPROP_NOSCALE` (1<<2) — no float quantization
- `SPROP_ROUNDDOWN` (1<<3) — round float down
- `SPROP_ROUNDUP` (1<<4) — round float up
- `SPROP_NORMAL` (1<<5) — normal vector encoding
- `SPROP_EXCLUDE` (1<<6) — excluded from this table
- `SPROP_XYZE` (1<<7) — XYZ vector with sign bit for Z
- `SPROP_INSIDEARRAY` (1<<8) — element of an array prop
- `SPROP_PROXY_ALWAYS_YES` (1<<9)
- `SPROP_IS_A_VECTOR_ELEM` (1<<10)
- `SPROP_COLLAPSIBLE` (1<<11) — collapse into parent during flattening
- `SPROP_COORD_MP` (1<<12) — multiplayer coordinate encoding
- `SPROP_COORD_MP_LOWPRECISION` (1<<13)
- `SPROP_COORD_MP_INTEGRAL` (1<<14)
- `SPROP_CELL_COORD` (1<<15) — cell coordinate encoding
- `SPROP_CELL_COORD_LOWPRECISION` (1<<16)
- `SPROP_CELL_COORD_INTEGRAL` (1<<17)
- `SPROP_CHANGES_OFTEN` (1<<18) — hint for delta compression
- `SPROP_VARINT` (1<<19) — varint encoding for ints

### SendTable Flattening

The most complex algorithm in the parser. Steps:

1. **Gather exclusions** — walk the SendTable tree and collect all props with `SPROP_EXCLUDE` flag. An exclusion specifies (table_name, prop_name) to exclude.

2. **Collect non-excluded props** — walk the tree again, skipping excluded props and DataTable references. For DataTable props that are NOT collapsible, recurse into the referenced table and append its props.

3. **Handle collapsible tables** — DataTable props with `SPROP_COLLAPSIBLE` have their child props merged into the current level (no nesting).

4. **Priority sort** — sort the flattened props by priority value. Props with `SPROP_CHANGES_OFTEN` flag get priority 64. Sort is stable — equal priority props maintain their relative order. The sort algorithm: find all unique priorities, sort them, then for each priority level starting from 0, move matching props to the front of the remaining list.

The output is a flat array of `FlattenedSendProp` which is the decode template for that ServerClass's entities.

### Property Decoding

Each property type has its own decode function reading from the BitReader:

**Int decoding:**
- If `SPROP_VARINT`: read varint (signed or unsigned based on `SPROP_UNSIGNED`)
- Otherwise: read `numBits` bits, with sign handling based on `SPROP_UNSIGNED`

**Float decoding (complex, many sub-cases):**
- `SPROP_COORD` → `readBitCoord()` (integer part + fractional part, special encoding)
- `SPROP_COORD_MP` → `readBitCoordMP()` (multiplayer optimized)
- `SPROP_COORD_MP_LOWPRECISION` → `readBitCoordMPLowPrecision()`
- `SPROP_COORD_MP_INTEGRAL` → `readBitCoordMPIntegral()`
- `SPROP_NOSCALE` → `readBitFloat()` (raw 32-bit IEEE float)
- `SPROP_NORMAL` → `readBitNormal()` (11-bit encoded normal component)
- `SPROP_CELL_COORD` → `readBitCellCoord(numBits)`
- `SPROP_CELL_COORD_LOWPRECISION` → low-precision cell coord
- `SPROP_CELL_COORD_INTEGRAL` → integral cell coord
- Default → quantized float: read `numBits` bits, interpolate between `lowValue` and `highValue`

**Vector decoding:**
- Read three floats for Vector (or two for VectorXY, compute Z from normal)
- `SPROP_NORMAL` → `readBitNormal()` for each component + sign bit for Z

**String decoding:**
- Read length (max 512), then that many bytes

**Array decoding:**
- Read element count (bit width = log2(numElements)), then decode each element

**Int64 decoding:**
- If `SPROP_VARINT`: read as varint
- Otherwise: read as two 32-bit parts

### PacketEntities Processing

The `entity_data` field is a bit stream containing entity updates:

1. Read entity header: entity index delta (varint) + 2-bit operation code
   - 00: delta (update existing)
   - 01: leave PVS (enter dormant)
   - 10: enter PVS (create or re-enter)
   - 11: delete

2. For create operations:
   - Read class ID (`log2(maxClasses)` bits)
   - Read serial number (10 bits)
   - Look up ServerClass, get flattened props
   - Apply instance baseline (from string table)
   - Read property updates on top of baseline

3. For update operations:
   - Read changed property indices using "new way" encoding:
     - Read bit: if 1, next index is current + read varint + 1
     - If 0, read bit: if 1, next index is current + 1
     - Otherwise, read full index
   - Decode each changed property value using the prop's decoder

4. For delete operations:
   - Mark entity as deleted, free slot

## String Tables

String tables are key-value stores sent during signon and updated during the demo. Each table has a name, a max size, and entries with optional user data.

### Critical String Tables

- **instancebaseline** — default property values per ServerClass. Key is class ID (as string), value is a bit stream of property values decoded with the class's flattened props.
- **userinfo** — player connection info. Contains player_info_t struct (XUID, name, user ID, GUID, etc.)
- **modelprecache** — model name table for entity model indices
- **GameRulesCreation** — signals game rules entity creation

### String Table Encoding

String table entries use history-based encoding:
1. Read entry flag (1 bit): has entry string?
2. If yes, read substring reference flag (1 bit):
   - If 1: read index (5 bits) + length (5 bits) of substring from previous entries, then append remaining string
   - If 0: read full string
3. Read user data flag (1 bit): has user data?
4. If yes:
   - If table is fixed user data size: read fixed bytes
   - Otherwise: read length (14 bits) + data bytes

Data may be Snappy-compressed (indicated by flag in CreateStringTable message).

## Existing Parsers (Reference Implementations)

### demoinfocs-golang (Go)
- Most mature and complete CS:GO parser
- Streaming architecture (event-based)
- Excellent test coverage
- Primary reference for correctness verification
- GitHub: markus-wa/demoinfocs-golang

### demofile (JavaScript)
- Node.js, event-based
- Abandoned (last commit 3+ years ago)
- Incomplete entity support
- Useful as initial reference for the JS ecosystem's expectations
- GitHub: saul/demofile

### demoparser2 (Rust)
- Rust core with Python bindings
- Query-based API (not streaming)
- Very fast (Rust)
- Supports both CS:GO and CS2
- GitHub: LaihoE/demoparser

## Key Insights for Implementation

1. **Bit-level reading is the bottleneck.** The entity property decoder reads millions of bit-packed values. BitReader must be optimized for V8.

2. **SendTable flattening must be perfect.** A single bug in flattening means every entity decodes wrong. Test against known-good output from demoinfocs-golang.

3. **Instance baselines are tricky.** They're decoded lazily (when first entity of that class is created) and use the same property decoders. Must handle the case where baselines arrive after ClassInfo but before first entity create.

4. **String table history encoding is subtle.** The substring reference system uses a rolling history buffer. Off-by-one errors are common.

5. **Entity handle resolution is everywhere.** Weapons reference owners, players reference active weapon, teams reference players — all via entity handles. The handle-to-entity resolution must be fast and correct.

6. **Game events are the easy part.** Once you have the descriptor table, decoding events is straightforward protobuf + type dispatch.

7. **The demo format has quirks.** Some demos have trailing garbage data. Some have out-of-order packets. The parser must be defensive at boundaries and offensive in the core (assert invariants).
