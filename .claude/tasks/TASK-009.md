# TASK-009: Packet message dispatch

**Milestone:** 1 — Foundation
**Status:** `DONE`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-003, TASK-004

**Goal:** Decode the stream of protobuf messages within packet frames and dispatch each message to the correct handler based on its command ID.

**Acceptance Criteria:**
- [ ] Reads varint command ID + varint size for each message in a packet
- [ ] Maps command IDs to protobuf message types (NET_*, SVC_*)
- [ ] Decodes each message using ts-proto generated decoders
- [ ] Dispatches decoded messages to registered handlers
- [ ] Unknown message types are logged and skipped (not fatal)

**Cycle:** developer (implements + tests) -> reviewer
