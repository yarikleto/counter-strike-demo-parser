import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import type { ServerInfo } from "../../src/packet/ServerInfo.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("serverInfo event — integration with real demo file", () => {
  it("should emit serverInfo exactly once when parsing de_nuke.dem", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    const events: ServerInfo[] = [];

    parser.on("serverInfo", (info: ServerInfo) => {
      events.push(info);
    });

    parser.parseAll();

    expect(events).toHaveLength(1);
  });

  it("should decode serverInfo fields correctly from de_nuke.dem", () => {
    const parser = DemoParser.fromFile(FIXTURE_PATH);
    let serverInfo: ServerInfo | undefined;

    parser.on("serverInfo", (info: ServerInfo) => {
      serverInfo = info;
    });

    parser.parseAll();

    expect(serverInfo).toBeDefined();
    // Map name is exact — substring matching would mask field-number bugs.
    expect(serverInfo!.mapName).toBe("de_nuke");
    // CS:GO network protocol is a positive integer (~13800+ for modern demos).
    expect(serverInfo!.protocol).toBeGreaterThan(0);
    // CS:GO ships ~275 server classes; anything below 100 means we read the
    // wrong field.
    expect(serverInfo!.maxClasses).toBeGreaterThan(100);
    // Tick interval must be either 64-tick (1/64) or 128-tick (1/128).
    // de_nuke.dem fixture is a 128-tick demo.
    expect(serverInfo!.tickInterval).toBe(1 / 128);
  });
});
