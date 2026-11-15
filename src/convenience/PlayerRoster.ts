/**
 * PlayerRoster — stable, plain-data identities for everyone seen in a demo.
 *
 * The streaming API hands out live `Player` overlays, which point into the
 * parser's entity store. They are the right tool while parsing, but cannot
 * leave the parser: they are not serializable, and a `Player` held past a
 * disconnect reads whatever entity later reuses that slot. The convenience
 * layer therefore converts every player it records into a {@link PlayerRef}
 * at event time.
 *
 * Each distinct person gets a roster `index` that stays the same for the
 * whole demo — across reconnects (keyed by SteamID64) and slot reuse. The
 * index is what joins kills, grenades, rounds and the columnar position
 * samples in `DemoResult`.
 *
 * One roster exists per parser ({@link PlayerRoster.for}), so independent
 * trackers attached to the same parser agree on indices.
 */
import type { DemoParser } from "../DemoParser.js";
import type { Player, Vector3 } from "../state/Player.js";
import type { UserInfoIndex } from "../state/userInfoIndex.js";

/** A player as it was at the moment an event was recorded. Plain data. */
export interface PlayerRef {
  /** Index into `DemoResult.players`; stable for the whole demo. */
  readonly index: number;
  /** CCSPlayer entity id (1-based connection slot) at the time. */
  readonly slot: number;
  /** Engine user id at the time; changes when a player reconnects. */
  readonly userId: number | undefined;
  /** Display name at the time ("" if userinfo was not available yet). */
  readonly name: string;
  /** SteamID64 as a decimal string; `undefined` for bots. */
  readonly steamId: string | undefined;
  /** `m_iTeamNum` at the time: 0 unassigned, 1 spectator, 2 T, 3 CT. */
  readonly team: number;
}

/** One roster entry in `DemoResult.players`. */
export interface PlayerInfo {
  /** Position in `DemoResult.players`; the value `PlayerRef.index` refers to. */
  readonly index: number;
  /** Most recent display name. */
  readonly name: string;
  /** SteamID64 as a decimal string; `undefined` for bots. */
  readonly steamId: string | undefined;
  /** Most recent engine user id. */
  readonly userId: number | undefined;
  readonly isBot: boolean;
  /** Most recent team seen (`m_iTeamNum`). */
  readonly team: number;
}

interface MutableInfo {
  index: number;
  name: string;
  steamId: string | undefined;
  userId: number | undefined;
  isBot: boolean;
  team: number;
}

const rosters = new WeakMap<DemoParser, PlayerRoster>();

export class PlayerRoster {
  private readonly entries: MutableInfo[] = [];
  /** Identity key (SteamID64, or a bot/slot fallback) → roster index. */
  private readonly byKey = new Map<string, number>();
  /** Engine user id → roster index. Hot-path cache for position sampling. */
  private readonly byUserId = new Map<number, number>();

  constructor(private readonly userInfoIndex: UserInfoIndex) {}

  /** The roster shared by every convenience tracker attached to `parser`. */
  static for(parser: DemoParser): PlayerRoster {
    let roster = rosters.get(parser);
    if (roster === undefined) {
      roster = new PlayerRoster(parser.userInfoIndex);
      rosters.set(parser, roster);
    }
    return roster;
  }

  /** Roster index of `player`, registering them on first sight. */
  indexOf(player: Player): number {
    const userId = this.userInfoIndex.userIdForEntitySlot(player.slot - 1);
    if (userId !== undefined) {
      const cached = this.byUserId.get(userId);
      if (cached !== undefined) return cached;
    }
    const info = userId !== undefined ? this.userInfoIndex.infoForUserId(userId) : undefined;
    const steamId = info !== undefined && info.xuid !== "0" ? info.xuid : undefined;
    const key =
      steamId ?? (info !== undefined ? `bot:${info.name}` : `slot:${player.slot}:${userId ?? "?"}`);
    let index = this.byKey.get(key);
    if (index === undefined) {
      index = this.entries.length;
      this.entries.push({
        index,
        name: info?.name ?? "",
        steamId,
        userId,
        isBot: info?.isFakePlayer ?? false,
        team: 0,
      });
      this.byKey.set(key, index);
    }
    const entry = this.entries[index]!;
    entry.userId = userId;
    if (info !== undefined) entry.name = info.name;
    if (userId !== undefined) this.byUserId.set(userId, index);
    return index;
  }

  /** Capture `player` as a plain {@link PlayerRef} at the current tick. */
  ref(player: Player): PlayerRef {
    const index = this.indexOf(player);
    const entry = this.entries[index]!;
    const userId = this.userInfoIndex.userIdForEntitySlot(player.slot - 1);
    const name =
      (userId !== undefined ? this.userInfoIndex.infoForUserId(userId)?.name : undefined) ??
      entry.name;
    const team = player.team;
    entry.name = name;
    if (team !== 0) entry.team = team;
    return { index, slot: player.slot, userId, name, steamId: entry.steamId, team };
  }

  /** Same as {@link ref}, but passes `undefined` through. */
  refOrUndefined(player: Player | undefined): PlayerRef | undefined {
    return player === undefined ? undefined : this.ref(player);
  }

  /** Record a team observation without allocating a ref (position sampling). */
  noteTeam(index: number, team: number): void {
    if (team !== 0) this.entries[index]!.team = team;
  }

  /** Plain copy of the roster, ordered by index. */
  snapshot(): PlayerInfo[] {
    return this.entries.map((e) => ({ ...e }));
  }
}

/** Copy a frozen overlay vector into a plain object. */
export function plainVector(v: Vector3): Vector3 {
  return { x: v.x, y: v.y, z: v.z };
}
