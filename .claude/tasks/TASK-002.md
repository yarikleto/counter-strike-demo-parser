# TASK-002: ByteReader + demo header parsing

**Milestone:** 0 — Walking Skeleton
**Status:** `DONE`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-001

**Goal:** A ByteReader class that reads typed values from a Buffer, and a header parser that extracts the 1072-byte demo header into a typed `DemoHeader` object.

**Acceptance Criteria:**
- [x] ByteReader reads: int32, uint32, float32, bytes(n), string (null-terminated, fixed-length), and tracks cursor position
- [x] DemoHeader type defined with all fields (magic, protocol versions, server/client/map name, playback time/ticks/frames, signon length)
- [x] Header parser validates magic string `"HL2DEMO\0"` and throws on invalid demos
- [x] Parsing the `de_dust2.dem` fixture extracts correct header values (map name, tick count)

**Cycle:** developer (implements + tests) -> reviewer
