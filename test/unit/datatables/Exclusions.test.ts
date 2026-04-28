/**
 * Unit tests for gatherExclusions — pass 1 of the SendTable flattening
 * algorithm.
 *
 * We hand-build small SendTable hierarchies. The integration test against
 * the real demo lives in `test/integration/flattening.test.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  gatherExclusions,
  exclusionKey,
} from "../../../src/datatables/Exclusions.js";
import { SendPropType, type SendProp, type SendTable } from "../../../src/datatables/SendTable.js";
import { SendTableRegistry } from "../../../src/datatables/SendTableRegistry.js";
import { SPropFlags } from "../../../src/datatables/SPropFlags.js";

function intProp(varName: string, flags = 0): SendProp {
  return {
    type: SendPropType.INT,
    varName,
    flags,
    priority: 0,
    numElements: 0,
    lowValue: 0,
    highValue: 0,
    numBits: 32,
  };
}

function dtProp(varName: string, dtName: string, flags = 0): SendProp {
  return {
    type: SendPropType.DATATABLE,
    varName,
    flags,
    priority: 0,
    dtName,
    numElements: 0,
    lowValue: 0,
    highValue: 0,
    numBits: 0,
  };
}

function excludeProp(targetDtName: string, targetVarName: string): SendProp {
  return {
    type: SendPropType.DATATABLE,
    varName: targetVarName,
    flags: SPropFlags.EXCLUDE,
    priority: 0,
    dtName: targetDtName,
    numElements: 0,
    lowValue: 0,
    highValue: 0,
    numBits: 0,
  };
}

function table(name: string, props: SendProp[]): SendTable {
  return { netTableName: name, needsDecoder: false, props };
}

describe("gatherExclusions", () => {
  it("returns an empty set when no prop has SPROP_EXCLUDE", () => {
    const root = table("DT_Root", [intProp("m_iFoo"), intProp("m_iBar")]);
    const reg = new SendTableRegistry();
    reg.register(root);
    const ex = gatherExclusions(root, reg);
    expect(ex.size).toBe(0);
  });

  it("collects an exclusion declared at the root", () => {
    const root = table("DT_Root", [
      intProp("m_iFoo"),
      excludeProp("DT_Other", "m_iSomething"),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    const ex = gatherExclusions(root, reg);
    expect(ex.size).toBe(1);
    expect(ex.has(exclusionKey("DT_Other", "m_iSomething"))).toBe(true);
  });

  it("collects exclusions declared in recursively-reachable sub-tables", () => {
    const child = table("DT_Child", [
      intProp("m_iA"),
      excludeProp("DT_Far", "m_iExcluded"),
    ]);
    const root = table("DT_Root", [
      intProp("m_iRoot"),
      dtProp("local", "DT_Child"),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    reg.register(child);
    const ex = gatherExclusions(root, reg);
    expect(ex.size).toBe(1);
    expect(ex.has(exclusionKey("DT_Far", "m_iExcluded"))).toBe(true);
  });

  it("does not infinite-loop on a cyclic SendTable graph", () => {
    // DT_A -> DT_B -> DT_A. A malformed demo could produce this. The
    // visited-set in gatherExclusions must short-circuit re-entry.
    const a = table("DT_A", [dtProp("toB", "DT_B")]);
    const b = table("DT_B", [
      dtProp("toA", "DT_A"),
      excludeProp("DT_X", "m_iZ"),
    ]);
    const reg = new SendTableRegistry();
    reg.register(a);
    reg.register(b);
    const ex = gatherExclusions(a, reg);
    expect(ex.has(exclusionKey("DT_X", "m_iZ"))).toBe(true);
  });

  it("does not recurse into the dtName of an EXCLUDE prop", () => {
    // If we mistakenly recursed into DT_Other, we'd pick up its inner
    // exclusion. The correct behavior is to treat EXCLUDE as a leaf marker.
    const other = table("DT_Other", [
      excludeProp("DT_ShouldNotBeFound", "m_bogus"),
    ]);
    const root = table("DT_Root", [excludeProp("DT_Other", "m_iSomething")]);
    const reg = new SendTableRegistry();
    reg.register(root);
    reg.register(other);
    const ex = gatherExclusions(root, reg);
    expect(ex.size).toBe(1);
    expect(ex.has(exclusionKey("DT_Other", "m_iSomething"))).toBe(true);
    expect(ex.has(exclusionKey("DT_ShouldNotBeFound", "m_bogus"))).toBe(false);
  });
});
