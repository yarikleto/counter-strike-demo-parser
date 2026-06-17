# TASK-068: Chat message collection

**Milestone:** 6 — Convenience & DX
**Status:** `TODO`
**Size:** S | **Type:** vertical-slice
**Depends on:** TASK-047

**Goal:** Collect all chat messages into a typed array accessible in DemoResult.

**Acceptance Criteria:**
- [ ] ChatMessage type: tick, sender (Player | undefined for server), message, isTeamChat
- [ ] Collected from SayText/SayText2 user message events
- [ ] Available in DemoResult.chatMessages after parse completes

**Cycle:** developer (implements + tests) -> reviewer
