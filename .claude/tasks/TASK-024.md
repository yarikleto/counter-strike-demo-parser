# TASK-024: Snappy decompression for string tables

**Milestone:** 2 — Core Protocol
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-022

**Goal:** Add Snappy decompression support for string table data. Some CreateStringTable messages have compressed data that must be decompressed before parsing entries.

**Acceptance Criteria:**
- [ ] Detect compression flag in CreateStringTable message
- [ ] Decompress data using snappyjs before parsing entries
- [ ] Add `snappyjs` as a production dependency
- [ ] Works correctly for the `instancebaseline` table (which is typically compressed)

**Cycle:** developer (implements + tests) -> reviewer
