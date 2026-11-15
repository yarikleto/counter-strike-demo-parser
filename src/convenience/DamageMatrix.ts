/**
 * DamageMatrix — accumulates `player_hurt` event data into per-pair damage
 * entries, both for the full match and broken down per round.
 *
 * Each unique (attacker, victim) pair is keyed by `${attackerSlot}|${victimSlot}`.
 * Player slot is the 1-based CCSPlayer entity id — stable within a round and
 * consistent with the convention used by ConvenienceRoundTracker.
 *
 * Self-damage (attacker === victim, same slot) is stored as its own entry.
 * This is intentional: kill-feed analytics and utility-damage summaries need
 * to distinguish self-damage (flash, nade) from outgoing damage.
 *
 * World-damage / fall-damage events where `attacker` is `undefined` are
 * silently skipped: there is no meaningful attacker identity to key on, and
 * surfacing them as a separate "world attacker" entry would break the
 * per-pair aggregation contract.
 *
 * Per-round bucketing (roundIndex is 0-based, matching DemoResult.rounds):
 *   - Round boundaries come from {@link RoundBuckets}, the same rules
 *     `DemoResult.rounds` uses: `round_start` / `begin_new_match` open a
 *     round, `round_end` commits it, and a live `round_end` whose start was
 *     never recorded still counts as a round.
 *   - `player_hurt` accumulates into both the match map and the open round's
 *     map. Events between rounds (warmup, after the match) accumulate into
 *     the match map only.
 */

import type { DemoParser } from "../DemoParser.js";
import type { Player } from "../state/Player.js";
import type { HitGroup } from "../enums/HitGroup.js";
import type { PlayerHurtEvent } from "../events/enrichers/playerHurt.js";
import { RoundBuckets } from "./RoundBuckets.js";

/** Composite key for a (attacker, victim) pair: `"${attackerSlot}|${victimSlot}"`. */
type Key = `${number}|${number}`;

/**
 * Aggregated damage record for a single (attacker, victim) pair.
 *
 * `weapons` maps the weapon name string (e.g. `"weapon_ak47"`, `"weapon_awp"`)
 * to the number of hits landed with that weapon. Hits from an empty or missing
 * weapon name are stored under the literal `"unknown"`.
 *
 * `hitGroups` maps the {@link HitGroup} enum value (or a raw integer for
 * forward-compat with future Source builds) to the number of hits on that
 * group.
 */
export interface DamageEntry {
  /** The player who dealt the damage. */
  readonly attacker: Player;
  /** The player who received the damage. */
  readonly victim: Player;
  /** Total HP damage dealt across all hits in this bucket. */
  totalDamage: number;
  /** Total armor damage dealt across all hits in this bucket. */
  totalArmorDamage: number;
  /** Total number of individual hits recorded. */
  hitCount: number;
  /**
   * Per-weapon hit counts. Keys are the weapon name as reported by the
   * `player_hurt` event (e.g. `"weapon_ak47"`). Hits with no weapon name are
   * stored under `"unknown"`.
   */
  readonly weapons: Map<string, number>;
  /**
   * Per-hitgroup hit counts. Keys are {@link HitGroup} enum values or raw
   * integers for hitgroups not yet known to this version of the parser.
   */
  readonly hitGroups: Map<HitGroup | number, number>;
}

/**
 * DamageMatrix — full-match and per-round damage aggregation.
 *
 * Attach to a `DemoParser` before `parseAll()`. After parsing, call `.get()`
 * and `.getForRound()` to retrieve aggregated data, or iterate via
 * `.entries()` / `.entriesForRound()`.
 *
 * @example
 * ```ts
 * const matrix = new DamageMatrix();
 * matrix.attach(parser);
 * parser.parseAll();
 *
 * for (const entry of matrix.entries()) {
 *   console.log(entry.attacker.name, '->', entry.victim.name, entry.totalDamage);
 * }
 * ```
 */
export class DamageMatrix {
  /** Full-match aggregation map. */
  private readonly match = new Map<Key, DamageEntry>();

  /** Per-round maps, indexed like `DemoResult.rounds`. */
  private readonly rounds = new RoundBuckets<Map<Key, DamageEntry>>(() => new Map());

  /**
   * Wire the matrix to a parser by subscribing to the round boundary events
   * and `player_hurt`. Must be called before `parser.parseAll()`.
   */
  attach(parser: DemoParser): void {
    this.rounds.attach(parser);
    parser.on("player_hurt", (e) => this.onHurt(e));
  }

  // -------------------------------------------------------------------------
  // Full-match accessors
  // -------------------------------------------------------------------------

  /**
   * Return the aggregated `DamageEntry` for the given (attacker, victim) pair
   * across the entire match, or `undefined` if no hurt events were recorded
   * for that pair.
   *
   * @param attackerSlot - `Player.slot` of the damage dealer.
   * @param victimSlot   - `Player.slot` of the damage receiver.
   */
  get(attackerSlot: number, victimSlot: number): DamageEntry | undefined {
    return this.match.get(this.key(attackerSlot, victimSlot));
  }

  /**
   * Iterate over all full-match `DamageEntry` records.
   * Includes self-damage pairs (attacker slot === victim slot).
   */
  entries(): IterableIterator<DamageEntry> {
    return this.match.values();
  }

  // -------------------------------------------------------------------------
  // Per-round accessors
  // -------------------------------------------------------------------------

  /**
   * Return the aggregated `DamageEntry` for the given (attacker, victim) pair
   * in a specific round, or `undefined` if no hurt events were recorded for
   * that pair in that round.
   *
   * @param roundIndex   - 0-based round index (matches `DemoResult.rounds`).
   * @param attackerSlot - `Player.slot` of the damage dealer.
   * @param victimSlot   - `Player.slot` of the damage receiver.
   */
  getForRound(
    roundIndex: number,
    attackerSlot: number,
    victimSlot: number,
  ): DamageEntry | undefined {
    return this.rounds.at(roundIndex)?.get(this.key(attackerSlot, victimSlot));
  }

  /**
   * Iterate over all `DamageEntry` records for a specific round.
   * Returns an empty iterator when `roundIndex` is out of range.
   *
   * @param roundIndex - 0-based round index (matches `DemoResult.rounds`).
   */
  entriesForRound(roundIndex: number): IterableIterator<DamageEntry> {
    return (this.rounds.at(roundIndex) ?? new Map<Key, DamageEntry>()).values();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Build the composite key for a (attacker, victim) slot pair. */
  private key(attackerSlot: number, victimSlot: number): Key {
    return `${attackerSlot}|${victimSlot}`;
  }

  /**
   * Accumulate a single `player_hurt` event into both the match map and the
   * current round's map (if a round is in progress).
   */
  private onHurt(e: PlayerHurtEvent): void {
    // World-damage / fall-damage: attacker is undefined — skip silently.
    // There is no stable attacker identity to key on for these events.
    if (e.attacker === undefined) return;

    const k = this.key(e.attacker.slot, e.victim.slot);

    // Accumulate into the full-match map.
    this.accumulate(this.match, k, e.attacker, e.victim, e);

    // Accumulate into the open round's map, if a round is in progress.
    const roundMap = this.rounds.openBucket;
    if (roundMap !== undefined) this.accumulate(roundMap, k, e.attacker, e.victim, e);
  }

  /**
   * Get-or-create a `DamageEntry` in `map` for `key` and merge the hurt
   * event data into it.
   */
  private accumulate(
    map: Map<Key, DamageEntry>,
    k: Key,
    attacker: Player,
    victim: Player,
    e: PlayerHurtEvent,
  ): void {
    let entry = map.get(k);
    if (entry === undefined) {
      entry = {
        attacker,
        victim,
        totalDamage: 0,
        totalArmorDamage: 0,
        hitCount: 0,
        weapons: new Map(),
        hitGroups: new Map(),
      };
      map.set(k, entry);
    }

    entry.totalDamage += e.damage;
    entry.totalArmorDamage += e.damageArmor;
    entry.hitCount += 1;

    // Weapon key: use the weapon name if non-empty, otherwise "unknown".
    const weaponKey = e.weapon.length > 0 ? e.weapon : "unknown";
    entry.weapons.set(weaponKey, (entry.weapons.get(weaponKey) ?? 0) + 1);

    // HitGroup key: the HitGroup enum value (or raw integer for forward-compat).
    entry.hitGroups.set(e.hitGroup, (entry.hitGroups.get(e.hitGroup) ?? 0) + 1);
  }
}
