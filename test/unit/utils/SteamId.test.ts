import { describe, it, expect } from "vitest";
import { SteamId, SteamIdParseError } from "../../../src/utils/SteamId.js";

/**
 * Reference vectors verified against community Steam ID converters and the
 * known base `0x0110000100000000n` (76561197960265728n).
 *
 *   STEAM_0:1:0        ↔ [U:1:1]         ↔ 76561197960265729n  (accountId 1)
 *   STEAM_0:0:1        ↔ [U:1:2]         ↔ 76561197960265730n  (accountId 2)
 *   STEAM_0:1:19867136 ↔ [U:1:39734273]  ↔ 76561198000000001n  (accountId 39734273)
 */
const VECTORS = [
  {
    steam64: 76561197960265729n,
    steam2: "STEAM_0:1:0",
    steam3: "[U:1:1]",
    accountId: 1,
  },
  {
    steam64: 76561197960265730n,
    steam2: "STEAM_0:0:1",
    steam3: "[U:1:2]",
    accountId: 2,
  },
  {
    steam64: 76561198000000001n,
    steam2: "STEAM_0:1:19867136",
    steam3: "[U:1:39734273]",
    accountId: 39734273,
  },
] as const;

describe("SteamId — Steam64 ↔ Steam2 round-trip", () => {
  for (const v of VECTORS) {
    it(`${v.steam64.toString()} ↔ ${v.steam2}`, () => {
      const fromS64 = SteamId.fromSteam64(v.steam64);
      expect(fromS64.toSteam2()).toBe(v.steam2);
      expect(fromS64.accountId).toBe(v.accountId);

      const fromS2 = SteamId.fromSteam2(v.steam2);
      expect(fromS2.toSteam64()).toBe(v.steam64);
      expect(fromS2.steam64).toBe(v.steam64);
      expect(fromS2.accountId).toBe(v.accountId);
    });
  }
});

describe("SteamId — Steam64 ↔ Steam3 round-trip", () => {
  for (const v of VECTORS) {
    it(`${v.steam64.toString()} ↔ ${v.steam3}`, () => {
      const fromS64 = SteamId.fromSteam64(v.steam64);
      expect(fromS64.toSteam3()).toBe(v.steam3);

      const fromS3 = SteamId.fromSteam3(v.steam3);
      expect(fromS3.toSteam64()).toBe(v.steam64);
      expect(fromS3.accountId).toBe(v.accountId);
    });
  }
});

describe("SteamId.fromSteam64 — string input", () => {
  it("parses decimal-string form identically to bigint form", () => {
    const fromString = SteamId.fromSteam64("76561198000000001");
    const fromBigint = SteamId.fromSteam64(76561198000000001n);
    expect(fromString.equals(fromBigint)).toBe(true);
    expect(fromString.accountId).toBe(39734273);
    expect(fromString.toSteam64()).toBe(76561198000000001n);
  });

  it("rejects non-decimal strings", () => {
    expect(() => SteamId.fromSteam64("0x123")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam64("123abc")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam64("-1")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam64(" 76561198000000001")).toThrow(
      SteamIdParseError,
    );
    expect(() => SteamId.fromSteam64("")).toThrow(SteamIdParseError);
  });

  it("rejects values below the individual-account base", () => {
    expect(() => SteamId.fromSteam64(0n)).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam64(76561197960265727n)).toThrow(
      SteamIdParseError,
    );
  });

  it("rejects values whose accountId would overflow 32 bits", () => {
    // STEAM64_BASE + 2^32
    expect(() =>
      SteamId.fromSteam64(76561197960265728n + 0x100000000n),
    ).toThrow(SteamIdParseError);
  });
});

describe("SteamId.fromSteam2 — universe acceptance", () => {
  it("accepts the STEAM_0: prefix (CSGO demo form)", () => {
    const id = SteamId.fromSteam2("STEAM_0:1:19867136");
    expect(id.accountId).toBe(39734273);
  });

  it("accepts the STEAM_1: prefix (modern Steam form) for the same account", () => {
    const id = SteamId.fromSteam2("STEAM_1:1:19867136");
    expect(id.accountId).toBe(39734273);
    expect(id.toSteam64()).toBe(76561198000000001n);
  });

  it("rejects STEAM_2: and other unknown universes", () => {
    expect(() => SteamId.fromSteam2("STEAM_2:1:0")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam2("STEAM_9:1:0")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam2("STEAM_X:1:0")).toThrow(SteamIdParseError);
  });

  it("rejects malformed Steam2 strings", () => {
    expect(() => SteamId.fromSteam2("")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam2("STEAM_0:1")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam2("STEAM_0:2:0")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam2("steam_0:1:0")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam2("STEAM_0:1:0:0")).toThrow(
      SteamIdParseError,
    );
    expect(() => SteamId.fromSteam2("STEAM_0:1:abc")).toThrow(
      SteamIdParseError,
    );
    expect(() => SteamId.fromSteam2(" STEAM_0:1:0")).toThrow(
      SteamIdParseError,
    );
    expect(() => SteamId.fromSteam2("[U:1:1]")).toThrow(SteamIdParseError);
  });
});

describe("SteamId.fromSteam3 — strict shape", () => {
  it("rejects malformed [X:Y:N] shapes", () => {
    expect(() => SteamId.fromSteam3("U:1:1")).toThrow(SteamIdParseError); // no brackets
    expect(() => SteamId.fromSteam3("[u:1:1]")).toThrow(SteamIdParseError); // lowercase
    expect(() => SteamId.fromSteam3("[U:0:1]")).toThrow(SteamIdParseError); // wrong universe
    expect(() => SteamId.fromSteam3("[U:2:1]")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam3("[g:1:1]")).toThrow(SteamIdParseError); // group
    expect(() => SteamId.fromSteam3("[U:1:]")).toThrow(SteamIdParseError); // empty id
    expect(() => SteamId.fromSteam3("[U:1:abc]")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam3("[U:1:1")).toThrow(SteamIdParseError); // no closing
    expect(() => SteamId.fromSteam3("U:1:1]")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam3("")).toThrow(SteamIdParseError);
    expect(() => SteamId.fromSteam3("STEAM_0:1:0")).toThrow(SteamIdParseError);
  });

  it("rejects accountId values that overflow 32 bits", () => {
    // 2^32 = 4294967296 — one past the max valid accountId.
    expect(() => SteamId.fromSteam3("[U:1:4294967296]")).toThrow(
      SteamIdParseError,
    );
  });
});

describe("SteamId.fromAccountId — bounds", () => {
  it("accepts 0 and 2^32 - 1", () => {
    expect(SteamId.fromAccountId(0).accountId).toBe(0);
    expect(SteamId.fromAccountId(0xffffffff).accountId).toBe(0xffffffff);
  });

  it("rejects negative, fractional, NaN, and >=2^32 inputs", () => {
    expect(() => SteamId.fromAccountId(-1)).toThrow(SteamIdParseError);
    expect(() => SteamId.fromAccountId(1.5)).toThrow(SteamIdParseError);
    expect(() => SteamId.fromAccountId(Number.NaN)).toThrow(SteamIdParseError);
    expect(() => SteamId.fromAccountId(0x100000000)).toThrow(
      SteamIdParseError,
    );
    expect(() => SteamId.fromAccountId(Number.POSITIVE_INFINITY)).toThrow(
      SteamIdParseError,
    );
  });
});

describe("SteamId.equals — cross-factory equality", () => {
  it("returns true for the same account built from different forms", () => {
    const a = SteamId.fromSteam64(76561198000000001n);
    const b = SteamId.fromSteam2("STEAM_0:1:19867136");
    const c = SteamId.fromSteam3("[U:1:39734273]");
    const d = SteamId.fromSteam64("76561198000000001");
    const e = SteamId.fromAccountId(39734273);
    expect(a.equals(b)).toBe(true);
    expect(b.equals(c)).toBe(true);
    expect(c.equals(d)).toBe(true);
    expect(d.equals(e)).toBe(true);
  });

  it("returns false for different accounts", () => {
    const a = SteamId.fromSteam64(76561197960265729n);
    const b = SteamId.fromSteam64(76561197960265730n);
    expect(a.equals(b)).toBe(false);
  });
});

describe("SteamId — toString and immutability", () => {
  it("toString delegates to toSteam3", () => {
    const id = SteamId.fromAccountId(39734273);
    expect(id.toString()).toBe("[U:1:39734273]");
    expect(`${id}`).toBe("[U:1:39734273]");
  });

  it("instances are frozen", () => {
    const id = SteamId.fromAccountId(1);
    expect(Object.isFrozen(id)).toBe(true);
  });

  it("toSteam2 always emits the STEAM_0: universe", () => {
    // Even though fromSteam2 accepts STEAM_1:, we round-trip via the
    // demo-canonical STEAM_0: form to match CSGO wire conventions.
    const id = SteamId.fromSteam2("STEAM_1:1:19867136");
    expect(id.toSteam2()).toBe("STEAM_0:1:19867136");
  });
});
