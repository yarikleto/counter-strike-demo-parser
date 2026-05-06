# TASK-057: Custom data frame handling

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-003

**Goal:** Handle dem_customdata frames (type 8). These contain plugin-specific or custom data blobs.

**Acceptance Criteria:**
- [ ] Read custom data type and raw data buffer from the frame
- [ ] Emit `customData` event with type and data buffer
- [ ] Non-fatal: unknown custom data types are emitted as-is

**Cycle:** developer (implements + tests) -> reviewer
