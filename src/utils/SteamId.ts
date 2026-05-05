/**
 * SteamId — convert between the three interchangeable representations of a
 * Steam account number used throughout the Source / Steam ecosystem.
 *
 * A Steam ID is fundamentally a 64-bit integer that packs a universe, an
 * account type, an instance, and a 32-bit account-id. For an individual
 * user the upper 32 bits are the constant `0x0110000100000000`, leaving the
 * lower 32 bits — the *account-id* — as the only varying piece. Every
 * representation in this class is a bit-pattern projection of that one
 * 32-bit account-id.
 *
 * Three textual forms exist in the wild and a parser library has to deal
 * with all of them:
 *
 *   - **Steam64** — the canonical numeric form, e.g. `76561198000000001`.
 *     Used by Steam community URLs (`steamcommunity.com/profiles/<steam64>`)
 *     and by demo wire formats (`UserInfo.xuid`, `m_iAccountID` is the
 *     low 32 bits of this). 64 bits doesn't fit in a JS `number` without
 *     precision loss past 2^53, so we model it as `bigint`.
 *   - **Steam2 (legacy)** — `STEAM_X:Y:Z` where `X` is the universe digit
 *     (`0` in CSGO demos, `1` in modern Steam clients), `Y` is
 *     `accountId & 1` (the parity bit), and `Z` is `accountId >> 1`.
 *     Surfaces in older parsers and the CSGO console.
 *   - **Steam3 (modern)** — `[U:1:NNNN]` where `NNNN` is the full 32-bit
 *     account-id and `1` is the public-universe digit. Used by modern
 *     Source tooling and matchmaking APIs.
 *
 * Conversion math:
 *
 *     STEAM64_BASE = 0x0110000100000000n  // 76561197960265728n
 *     accountId    = Number(steam64 - STEAM64_BASE)
 *     steam64      = STEAM64_BASE + BigInt(accountId)
 *     steam2       = `STEAM_0:${accountId & 1}:${accountId >> 1}`
 *     steam3       = `[U:1:${accountId}]`
 *
 * Instances are immutable and frozen at construction; equality is by
 * `accountId` (the canonical projection).
 *
 * @example
 * ```ts
 * const id = SteamId.fromSteam64("76561198000000001");
 * id.toSteam2(); // "STEAM_0:1:19867136"
 * id.toSteam3(); // "[U:1:39734273]"
 * id.accountId;  // 39734273
 * ```
 */

/**
 * Upper 32 bits of every Steam64 for an individual user account.
 *
 * Layout: `[ universe=1 | accountType=1 | instance=1 | accountId=0 ]`.
 * Adding the 32-bit account-id to this base yields the full Steam64.
 */
const STEAM64_BASE = 0x0110000100000000n;

/** 2^32. Used to bound `accountId` so it fits in 32 unsigned bits. */
const ACCOUNT_ID_LIMIT = 0x100000000;

/** Strict Steam2 regex: `STEAM_<universe>:<parity>:<half>`. */
const STEAM2_PATTERN = /^STEAM_([0-1]):([0-1]):(\d+)$/;

/** Strict Steam3 regex: `[U:1:<accountId>]`. */
const STEAM3_PATTERN = /^\[U:1:(\d+)\]$/;

/** Decimal-only Steam64 string (no sign, no leading +, no whitespace). */
const STEAM64_PATTERN = /^\d+$/;

/**
 * Thrown by `SteamId.fromSteam2`, `fromSteam3`, and `fromSteam64` when the
 * input doesn't match the expected shape, or by `fromAccountId` /
 * `fromSteam64` when the resulting account-id falls outside `[0, 2^32)`.
 *
 * Subclasses `Error` so it can be caught with `instanceof Error` while
 * still being distinguishable from generic errors via `instanceof
 * SteamIdParseError`.
 */
export class SteamIdParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SteamIdParseError";
  }
}

/**
 * A frozen, immutable Steam ID. Construct via the static factory methods —
 * the constructor is private to enforce input validation.
 */
export class SteamId {
  /** 32-bit account-id. Canonical projection — all three forms derive from this. */
  readonly accountId: number;

  /** 64-bit Steam ID as a `bigint`. Equal to `STEAM64_BASE + BigInt(accountId)`. */
  readonly steam64: bigint;

  private constructor(accountId: number) {
    this.accountId = accountId;
    this.steam64 = STEAM64_BASE + BigInt(accountId);
    Object.freeze(this);
  }

  /**
   * Build from a 32-bit account-id (the lower 32 bits of the Steam64 form,
   * a.k.a. `m_iAccountID` on the wire).
   *
   * @throws {SteamIdParseError} if `accountId` is not a non-negative integer
   *   below `2^32`. Negative values, fractional values, `NaN`, and values
   *   `>= 2^32` are all rejected — silently truncating would alias two
   *   distinct accounts to the same instance.
   */
  static fromAccountId(accountId: number): SteamId {
    if (!Number.isInteger(accountId)) {
      throw new SteamIdParseError(
        `accountId must be an integer, got ${accountId}`,
      );
    }
    if (accountId < 0 || accountId >= ACCOUNT_ID_LIMIT) {
      throw new SteamIdParseError(
        `accountId out of 32-bit unsigned range [0, 2^32): ${accountId}`,
      );
    }
    return new SteamId(accountId);
  }

  /**
   * Build from a Steam64 ID. Accepts both `bigint` and `string` — the wire
   * formats this library decodes (e.g. `UserInfo.xuid`) hand back decimal
   * strings, while application code that's already done arithmetic will
   * have a `bigint`.
   *
   * @throws {SteamIdParseError} if `id` is a string that isn't a decimal
   *   integer, if the value is below `STEAM64_BASE` (would yield a negative
   *   account-id), or if the resulting account-id is `>= 2^32`.
   */
  static fromSteam64(id: bigint | string): SteamId {
    let value: bigint;
    if (typeof id === "string") {
      if (!STEAM64_PATTERN.test(id)) {
        throw new SteamIdParseError(
          `Steam64 string must be a non-negative decimal integer, got ${JSON.stringify(id)}`,
        );
      }
      value = BigInt(id);
    } else {
      value = id;
    }

    if (value < STEAM64_BASE) {
      throw new SteamIdParseError(
        `Steam64 ${value.toString()} is below the individual-account base (${STEAM64_BASE.toString()})`,
      );
    }

    const accountId = value - STEAM64_BASE;
    if (accountId >= BigInt(ACCOUNT_ID_LIMIT)) {
      throw new SteamIdParseError(
        `Steam64 ${value.toString()} yields accountId ${accountId.toString()} which exceeds 32-bit range`,
      );
    }

    return new SteamId(Number(accountId));
  }

  /**
   * Build from a Steam2 string (`STEAM_X:Y:Z`).
   *
   * Accepts universe digit `0` (the form CSGO demos use) or `1` (the form
   * modern Steam clients emit). Both render to the same account, so the
   * universe is parsed only to validate shape — the universe is fixed to
   * `0` by `toSteam2()` for consistency with demo wire conventions.
   *
   * Rejects:
   *   - Universe digits other than `0` or `1` (e.g. `STEAM_2:` or `STEAM_X:`).
   *   - Parity digits other than `0` or `1`.
   *   - Whitespace, lowercase prefix, missing brackets, extra fields.
   *   - Half-account values that overflow 32-bit (`Z * 2 + Y >= 2^32`).
   *
   * @throws {SteamIdParseError} on any malformed input.
   */
  static fromSteam2(text: string): SteamId {
    const match = STEAM2_PATTERN.exec(text);
    if (match === null) {
      throw new SteamIdParseError(
        `Malformed Steam2 ID: ${JSON.stringify(text)} (expected STEAM_<0|1>:<0|1>:<digits>)`,
      );
    }
    // match[1] is the universe digit — accepted but unused; toSteam2()
    // always emits `STEAM_0:` to match CSGO demo conventions.
    const parity = Number(match[2]);
    const half = Number(match[3]);

    // Reconstruct accountId. We do the bound check in BigInt-space so we
    // can reject overflow without relying on JS numeric coercion.
    const accountIdBig = BigInt(half) * 2n + BigInt(parity);
    if (accountIdBig >= BigInt(ACCOUNT_ID_LIMIT)) {
      throw new SteamIdParseError(
        `Steam2 ID ${text} encodes accountId ${accountIdBig.toString()} which exceeds 32-bit range`,
      );
    }

    return new SteamId(Number(accountIdBig));
  }

  /**
   * Build from a Steam3 string (`[U:1:NNNN]`).
   *
   * Strictly accepts only the bracketed individual-account form with the
   * literal universe digit `1` — Steam3 has additional forms for groups,
   * clans, and game servers (`[g:`, `[c:`, `[G:`, ...) but those don't map
   * to player Steam IDs and are out of scope for this parser.
   *
   * Rejects:
   *   - Missing brackets, lowercase `u`, wrong universe digit, extra fields.
   *   - Non-decimal account-ids, account-ids `>= 2^32`.
   *
   * @throws {SteamIdParseError} on any malformed input.
   */
  static fromSteam3(text: string): SteamId {
    const match = STEAM3_PATTERN.exec(text);
    if (match === null) {
      throw new SteamIdParseError(
        `Malformed Steam3 ID: ${JSON.stringify(text)} (expected [U:1:<digits>])`,
      );
    }
    const accountIdBig = BigInt(match[1]!);
    if (accountIdBig >= BigInt(ACCOUNT_ID_LIMIT)) {
      throw new SteamIdParseError(
        `Steam3 ID ${text} encodes accountId ${accountIdBig.toString()} which exceeds 32-bit range`,
      );
    }
    return new SteamId(Number(accountIdBig));
  }

  /**
   * Render as `STEAM_0:Y:Z` — the legacy form CSGO demos and the in-game
   * console use. The universe digit is fixed to `0` to match demo wire
   * conventions; `fromSteam2` accepts both `0` and `1` on input.
   */
  toSteam2(): string {
    const parity = this.accountId & 1;
    const half = this.accountId >>> 1;
    return `STEAM_0:${parity}:${half}`;
  }

  /** Render as `[U:1:NNNN]` — the modern Source / matchmaking form. */
  toSteam3(): string {
    return `[U:1:${this.accountId}]`;
  }

  /** Return the Steam64 form as a `bigint`. Same as the `steam64` field. */
  toSteam64(): bigint {
    return this.steam64;
  }

  /**
   * Human-readable form. Delegates to `toSteam3()` because the bracketed
   * form is unambiguous at a glance — Steam2 omits the universe and
   * Steam64 looks like an opaque integer.
   */
  toString(): string {
    return this.toSteam3();
  }

  /**
   * Equality by `accountId` (the canonical projection). Two `SteamId`
   * instances built from any of the three forms are equal iff they
   * represent the same account.
   */
  equals(other: SteamId): boolean {
    return this.accountId === other.accountId;
  }
}
