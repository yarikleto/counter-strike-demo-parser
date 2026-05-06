# TASK-071a: Stream input support (DemoParser.fromStream)

**Milestone:** 6 — Convenience & DX
**Status:** `TODO`
**Size:** S | **Type:** convenience
**Depends on:** TASK-062

**Goal:** Accept a `ReadableStream` / Node.js `Readable` as input, buffer it internally, then parse. Ergonomic API for server-side use cases where demos arrive as HTTP upload streams.

**Acceptance Criteria:**
- [ ] `DemoParser.fromStream(readable)` accepts a Node.js `Readable` and returns a `Promise<DemoParser>`
- [ ] Internally collects all chunks into a Buffer, then constructs the parser
- [ ] Works with `http.IncomingMessage`, `fs.createReadStream`, and any standard Readable
- [ ] Integration test demonstrating stream-based parsing of the de_dust2.dem fixture

**Context:** Users running servers that accept demo file uploads via HTTP need to parse the stream without manually buffering. This is a convenience wrapper — no architectural changes to the parser pipeline. The parser still operates on a complete Buffer internally.

**Cycle:** developer (implements + tests) -> reviewer
