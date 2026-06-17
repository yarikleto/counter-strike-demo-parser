# TASK-003: Frame reading + first protobuf decode + first event

**Milestone:** 0 — Walking Skeleton
**Status:** `DONE`
**Size:** M | **Type:** vertical-slice

> **2026-04-28 — review round-trip.** First pass was rejected before commit: `decodeServerInfo` used wrong protobuf field numbers (5/8/11 vs Valve's 12/16/14), and the integration test had been fitted to pass against the resulting garbage (`toContain("de_nuke")` against a 60-byte corrupted blob, with a comment admitting `tickInterval` was wrong). `protobufjs` was added but never imported. Developer fixed field numbers against `netmessages.proto`, switched all reads through `ByteReader` for bounds safety, dropped the unused `protobufjs` dep, and tightened tests to exact-value assertions. Decoder now produces `mapName="de_nuke"`, `tickInterval=1/128`, `maxClasses=284`, `protocol=13881` against `de_nuke.dem`. Reviewer APPROVED on round 2.
**Depends on:** TASK-002

**Goal:** Read frames from the demo file after the header, identify frame types, and for packet frames, extract and decode at least one protobuf message (CSVCMsg_ServerInfo). Emit a `serverInfo` event proving the full pipeline works end-to-end.

**Acceptance Criteria:**
- [ ] FrameParser reads command byte, tick, player slot for each frame
- [ ] Correctly identifies all frame types (dem_signon through dem_stringtables)
- [ ] Packet frames: reads command info (152 bytes), sequences, data length, and raw data
- [ ] At least one protobuf message (CSVCMsg_ServerInfo) is decoded from the fixture
- [ ] A typed event is emitted when ServerInfo is encountered
- [ ] Parsing stops cleanly at dem_stop frame

**Cycle:** developer (implements + tests) -> reviewer
