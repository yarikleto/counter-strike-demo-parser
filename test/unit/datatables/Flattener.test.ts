/**
 * Unit tests for the SendTable flattener — passes 2, 3, and 4 of the
 * algorithm in ADR-001.
 *
 * - TASK-016: prop collection + DATATABLE recursion + exclusion application.
 * - TASK-017: collapsible/non-collapsible equivalence.
 * - TASK-018: priority bucket-sweep sort.
 *
 * The integration test against the real demo lives in
 * `test/integration/flattening.test.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  flattenSendTable,
  prioritySort,
} from "../../../src/datatables/Flattener.js";
import {
  exclusionKey,
} from "../../../src/datatables/Exclusions.js";
import {
  SendPropType,
  type SendProp,
  type SendTable,
} from "../../../src/datatables/SendTable.js";
import { SendTableRegistry } from "../../../src/datatables/SendTableRegistry.js";
import { SPropFlags } from "../../../src/datatables/SPropFlags.js";

function intProp(varName: string, opts: Partial<SendProp> = {}): SendProp {
  return {
    type: SendPropType.INT,
    varName,
    flags: 0,
    priority: 0,
    numElements: 0,
    lowValue: 0,
    highValue: 0,
    numBits: 32,
    ...opts,
  };
}

function dtProp(
  varName: string,
  dtName: string,
  opts: Partial<SendProp> = {},
): SendProp {
  return {
    type: SendPropType.DATATABLE,
    varName,
    flags: 0,
    priority: 0,
    dtName,
    numElements: 0,
    lowValue: 0,
    highValue: 0,
    numBits: 0,
    ...opts,
  };
}

function table(name: string, props: SendProp[]): SendTable {
  return { netTableName: name, needsDecoder: false, props };
}

describe("flattenSendTable — TASK-016 prop collection + DT recursion", () => {
  it("collects leaf props from a flat table", () => {
    const root = table("DT_Root", [intProp("m_a"), intProp("m_b")]);
    const reg = new SendTableRegistry();
    reg.register(root);
    const flat = flattenSendTable(root, reg, new Set());
    expect(flat.map((f) => f.prop.varName)).toEqual(["m_a", "m_b"]);
    expect(flat.every((f) => f.sourceTableName === "DT_Root")).toBe(true);
  });

  it("recurses into a DATATABLE prop, inlining children before parent leaves (Source two-pass walk)", () => {
    // Source's `SendTable_BuildHierarchy_IterateProps` does TWO passes
    // per table level: all DataTable-typed props first (recursing), then
    // all leaf props. This test pins that behavior — children of the DT
    // prop appear BEFORE the parent's own leaf props, regardless of
    // wire-order position. Verified against demoinfocs's CCSPlayer
    // golden dump (idx 9 = m_nDuckTimeMsecs from a deep DT subtree
    // appears before idx 15 = m_fFlags, even though m_fFlags's parent
    // table declares it before the DT prop that leads to m_nDuckTimeMsecs).
    const child = table("DT_Child", [intProp("c1"), intProp("c2")]);
    const root = table("DT_Root", [
      intProp("r1"),
      dtProp("childRef", "DT_Child"),
      intProp("r2"),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    reg.register(child);
    const flat = flattenSendTable(root, reg, new Set());
    expect(flat.map((f) => f.prop.varName)).toEqual(["c1", "c2", "r1", "r2"]);
    expect(flat[0]!.sourceTableName).toBe("DT_Child");
    expect(flat[1]!.sourceTableName).toBe("DT_Child");
    expect(flat[2]!.sourceTableName).toBe("DT_Root");
    expect(flat[3]!.sourceTableName).toBe("DT_Root");
  });

  it("recurses depth-first across multiple levels (DT-first per level)", () => {
    const grand = table("DT_Grand", [intProp("g1")]);
    const child = table("DT_Child", [
      intProp("c1"),
      dtProp("g", "DT_Grand"),
      intProp("c2"),
    ]);
    const root = table("DT_Root", [
      dtProp("ch", "DT_Child"),
      intProp("r1"),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    reg.register(child);
    reg.register(grand);
    const flat = flattenSendTable(root, reg, new Set());
    // Two-pass per level:
    //  - DT_Root pass 1: recurse into DT_Child
    //    - DT_Child pass 1: recurse into DT_Grand
    //      - DT_Grand pass 1: nothing
    //      - DT_Grand pass 2: append g1
    //    - DT_Child pass 2: append c1, c2
    //  - DT_Root pass 2: append r1
    expect(flat.map((f) => f.prop.varName)).toEqual(["g1", "c1", "c2", "r1"]);
  });

  it("skips EXCLUDE-flagged marker props", () => {
    const root = table("DT_Root", [
      intProp("m_a"),
      intProp("ignoreMe", { flags: SPropFlags.EXCLUDE, dtName: "DT_X" }),
      intProp("m_b"),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    const flat = flattenSendTable(root, reg, new Set());
    expect(flat.map((f) => f.prop.varName)).toEqual(["m_a", "m_b"]);
  });

  it("honors exclusions referencing the current table", () => {
    const root = table("DT_Root", [intProp("keep"), intProp("drop")]);
    const reg = new SendTableRegistry();
    reg.register(root);
    const ex = new Set<string>([exclusionKey("DT_Root", "drop")]);
    const flat = flattenSendTable(root, reg, ex);
    expect(flat.map((f) => f.prop.varName)).toEqual(["keep"]);
  });

  it("does not infinite-loop on a true cycle", () => {
    const a = table("DT_A", [intProp("a1"), dtProp("toB", "DT_B")]);
    const b = table("DT_B", [intProp("b1"), dtProp("toA", "DT_A")]);
    const reg = new SendTableRegistry();
    reg.register(a);
    reg.register(b);
    const flat = flattenSendTable(a, reg, new Set());
    // Two-pass walk:
    //  - DT_A pass 1: recurse into DT_B
    //    - DT_B pass 1: would recurse into DT_A but visited cycles short-circuit
    //    - DT_B pass 2: append b1
    //  - DT_A pass 2: append a1
    // Final order: b1, a1.
    expect(flat.map((f) => f.prop.varName)).toEqual(["b1", "a1"]);
  });

  it("walks the same sub-table twice when reached via two paths (non-cycle)", () => {
    // Root references DT_Shared twice (different parent prop names).
    // Flattening must produce 2 copies of Shared's props.
    const shared = table("DT_Shared", [intProp("s1")]);
    const root = table("DT_Root", [
      dtProp("first", "DT_Shared"),
      dtProp("second", "DT_Shared"),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    reg.register(shared);
    const flat = flattenSendTable(root, reg, new Set());
    expect(flat.map((f) => f.prop.varName)).toEqual(["s1", "s1"]);
  });
});

describe("flattenSendTable — TASK-017 collapsible vs non-collapsible", () => {
  it("produces identical output regardless of SPROP_COLLAPSIBLE", () => {
    const child = table("DT_Child", [intProp("c1"), intProp("c2")]);
    const reg = new SendTableRegistry();
    reg.register(child);

    const rootCollapsible = table("DT_Root", [
      dtProp("ref", "DT_Child", { flags: SPropFlags.COLLAPSIBLE }),
    ]);
    const rootNotCollapsible = table("DT_RootNC", [
      dtProp("ref", "DT_Child"),
    ]);
    reg.register(rootCollapsible);
    reg.register(rootNotCollapsible);

    const flatA = flattenSendTable(rootCollapsible, reg, new Set());
    const flatB = flattenSendTable(rootNotCollapsible, reg, new Set());
    expect(flatA.map((f) => f.prop.varName)).toEqual(
      flatB.map((f) => f.prop.varName),
    );
    expect(flatA.map((f) => f.sourceTableName)).toEqual(
      flatB.map((f) => f.sourceTableName),
    );
  });
});

describe("prioritySort — TASK-018 bucket-sweep priority sort", () => {
  it("returns input unchanged when all priorities are equal", () => {
    const root = table("DT_Root", [
      intProp("a", { priority: 64 }),
      intProp("b", { priority: 64 }),
      intProp("c", { priority: 64 }),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    const flat = flattenSendTable(root, reg, new Set());
    const sorted = prioritySort(flat);
    expect(sorted.map((f) => f.prop.varName)).toEqual(["a", "b", "c"]);
  });

  it("sorts by ascending priority", () => {
    // Note: Source's swap-based bucket sweep (per ADR-001) is NOT
    // strictly stable in synthetic interleaved cases — when a low-priority
    // prop late in the array is swapped to the front, a high-priority
    // prop near the front gets pushed to where the low-priority prop
    // was. The Source data we parse in practice has same-priority props
    // clustered together, so the disruption is benign. This test simply
    // asserts the bucket boundaries are correct; the integration test
    // against the golden dump is the true correctness oracle.
    const root = table("DT_Root", [
      intProp("p128_a", { priority: 128 }),
      intProp("p0_a", { priority: 0 }),
      intProp("p128_b", { priority: 128 }),
      intProp("p64_a", { priority: 64 }),
      intProp("p0_b", { priority: 0 }),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    const flat = flattenSendTable(root, reg, new Set());
    const sorted = prioritySort(flat);
    // Group by priority and assert bucket membership + ordering across buckets.
    const priorityOf = (n: string) =>
      n.startsWith("p0") ? 0 : n.startsWith("p64") ? 64 : 128;
    const priosInOrder = sorted.map((f) => priorityOf(f.prop.varName));
    // Each bucket's priorities are non-decreasing across the array.
    for (let i = 1; i < priosInOrder.length; i++) {
      expect(priosInOrder[i]!).toBeGreaterThanOrEqual(priosInOrder[i - 1]!);
    }
    // Bucket-0 contains exactly p0_a and p0_b in tree-walk order (no swap
    // disruption between them — they're adjacent in tree-walk among
    // priority-0 entries when the algorithm reaches them).
    const p0Names = sorted
      .filter((f) => priorityOf(f.prop.varName) === 0)
      .map((f) => f.prop.varName);
    expect(p0Names).toEqual(["p0_a", "p0_b"]);
    expect(sorted[2]!.prop.varName).toBe("p64_a");
  });

  it("CHANGES_OFTEN with raw priority > 64 caps to 64; raw priority <= 64 stays", () => {
    // The full CHANGES_OFTEN rule: effective = CO ? min(priority, 64) : priority.
    // - co_p128: min(128, 64) = 64 -> bucket 64
    // - co_p0  : min(0, 64) = 0  -> bucket 0
    // - p128_normal* : 128 -> bucket 128
    // Buckets ascending: 0, 64, 128. So co_p0 first, co_p128 second,
    // then the priority-128 non-CO pair.
    const root = table("DT_Root", [
      intProp("p128_normal", { priority: 128 }),
      intProp("co_p128", { priority: 128, flags: SPropFlags.CHANGES_OFTEN }),
      intProp("p128_normal_b", { priority: 128 }),
      intProp("co_p0", { priority: 0, flags: SPropFlags.CHANGES_OFTEN }),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    const flat = flattenSendTable(root, reg, new Set());
    const sorted = prioritySort(flat);
    // Bucket-0 first.
    expect(sorted[0]!.prop.varName).toBe("co_p0");
    // Bucket-64 next (the CO-promoted-from-128 prop).
    expect(sorted[1]!.prop.varName).toBe("co_p128");
    // Bucket-128 last; the swap-based sweep may reorder these.
    const tailNames = new Set([sorted[2]!.prop.varName, sorted[3]!.prop.varName]);
    expect(tailNames).toEqual(new Set(["p128_normal", "p128_normal_b"]));
  });

  it("sorts a deeply mixed example with effective-priority = min(priority, 64) for CO", () => {
    const root = table("DT_Root", [
      intProp("a", { priority: 5 }),
      intProp("b", { priority: 1 }),
      // c has CHANGES_OFTEN with raw priority 5; effective = min(5, 64) = 5.
      // It does NOT promote to bucket 64.
      intProp("c", { priority: 5, flags: SPropFlags.CHANGES_OFTEN }),
      intProp("d", { priority: 1 }),
      intProp("e", { priority: 200 }),
      intProp("f", { priority: 5 }),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    const flat = flattenSendTable(root, reg, new Set());
    const sorted = prioritySort(flat);
    // Buckets present: 1, 5, 64 (always-included for CO sweep, even with
    // no members), 200. Effective priorities: a=5, b=1, c=5, d=1, e=200,
    // f=5. Bucket sweep produces (per the swap algorithm's actual
    // output): b, d (bucket 1); c, a, f (bucket 5 — note c is first
    // because the swap during bucket-1 didn't move c, then bucket-5
    // pass picks c first); e (bucket 200).
    expect(sorted.map((f) => f.prop.varName)).toEqual([
      "b",
      "d",
      "c",
      "a",
      "f",
      "e",
    ]);
  });

  it("does not mutate the input array", () => {
    const root = table("DT_Root", [
      intProp("z", { priority: 100 }),
      intProp("a", { priority: 0 }),
    ]);
    const reg = new SendTableRegistry();
    reg.register(root);
    const flat = flattenSendTable(root, reg, new Set());
    const before = flat.map((f) => f.prop.varName).join(",");
    void prioritySort(flat);
    const after = flat.map((f) => f.prop.varName).join(",");
    expect(before).toBe(after);
  });
});
