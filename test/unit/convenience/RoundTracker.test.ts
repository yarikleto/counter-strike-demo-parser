/**
 * Unit tests for `ConvenienceRoundTracker` (TASK-066).
 *
 * The tracker is tested by directly calling its `on*` handler methods with
 * minimal stub events — no real DemoParser or fixture files needed. This keeps
 * the tests fast and focused on the aggregation logic.
 *
 * Key scenarios:
 *   - Warmup guard: round_end with no preceding round_start → not pushed.
 *   - Events outside any round (warmup kills/hurts) → dropped silently.
 *   - MVP attaches to the just-closed round even when fired after round_end.
 *   - Per-player stats (kills / deaths / assists / damage) are aggregated.
 *   - Bomb events accumulate into the correct bucket.
 *   - Multiple rounds produce correct sequential summaries.
 */

import { describe, it, expect } from "vitest";
import { ConvenienceRoundTracker } from "../../../src/convenience/RoundTracker.js";
import { TeamSide } from "../../../src/enums/TeamSide.js";
import { RoundEndReason } from "../../../src/enums/RoundEndReason.js";
import type { RoundStartEvent } from "../../../src/events/enrichers/roundStart.js";
import type { RoundEndEvent } from "../../../src/events/enrichers/roundEnd.js";
import type { RoundMvpEvent } from "../../../src/events/enrichers/roundMvp.js";
import type { PlayerHurtEvent } from "../../../src/events/enrichers/playerHurt.js";
import type { ItemPurchaseEvent } from "../../../src/events/enrichers/itemPurchase.js";
import type { Player } from "../../../src/state/Player.js";
import type { PlayerRef } from "../../../src/convenience/PlayerRoster.js";
import type { BombRecord, KillRecord } from "../../../src/convenience/records.js";

// ---------------------------------------------------------------------------
// Stub helpers — minimal objects that satisfy the enriched event interfaces.
// ---------------------------------------------------------------------------

function makeRoundStart(roundNumber = 0): RoundStartEvent {
  return Object.freeze({
    eventName: "round_start",
    eventId: 1,
    timeLimit: 115,
    fragLimit: 0,
    objective: "BOMB TARGET",
    roundNumber,
  });
}

function makeRoundEnd(
  roundNumber = 0,
  winner: number = TeamSide.CT,
  reason: number = RoundEndReason.CTWin,
): RoundEndEvent {
  return Object.freeze({
    eventName: "round_end",
    eventId: 2,
    winner: winner as TeamSide,
    reason,
    message: "#SFUI_Notice_Target_Bombed",
    roundNumber,
  });
}

/**
 * Player stub. Without an attached parser the tracker has no roster and
 * takes event players as already-plain refs, so one object serves as both
 * the `Player` an event carries and the `PlayerRef` the summary stores.
 */
function makePlayer(slot: number): Player & PlayerRef {
  const ref: PlayerRef = {
    index: slot,
    slot,
    userId: slot + 100,
    name: `player${slot}`,
    steamId: undefined,
    team: 2,
  };
  return ref as unknown as Player & PlayerRef;
}

function makePlayerDeath(
  victim: PlayerRef,
  attacker?: PlayerRef,
  assister?: PlayerRef,
): KillRecord {
  return {
    tick: 0,
    victim,
    attacker,
    assister,
    weapon: "ak47",
    headshot: false,
    penetrated: false,
    noscope: false,
    thrusmoke: false,
    attackerblind: false,
    attackerPosition: attacker !== undefined ? { x: 0, y: 0, z: 0 } : undefined,
    victimPosition: { x: 1, y: 1, z: 0 },
  };
}

function makePlayerHurt(victim: Player, attacker: Player, damage: number): PlayerHurtEvent {
  return Object.freeze({
    eventName: "player_hurt",
    eventId: 4,
    victim,
    attacker,
    weapon: "weapon_ak47",
    damage,
    damageArmor: 0,
    hitGroup: 1,
    healthRemaining: 100 - damage,
    armorRemaining: 100,
  });
}

function makeBomb(type: BombRecord["type"], player?: PlayerRef, site = 0): BombRecord {
  return {
    type,
    tick: 0,
    player,
    position: { x: 0, y: 0, z: 0 },
    site: "A",
    siteEntityIndex: site,
  };
}

function makeRoundMvp(player: Player): RoundMvpEvent {
  return Object.freeze({ eventName: "round_mvp", eventId: 8, player, reason: 1 });
}

function makeItemPurchase(player: Player): ItemPurchaseEvent {
  return Object.freeze({ eventName: "item_purchase", eventId: 9, player, item: "weapon_ak47" });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConvenienceRoundTracker", () => {
  it("returns empty snapshot before any events", () => {
    const tracker = new ConvenienceRoundTracker();
    expect(tracker.snapshot()).toEqual([]);
  });

  it("warmup guard: round_end during warmup is not pushed", () => {
    const tracker = new ConvenienceRoundTracker();
    (tracker as unknown as { isWarmup: () => boolean }).isWarmup = () => true;
    tracker.onRoundEnd(makeRoundEnd(0));
    tracker.onRoundEnd(makeRoundEnd(0));
    expect(tracker.snapshot()).toHaveLength(0);
  });

  it("drops the Game Commencing pseudo round end", () => {
    const tracker = new ConvenienceRoundTracker();
    tracker.onRoundEnd(makeRoundEnd(0, TeamSide.Spectator, RoundEndReason.GameStart));
    expect(tracker.snapshot()).toHaveLength(0);
  });

  it("keeps a live round_end that has no preceding round_start", () => {
    // Regression (club vertigo demo): GOTV recording began after round 1's
    // round_start, so round 1 only had begin_new_match + round_end. A round
    // with a round_end must never be dropped.
    const tracker = new ConvenienceRoundTracker();
    let tick = 8197;
    (tracker as unknown as { getTick: () => number }).getTick = () => tick;
    tracker.onRoundEnd(makeRoundEnd(0, TeamSide.CT, RoundEndReason.CTWin));
    tick = 9097;
    tracker.onRoundStart(makeRoundStart(1));
    tick = 18119;
    tracker.onRoundEnd(makeRoundEnd(1, TeamSide.T, RoundEndReason.TWin));

    const rounds = tracker.snapshot();
    expect(rounds.map((r) => r.number)).toEqual([1, 2]);
    expect(rounds[0]!.startTick).toBe(0);
    expect(rounds[0]!.endTick).toBe(8197);
    expect(rounds[0]!.winner).toBe(TeamSide.CT);
    expect(rounds[1]!.startTick).toBe(9097);
  });

  it("begin_new_match opens round 1 so its kills are collected", () => {
    const tracker = new ConvenienceRoundTracker();
    const victim = makePlayer(2);
    tracker.onBeginNewMatch({ eventName: "begin_new_match", eventId: 10 });
    tracker.onKill(makePlayerDeath(victim, makePlayer(1)));
    tracker.onRoundEnd(makeRoundEnd(0));

    const rounds = tracker.snapshot();
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.kills).toHaveLength(1);
  });

  it("emits a round summary after round_start → round_end", () => {
    const tracker = new ConvenienceRoundTracker();
    tracker.onRoundStart(makeRoundStart(0));
    tracker.onRoundEnd(makeRoundEnd(0, TeamSide.CT, RoundEndReason.CTWin));

    const rounds = tracker.snapshot();
    expect(rounds).toHaveLength(1);
    const r = rounds[0]!;
    expect(r.number).toBe(1); // roundNumber 0 + 1
    expect(r.winner).toBe(TeamSide.CT);
    expect(r.endReason).toBe(RoundEndReason.CTWin);
    expect(r.mvp).toBeUndefined();
    expect(r.kills).toHaveLength(0);
    expect(r.players.length).toBe(0);
    expect(r.bombEvents.plants).toHaveLength(0);
    expect(r.bombEvents.defuses).toHaveLength(0);
    expect(r.bombEvents.explosions).toHaveLength(0);
  });

  it("round number is 1-based (roundNumber from event + 1)", () => {
    const tracker = new ConvenienceRoundTracker();
    tracker.onRoundStart(makeRoundStart());
    tracker.onRoundEnd(makeRoundEnd(4)); // totalRoundsPlayed=4 → round number 5

    expect(tracker.snapshot()[0]!.number).toBe(5);
  });

  it("kills outside any round are dropped silently", () => {
    const tracker = new ConvenienceRoundTracker();
    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    // Warmup kill — should be dropped
    tracker.onKill(makePlayerDeath(p1, p2));

    tracker.onRoundStart(makeRoundStart());
    tracker.onRoundEnd(makeRoundEnd());

    expect(tracker.snapshot()[0]!.kills).toHaveLength(0);
  });

  it("hurts outside any round are dropped silently", () => {
    const tracker = new ConvenienceRoundTracker();
    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    // Warmup hurt — should be dropped
    tracker.onHurt(makePlayerHurt(p1, p2, 50));

    tracker.onRoundStart(makeRoundStart());
    tracker.onRoundEnd(makeRoundEnd());

    const round = tracker.snapshot()[0]!;
    expect(round.players.length).toBe(0);
  });

  it("accumulates kills within a round", () => {
    const tracker = new ConvenienceRoundTracker();
    const p1 = makePlayer(1);
    const p2 = makePlayer(2);
    const p3 = makePlayer(3);

    tracker.onRoundStart(makeRoundStart());
    tracker.onKill(makePlayerDeath(p1, p2)); // p2 kills p1
    tracker.onKill(makePlayerDeath(p2, p3)); // p3 kills p2
    tracker.onRoundEnd(makeRoundEnd());

    const round = tracker.snapshot()[0]!;
    expect(round.kills).toHaveLength(2);
  });

  it("per-player stats: kills / deaths / assists / damage are aggregated", () => {
    const tracker = new ConvenienceRoundTracker();
    const attacker = makePlayer(1);
    const victim = makePlayer(2);
    const assister = makePlayer(3);

    tracker.onRoundStart(makeRoundStart());
    // attacker deals damage before the kill
    tracker.onHurt(makePlayerHurt(victim, attacker, 80));
    // attacker gets kill credit with assister
    tracker.onKill(makePlayerDeath(victim, attacker, assister));
    tracker.onRoundEnd(makeRoundEnd());

    const round = tracker.snapshot()[0]!;

    const attackerStats = round.players.find((st) => st.player.slot === attacker.slot)!;
    expect(attackerStats.kills).toBe(1);
    expect(attackerStats.deaths).toBe(0);
    expect(attackerStats.assists).toBe(0);
    expect(attackerStats.damage).toBe(80);

    const victimStats = round.players.find((st) => st.player.slot === victim.slot)!;
    expect(victimStats.kills).toBe(0);
    expect(victimStats.deaths).toBe(1);
    expect(victimStats.assists).toBe(0);

    const assisterStats = round.players.find((st) => st.player.slot === assister.slot)!;
    expect(assisterStats.assists).toBe(1);
    expect(assisterStats.kills).toBe(0);
  });

  it("world-kill (attacker undefined) credits only the victim's death", () => {
    const tracker = new ConvenienceRoundTracker();
    const victim = makePlayer(1);

    tracker.onRoundStart(makeRoundStart());
    tracker.onKill(makePlayerDeath(victim, undefined)); // world kill
    tracker.onRoundEnd(makeRoundEnd());

    const round = tracker.snapshot()[0]!;
    // Only victim creates a stats entry — no attacker
    expect(round.players.length).toBe(1);
    const victimStats = round.players.find((st) => st.player.slot === victim.slot)!;
    expect(victimStats.deaths).toBe(1);
  });

  it("MVP attaches to the most-recently-closed round after round_end", () => {
    const tracker = new ConvenienceRoundTracker();
    const mvpPlayer = makePlayer(5);

    tracker.onRoundStart(makeRoundStart());
    tracker.onRoundEnd(makeRoundEnd());
    // round_mvp fires AFTER round_end in CS:GO wire order
    tracker.onMvp(makeRoundMvp(mvpPlayer));

    const round = tracker.snapshot()[0]!;
    expect(round.mvp).toBe(mvpPlayer);
  });

  it("MVP fired just before round_end (CS:GO wire order) attaches to that round", () => {
    const tracker = new ConvenienceRoundTracker();
    const mvpPlayer = makePlayer(7);

    tracker.onRoundStart(makeRoundStart());
    tracker.onMvp(makeRoundMvp(mvpPlayer));
    tracker.onRoundEnd(makeRoundEnd());

    expect(tracker.snapshot()[0]!.mvp).toBe(mvpPlayer);
  });

  it("MVP before any round is ignored gracefully", () => {
    const tracker = new ConvenienceRoundTracker();
    const mvpPlayer = makePlayer(5);

    // MVP with no closed rounds → ignored
    tracker.onMvp(makeRoundMvp(mvpPlayer));
    expect(tracker.snapshot()).toHaveLength(0);
  });

  it("bomb events accumulate into correct buckets", () => {
    const tracker = new ConvenienceRoundTracker();
    const planter = makePlayer(1);
    const defuser = makePlayer(2);

    tracker.onRoundStart(makeRoundStart());
    tracker.onBomb(makeBomb("planted", planter, 174));
    tracker.onBomb(makeBomb("defused", defuser, 174));
    tracker.onRoundEnd(makeRoundEnd());

    const round = tracker.snapshot()[0]!;
    expect(round.bombEvents.plants).toHaveLength(1);
    expect(round.bombEvents.plants[0]!.player).toBe(planter);
    expect(round.bombEvents.defuses).toHaveLength(1);
    expect(round.bombEvents.explosions).toHaveLength(0);
  });

  it("bomb_exploded lands in explosions bucket", () => {
    const tracker = new ConvenienceRoundTracker();
    const planter = makePlayer(1);

    tracker.onRoundStart(makeRoundStart());
    tracker.onBomb(makeBomb("planted", planter));
    tracker.onBomb(makeBomb("exploded", undefined, 174));
    tracker.onRoundEnd(makeRoundEnd(0, TeamSide.T));

    const round = tracker.snapshot()[0]!;
    expect(round.bombEvents.explosions).toHaveLength(1);
    expect(round.bombEvents.defuses).toHaveLength(0);
  });

  it("bomb events outside any round are dropped", () => {
    const tracker = new ConvenienceRoundTracker();
    const planter = makePlayer(1);

    // Warmup bomb plant
    tracker.onBomb(makeBomb("planted", planter));

    tracker.onRoundStart(makeRoundStart());
    tracker.onRoundEnd(makeRoundEnd());

    const round = tracker.snapshot()[0]!;
    expect(round.bombEvents.plants).toHaveLength(0);
  });

  it("multiple rounds produce correct sequential summaries", () => {
    const tracker = new ConvenienceRoundTracker();

    // Round 1 (roundNumber=0 → number=1)
    tracker.onRoundStart(makeRoundStart());
    tracker.onRoundEnd(makeRoundEnd(0, TeamSide.CT));

    // Round 2 (roundNumber=1 → number=2)
    tracker.onRoundStart(makeRoundStart());
    tracker.onRoundEnd(makeRoundEnd(1, TeamSide.T));

    // Round 3 (roundNumber=2 → number=3)
    tracker.onRoundStart(makeRoundStart());
    tracker.onRoundEnd(makeRoundEnd(2, TeamSide.CT));

    const rounds = tracker.snapshot();
    expect(rounds).toHaveLength(3);
    expect(rounds[0]!.number).toBe(1);
    expect(rounds[0]!.winner).toBe(TeamSide.CT);
    expect(rounds[1]!.number).toBe(2);
    expect(rounds[1]!.winner).toBe(TeamSide.T);
    expect(rounds[2]!.number).toBe(3);
    expect(rounds[2]!.winner).toBe(TeamSide.CT);
  });

  it("kills from one round do not bleed into the next", () => {
    const tracker = new ConvenienceRoundTracker();
    const p1 = makePlayer(1);
    const p2 = makePlayer(2);

    // Round 1: 2 kills
    tracker.onRoundStart(makeRoundStart());
    tracker.onKill(makePlayerDeath(p1, p2));
    tracker.onKill(makePlayerDeath(p2, p1));
    tracker.onRoundEnd(makeRoundEnd());

    // Round 2: 0 kills
    tracker.onRoundStart(makeRoundStart());
    tracker.onRoundEnd(makeRoundEnd(1));

    const rounds = tracker.snapshot();
    expect(rounds[0]!.kills).toHaveLength(2);
    expect(rounds[1]!.kills).toHaveLength(0);
  });

  it("item_purchase records the item on the buyer's round economy", () => {
    const tracker = new ConvenienceRoundTracker();
    const buyer = makePlayer(1);

    tracker.onRoundStart(makeRoundStart());
    tracker.onItemPurchase(makeItemPurchase(buyer));
    tracker.onRoundEnd(makeRoundEnd());

    const stats = tracker.snapshot()[0]!.players.find((st) => st.player.slot === 1)!;
    expect(stats.economy?.purchases).toEqual(["weapon_ak47"]);
  });

  it("bomb steps other than planted/defused/exploded stay out of the buckets", () => {
    const tracker = new ConvenienceRoundTracker();
    tracker.onRoundStart(makeRoundStart());
    tracker.onBomb(makeBomb("begin_plant", makePlayer(1)));
    tracker.onBomb(makeBomb("dropped", makePlayer(1)));
    tracker.onRoundEnd(makeRoundEnd());

    const { plants, defuses, explosions } = tracker.snapshot()[0]!.bombEvents;
    expect(plants.length + defuses.length + explosions.length).toBe(0);
  });

  it("startTick and endTick come from the getTick closure", () => {
    // Directly test tick capture by manipulating the tracker's internal
    // getTick via re-assigning the private field via a type cast.
    const tracker = new ConvenienceRoundTracker();
    let tick = 100;
    // Patch the private getTick via a cast — acceptable in unit tests since
    // this is pure behaviour verification of the closure capture.
    (tracker as unknown as { getTick: () => number }).getTick = () => tick;

    tracker.onRoundStart(makeRoundStart()); // tick = 100 → startTick
    tick = 250;
    tracker.onRoundEnd(makeRoundEnd()); // tick = 250 → endTick

    const round = tracker.snapshot()[0]!;
    expect(round.startTick).toBe(100);
    expect(round.endTick).toBe(250);
  });
});
