# TASK-051: Voice data extraction (raw CELT frames)

**Milestone:** 5 — Advanced Data
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-009

**Goal:** Extract voice data from CSVCMsg_VoiceData messages and expose raw CELT-encoded audio frames.

**Acceptance Criteria:**
- [ ] Decode CSVCMsg_VoiceData messages (client index, proximity, data)
- [ ] Emit `voiceData` event with: player (Player), data (Buffer of raw CELT frames)
- [ ] No audio decoding — just extract the raw compressed frames

**Cycle:** developer (implements + tests) -> reviewer
