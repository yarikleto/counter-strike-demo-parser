import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ByteReader } from "../../src/reader/ByteReader.js";
import { parseHeader } from "../../src/frame/header.js";
import { iterateFrames } from "../../src/frame/FrameParser.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("frame iteration — integration with real demo file", () => {
  it("should yield frames from de_nuke.dem after the header", () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const reader = new ByteReader(buffer);
    parseHeader(reader);

    const frames = [];
    for (const frame of iterateFrames(reader)) {
      frames.push(frame);
    }

    expect(frames.length).toBeGreaterThan(0);
  });

  it("should terminate without hanging", () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const reader = new ByteReader(buffer);
    parseHeader(reader);

    let count = 0;
    for (const _frame of iterateFrames(reader)) {
      count++;
    }

    // Iteration completed — count is finite and positive
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(1_000_000);
  });

  it("should include packet frames with data", () => {
    const buffer = readFileSync(FIXTURE_PATH);
    const reader = new ByteReader(buffer);
    parseHeader(reader);

    let packetFrameCount = 0;
    for (const frame of iterateFrames(reader)) {
      if (frame.packetData !== undefined) {
        packetFrameCount++;
      }
    }

    expect(packetFrameCount).toBeGreaterThan(0);
  });
});
