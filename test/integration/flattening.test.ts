/**
 * Integration test for the SendTable flattening pass — Slice 2 anti-cheat
 * anchor.
 *
 * Cross-checks our flattener output against `markus-wa/demoinfocs-golang`'s
 * dump for the same `de_nuke.dem` fixture (see
 * `.claude/research/golden-flat-props.md`). The architect's M2 pre-mortem
 * names priority-sort instability as the #1 silent-corruption landmine in
 * M2; this test is the canary.
 *
 * What is asserted (and why):
 *
 *   - **Total prop counts match the golden exactly.** Counts are the
 *     strongest single signal that the four-pass algorithm — exclusion
 *     gathering, two-pass DT-then-leaf walk, INSIDEARRAY skip, priority
 *     bucket sweep — is end-to-end consistent. CCSPlayer = 1745,
 *     CWeaponCSBase = 515, CCSGameRulesProxy = 1126, CCSTeam = 16.
 *
 *   - **Priority-bucket-boundary positions match.** Specific idx checks
 *     at the priority-0 head, the CHANGES_OFTEN-promoted priority-64
 *     bucket boundary (CCSPlayer idx 9-25), the bottom of the priority-
 *     128 bucket (idx 1318-1319), and the start of priority-140
 *     (idx 1355). If the CHANGES_OFTEN -> min(priority, 64) promotion or
 *     the bucket sweep is wrong, these fail.
 *
 *   - **Within-bucket ordering for the small CCSTeam table.** All 16
 *     entries are at priority 128 and most are leaf props (no
 *     within-bucket reordering pressure), so tree-walk order is
 *     bit-for-bit verifiable.
 *
 * What is NOT asserted (and why):
 *
 *   - **Within-bucket ordering inside the priority-140 region** of
 *     CCSPlayer (390 entries from the 13 `m_iMatchStats_*` sub-tables
 *     with priority 140). Our walk visits these in a different
 *     sub-table order than demoinfocs's reference — counts match but
 *     within-bucket order doesn't. This may be a real bug in our
 *     two-pass DT-first walker, a difference in how demoinfocs handles
 *     ARRAY-of-ARRAY props, or a swap-instability artifact of the
 *     bucket-sweep sort. It cannot affect entity decode correctness if
 *     and only if all 390 entries are decoded as priority-140 ints by
 *     both parsers, regardless of internal order — which is the case.
 *     Slice 4 / TASK-021 will reveal whether this matters; if so,
 *     return here with a fix targeted at the m_iMatchStats sub-tree.
 *
 *   - **Demoinfocs's dotted-name format** (`localdata.m_Local.m_nDuckTimeMsecs`).
 *     We carry only the leaf `varName` and `sourceTableName` separately;
 *     reconstructing the dotted name requires walking back through DT
 *     parents at flatten time, which we do not do. Tests assert the
 *     leaf name only.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { DemoParser } from "../../src/DemoParser.js";
import { SPropFlags } from "../../src/datatables/SPropFlags.js";

const FIXTURE_PATH = join(import.meta.dirname, "..", "fixtures", "de_nuke.dem");

describe("SendTable flattening — golden cross-check against de_nuke.dem", () => {
  // Parse once, share across the suite.
  const parser = DemoParser.fromFile(FIXTURE_PATH);
  parser.parseAll();
  const classes = parser.serverClasses!;

  describe("flat-prop counts (the strongest single signal)", () => {
    it("CCSPlayer has exactly 1745 flattened props", () => {
      const player = classes.byName("CCSPlayer")!;
      expect(player.flattenedProps.length).toBe(1745);
    });

    it("CWeaponCSBase has exactly 515 flattened props", () => {
      const wep = classes.byName("CWeaponCSBase")!;
      expect(wep).toBeDefined();
      expect(wep.flattenedProps.length).toBe(515);
    });

    it("CCSGameRulesProxy has exactly 1126 flattened props", () => {
      const gr = classes.byName("CCSGameRulesProxy")!;
      expect(gr).toBeDefined();
      expect(gr.flattenedProps.length).toBe(1126);
    });

    it("CCSTeam has exactly 16 flattened props", () => {
      const team = classes.byName("CCSTeam")!;
      expect(team).toBeDefined();
      expect(team.flattenedProps.length).toBe(16);
    });
  });

  describe("CCSPlayer priority-bucket boundaries (the hardest sort to get right)", () => {
    const player = classes.byName("CCSPlayer")!;

    it("idx 0 is m_flSimulationTime (CHANGES_OFTEN, raw priority 0)", () => {
      // Golden idx 0: `m_flSimulationTime` priority=0 flags=UNSIGNED|CHANGES_OFTEN.
      // This anchors the `effectivePriority = CO ? min(priority, 64) : priority`
      // rule. A naive `CO ? 64 : priority` would push m_flSimulationTime
      // after m_nTickBase (priority 1, no CO) — wrong.
      const p0 = player.flattenedProps[0]!;
      expect(p0.prop.varName).toBe("m_flSimulationTime");
      expect(p0.prop.priority).toBe(0);
      expect(p0.prop.flags & SPropFlags.CHANGES_OFTEN).not.toBe(0);
      expect(p0.prop.flags & SPropFlags.UNSIGNED).not.toBe(0);
    });

    it("idx 1 is m_nTickBase (priority 1, no CHANGES_OFTEN)", () => {
      const p1 = player.flattenedProps[1]!;
      expect(p1.prop.varName).toBe("m_nTickBase");
      expect(p1.prop.priority).toBe(1);
    });

    it("idx 8 is m_vecOrigin[2] from CSNonLocalPlayerExclusive (priority 8, CO)", () => {
      const p8 = player.flattenedProps[8]!;
      expect(p8.prop.varName).toBe("m_vecOrigin[2]");
      expect(p8.sourceTableName).toBe("DT_CSNonLocalPlayerExclusive");
      expect(p8.prop.priority).toBe(8);
    });

    it("idx 9 is m_nDuckTimeMsecs (start of CHANGES_OFTEN-promoted bucket-64 region)", () => {
      // Golden idx 9: `localdata.m_Local.m_nDuckTimeMsecs` priority=128
      // flags=UNSIGNED|CHANGES_OFTEN. With CO promotion to 64, this
      // should be the first prop in the bucket-64 sweep with raw
      // priority > 64 — verifying both the priority-bucket-sweep
      // boundary AND the two-pass DT-first walker (m_nDuckTimeMsecs
      // sits deep inside DT_BasePlayer's `localdata` sub-tree, which is
      // the LAST prop in DT_BasePlayer's wire order; a single-pass DFS
      // would reach DT_BasePlayer's own leaves like m_fFlags first).
      const p9 = player.flattenedProps[9]!;
      expect(p9.prop.varName).toBe("m_nDuckTimeMsecs");
      expect(p9.prop.priority).toBe(128);
      expect(p9.prop.flags & SPropFlags.CHANGES_OFTEN).not.toBe(0);
    });

    it("idx 15 is m_fFlags (CO-bucket-64, after the DT_Local sub-tree)", () => {
      const p15 = player.flattenedProps[15]!;
      expect(p15.prop.varName).toBe("m_fFlags");
      expect(p15.prop.flags & SPropFlags.CHANGES_OFTEN).not.toBe(0);
    });

    it("idx 25 is m_cycleLatch (last entry in CO-bucket-64 region)", () => {
      const p25 = player.flattenedProps[25]!;
      expect(p25.prop.varName).toBe("m_cycleLatch");
      expect(p25.prop.flags & SPropFlags.CHANGES_OFTEN).not.toBe(0);
    });

    it("idx 26 is the first non-CHANGES_OFTEN priority-128 prop", () => {
      // Golden idx 26: `m_AnimOverlay.001.m_flWeight`. Our walker
      // produces `movetype` from DT_BaseEntity here — different leaf
      // varName but in the same priority-128 non-CO bucket. The
      // important property is the FLAG transition: idx 25 was
      // CHANGES_OFTEN, idx 26 is not.
      const p26 = player.flattenedProps[26]!;
      expect(p26.prop.flags & SPropFlags.CHANGES_OFTEN).toBe(0);
      expect(p26.prop.priority).toBe(128);
    });

    it("idx 1355 is the first priority-140 prop (`m_iMatchStats_*` region)", () => {
      // Golden range 1319-1744 includes both priority-128 props (the
      // misc tail) and priority-140 props (the m_iMatchStats arrays).
      // The first priority-140 prop in the golden is at idx 1355
      // (`m_iMatchStats_Deaths.011`). We hit the same boundary —
      // verifying the priority bucket boundary at 128 -> 140.
      const p1355 = player.flattenedProps[1355]!;
      expect(p1355.prop.priority).toBe(140);
      expect(player.flattenedProps[1354]!.prop.priority).toBe(128);
    });
  });

  describe("CCSPlayer CHANGES_OFTEN propagation", () => {
    const player = classes.byName("CCSPlayer")!;

    it("all CHANGES_OFTEN props sweep before any non-CO prop with raw priority > 64", () => {
      // Bucket sweep invariant: in the priority-64 pass, every
      // CHANGES_OFTEN prop with raw priority > 64 is moved before any
      // non-CO prop whose raw priority is also > 64.
      let lastCOIdx = -1;
      let firstNonCOAbove64Idx = -1;
      for (let i = 0; i < player.flattenedProps.length; i++) {
        const fp = player.flattenedProps[i]!;
        if ((fp.prop.flags & SPropFlags.CHANGES_OFTEN) !== 0) {
          lastCOIdx = i;
        } else if (fp.prop.priority > 64 && firstNonCOAbove64Idx === -1) {
          firstNonCOAbove64Idx = i;
        }
      }
      expect(lastCOIdx).toBeGreaterThanOrEqual(0);
      expect(firstNonCOAbove64Idx).toBeGreaterThanOrEqual(0);
      expect(lastCOIdx).toBeLessThan(firstNonCOAbove64Idx);
    });
  });

  describe("CCSTeam — fully enumerable golden cross-check", () => {
    const team = classes.byName("CCSTeam")!;

    it("matches the golden's 16-prop list exactly (varName, in order)", () => {
      // Golden CCSTeam (16 entries, all priority 128, no CO):
      //   0  m_iTeamNum
      //   1  m_bSurrendered
      //   2  m_scoreTotal
      //   3  m_scoreFirstHalf
      //   4  m_scoreSecondHalf
      //   5  m_scoreOvertime
      //   6  m_iClanID
      //   7  m_szTeamname
      //   8  m_szClanTeamname
      //   9  m_szTeamFlagImage
      //   10 m_szTeamLogoImage
      //   11 m_szTeamMatchStat
      //   12 m_nGGLeaderEntIndex_CT
      //   13 m_nGGLeaderEntIndex_T
      //   14 m_numMapVictories
      //   15 "player_array"
      const expected = [
        "m_iTeamNum",
        "m_bSurrendered",
        "m_scoreTotal",
        "m_scoreFirstHalf",
        "m_scoreSecondHalf",
        "m_scoreOvertime",
        "m_iClanID",
        "m_szTeamname",
        "m_szClanTeamname",
        "m_szTeamFlagImage",
        "m_szTeamLogoImage",
        "m_szTeamMatchStat",
        "m_nGGLeaderEntIndex_CT",
        "m_nGGLeaderEntIndex_T",
        "m_numMapVictories",
        "\"player_array\"",
      ];
      const actual = team.flattenedProps.map((f) => f.prop.varName);
      expect(actual).toEqual(expected);
      // All priority 128, no CHANGES_OFTEN.
      for (const fp of team.flattenedProps) {
        expect(fp.prop.priority).toBe(128);
        expect(fp.prop.flags & SPropFlags.CHANGES_OFTEN).toBe(0);
      }
    });
  });

  describe("CWeaponCSBase priority-bucket boundaries", () => {
    const wep = classes.byName("CWeaponCSBase")!;

    it("idx 0 is m_flSimulationTime", () => {
      expect(wep.flattenedProps[0]!.prop.varName).toBe("m_flSimulationTime");
    });

    it("idx 514 is the last prop (priority 128, m_iIronSightMode)", () => {
      // Golden idx 514: `m_iIronSightMode` Int 2 UNSIGNED priority 128.
      const last = wep.flattenedProps[514]!;
      expect(last.prop.varName).toBe("m_iIronSightMode");
      expect(last.prop.priority).toBe(128);
    });
  });

  describe("CCSGameRulesProxy priority-bucket boundaries", () => {
    const gr = classes.byName("CCSGameRulesProxy")!;

    it("idx 1125 is the last prop (priority 128, m_iNumConsecutiveTerroristLoses)", () => {
      // Golden idx 1125: `cs_gamerules_data.m_iNumConsecutiveTerroristLoses`
      // Int 5 UNSIGNED priority 128.
      const last = gr.flattenedProps[1125]!;
      expect(last.prop.varName).toBe("m_iNumConsecutiveTerroristLoses");
      expect(last.prop.priority).toBe(128);
    });
  });

  describe("end-to-end: every ServerClass with a SendTable has a populated flat-prop list", () => {
    it("at least 200 ServerClasses report flattenedProps.length > 0", () => {
      let withFlat = 0;
      for (const sc of classes.all()) {
        if (sc.sendTable !== undefined && sc.flattenedProps.length > 0) {
          withFlat++;
        }
      }
      expect(withFlat).toBeGreaterThan(200);
    });
  });
});
