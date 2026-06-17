# TASK-059: Defensive parsing: malformed/truncated demos

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-026

**Goal:** Handle gracefully the common ways demo files can be malformed: truncated files, corrupted frames, unexpected EOF, invalid protobuf payloads.

**Acceptance Criteria:**
- [ ] Truncated file (unexpected EOF during frame read): emit `parserError` event and stop cleanly
- [ ] Invalid frame command byte: skip frame with warning, continue parsing
- [ ] Corrupted protobuf payload: catch decode error, skip message, continue
- [ ] Parser always reaches a clean stop state, never throws unrecoverable exceptions during parse
- [ ] All error events include tick number and byte offset for debugging

**Cycle:** developer (implements + tests) -> reviewer
