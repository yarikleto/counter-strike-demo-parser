# TASK-060: Defensive parsing: unknown message types

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-009

**Goal:** Handle unknown or unimplemented protobuf message types gracefully. Different CS:GO versions may have different message IDs.

**Acceptance Criteria:**
- [ ] Unknown message command IDs: read and skip the payload bytes (using the size field), log at debug level
- [ ] Never throw on an unknown message type
- [ ] Emit `unknownMessage` event with command ID and raw data for power users who need it

**Cycle:** developer (implements + tests) -> reviewer
