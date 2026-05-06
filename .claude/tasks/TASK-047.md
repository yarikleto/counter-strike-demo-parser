# TASK-047: User messages (SayText, SayText2, TextMsg)

**Milestone:** 4 — Events
**Status:** `TODO`
**Size:** M | **Type:** vertical-slice
**Depends on:** TASK-009

**Goal:** Decode CSVCMsg_UserMessage payloads for chat-related user messages and emit typed chat events.

**Acceptance Criteria:**
- [ ] Decode SayText user messages (raw chat text)
- [ ] Decode SayText2 user messages (formatted chat: player name + message)
- [ ] Decode TextMsg user messages (server text messages)
- [ ] Emit `chatMessage` event with: sender (Player | undefined for server), message (string), isTeamChat (boolean)
- [ ] Handle the message formatting (replace %s1, %s2 placeholders)

**Cycle:** developer (implements + tests) -> reviewer
