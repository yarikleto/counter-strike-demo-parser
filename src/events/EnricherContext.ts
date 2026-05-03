/**
 * EnricherContext — read-only snapshot of parser state passed to every
 * Tier-1 game-event enricher (ADR-006).
 *
 * Built fresh inside `DemoParser.handleGameEvent` immediately before each
 * enricher call. Holding a single `EnricherContext` across calls is invalid
 * because the underlying overlays (`players`, `gameRules`, `teams`) are
 * memoized arrays whose membership shifts as entities arrive — building per-
 * call costs one stack frame and three property reads, far cheaper than
 * teaching enrichers when to invalidate.
 *
 * `resolvePlayer(userId)` is the single canonical bridge from the wire-level
 * `userid` integer carried on CS:GO game events to a live `Player` overlay.
 * Its absent-cases (`userId === 0`, disconnect-mid-tick, slot present in
 * userinfo but no Player overlay yet built) all surface as `undefined` per
 * ADR-006 decision 3 — never a sentinel "World" Player. Tier-1 enrichers
 * that need the userinfo-decoded display name even when the Player overlay
 * isn't resolvable can still go through `userInfoIndex.infoForUserId` for
 * the disconnect-after-frag case.
 */
import type { Player } from "../state/Player.js";
import type { Team } from "../state/Team.js";
import type { GameRules } from "../state/GameRules.js";
import type { EntityList } from "../entities/EntityList.js";
import type { UserInfoIndex } from "../state/userInfoIndex.js";
import type { DemoParser } from "../DemoParser.js";

export interface EnricherContext {
  readonly players: readonly Player[];
  readonly entities: EntityList;
  readonly gameRules: GameRules | undefined;
  readonly teams: readonly Team[];
  readonly userInfoIndex: UserInfoIndex;
  /**
   * Resolve a CS:GO event `userid` to a live `Player` overlay. Returns
   * `undefined` when (a) the userid isn't currently in the userinfo index
   * (player disconnected, or `userid === 0` for engine-emitted events), or
   * (b) the userid resolves to an entity slot but no `Player` overlay
   * exists at that slot yet (entity not created or already deleted).
   */
  resolvePlayer(userId: number): Player | undefined;
}

/**
 * Build a per-event context. The returned object is frozen so an enricher
 * can't mutate the parser through it. The cost is a single object-literal
 * allocation per game event — see ADR-006 decision 8 (~50k events per
 * competitive demo, trivial against the entity decode cost).
 */
export function buildEnricherContext(parser: DemoParser): EnricherContext {
  const players = parser.players;
  const userInfoIndex = parser.userInfoIndex;
  const ctx: EnricherContext = {
    players,
    entities: parser.entities,
    gameRules: parser.gameRules,
    teams: parser.teams,
    userInfoIndex,
    resolvePlayer(userId: number): Player | undefined {
      const tableSlot = userInfoIndex.entitySlotForUserId(userId);
      if (tableSlot === undefined) return undefined;
      // `userInfoIndex.entitySlotForUserId` returns the userinfo
      // string-table slot (0..63). `Player.slot` is the underlying CCSPlayer
      // entity id, which CS:GO assigns as `tableSlot + 1` — entity 0 is the
      // engine's reserved world entity, players occupy entity ids 1..64.
      // Verified empirically on de_nuke.dem (e.g. userid 131 → tableSlot 0
      // → entity.id 1 for "Brian"). The `+1` is the canonical bridge.
      const entityId = tableSlot + 1;
      for (const p of players) {
        if (p.slot === entityId) return p;
      }
      return undefined;
    },
  };
  return Object.freeze(ctx);
}
