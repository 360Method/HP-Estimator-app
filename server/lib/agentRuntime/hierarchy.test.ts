import { describe, it, expect } from "vitest";
import { validateHierarchy, canHandoff, auditRoster } from "./hierarchy";

type A = {
  id: number;
  department: string;
  isDepartmentHead: boolean;
  reportsToSeatId: number | null;
};

// Roster fixture: Integrator (1) → Head of Sales (2) → Sub-Nurturer (3), Peer (4)
//                                  → Head of Ops (5) → Sub-Dispatcher (6)
const ROSTER: A[] = [
  { id: 1, department: "integrator", isDepartmentHead: false, reportsToSeatId: null },
  { id: 2, department: "sales", isDepartmentHead: true, reportsToSeatId: 1 },
  { id: 3, department: "sales", isDepartmentHead: false, reportsToSeatId: 2 },
  { id: 4, department: "sales", isDepartmentHead: false, reportsToSeatId: 2 },
  { id: 5, department: "operations", isDepartmentHead: true, reportsToSeatId: 1 },
  { id: 6, department: "operations", isDepartmentHead: false, reportsToSeatId: 5 },
];

describe("validateHierarchy", () => {
  it("accepts Integrator with null parent", () => {
    expect(validateHierarchy(ROSTER[0], ROSTER.slice(1))).toBeNull();
  });

  it("rejects Integrator that reports to something", () => {
    const v = validateHierarchy(
      { ...ROSTER[0], reportsToSeatId: 2 },
      ROSTER.slice(1)
    );
    expect(v?.code).toBe("orphan_integrator");
  });

  it("accepts Department Head reporting to Integrator", () => {
    expect(validateHierarchy(ROSTER[1], ROSTER.filter((r) => r.id !== 2))).toBeNull();
  });

  it("rejects Department Head with no parent", () => {
    const v = validateHierarchy(
      { ...ROSTER[1], reportsToSeatId: null },
      ROSTER.filter((r) => r.id !== 2)
    );
    expect(v?.code).toBe("head_wrong_parent");
  });

  it("rejects Department Head reporting to another Head", () => {
    const v = validateHierarchy(
      { ...ROSTER[1], reportsToSeatId: 5 },
      ROSTER.filter((r) => r.id !== 2)
    );
    expect(v?.code).toBe("head_wrong_parent");
  });

  it("accepts sub-agent reporting to its department's Head", () => {
    expect(validateHierarchy(ROSTER[2], ROSTER.filter((r) => r.id !== 3))).toBeNull();
  });

  it("rejects sub-agent reporting to the Integrator directly", () => {
    const v = validateHierarchy(
      { ...ROSTER[2], reportsToSeatId: 1 },
      ROSTER.filter((r) => r.id !== 3)
    );
    expect(v?.code).toBe("sub_wrong_parent");
  });

  it("rejects sub-agent reporting across departments", () => {
    const v = validateHierarchy(
      { ...ROSTER[2], reportsToSeatId: 5 },
      ROSTER.filter((r) => r.id !== 3)
    );
    expect(v?.code).toBe("sub_cross_department");
  });

  it("rejects sub-agent with no parent", () => {
    const v = validateHierarchy(
      { ...ROSTER[2], reportsToSeatId: null },
      ROSTER.filter((r) => r.id !== 3)
    );
    expect(v?.code).toBe("sub_wrong_parent");
  });
});

describe("canHandoff — escalation flow", () => {
  const [integrator, headSales, subNurturer, peer, headOps, subDispatch] = ROSTER;

  it("allows sub-agent → its Head (escalation up)", () => {
    expect(canHandoff({ from: subNurturer, to: headSales, roster: ROSTER }).ok).toBe(true);
  });

  it("allows sub-agent → peer in same department", () => {
    expect(canHandoff({ from: subNurturer, to: peer, roster: ROSTER }).ok).toBe(true);
  });

  it("rejects sub-agent → Integrator directly", () => {
    expect(canHandoff({ from: subNurturer, to: integrator, roster: ROSTER }).ok).toBe(false);
  });

  it("rejects sub-agent → a sub-agent in a different department", () => {
    expect(canHandoff({ from: subNurturer, to: subDispatch, roster: ROSTER }).ok).toBe(false);
  });

  it("allows Department Head → Integrator", () => {
    expect(canHandoff({ from: headSales, to: integrator, roster: ROSTER }).ok).toBe(true);
  });

  it("rejects Department Head → another Department Head laterally", () => {
    expect(canHandoff({ from: headSales, to: headOps, roster: ROSTER }).ok).toBe(false);
  });

  it("allows Integrator → any Department Head (delegation)", () => {
    expect(canHandoff({ from: integrator, to: headSales, roster: ROSTER }).ok).toBe(true);
    expect(canHandoff({ from: integrator, to: headOps, roster: ROSTER }).ok).toBe(true);
  });

  it("allows Head → its own sub-agent (delegation down)", () => {
    expect(canHandoff({ from: headSales, to: subNurturer, roster: ROSTER }).ok).toBe(true);
  });

  it("rejects Head → sub-agent in a different department", () => {
    expect(canHandoff({ from: headSales, to: subDispatch, roster: ROSTER }).ok).toBe(false);
  });
});

describe("auditRoster", () => {
  it("returns empty array for a clean roster", () => {
    expect(auditRoster(ROSTER)).toEqual([]);
  });

  it("flags every violation in a broken roster", () => {
    const broken: A[] = [
      { id: 1, department: "integrator", isDepartmentHead: false, reportsToSeatId: 2 }, // orphan integrator
      { id: 2, department: "sales", isDepartmentHead: true, reportsToSeatId: null }, // head with no parent
      { id: 3, department: "sales", isDepartmentHead: false, reportsToSeatId: 1 }, // sub → integrator
    ];
    const violations = auditRoster(broken);
    expect(violations).toHaveLength(3);
    expect(violations.map((v) => v.v.code)).toEqual(
      expect.arrayContaining(["orphan_integrator", "head_wrong_parent", "sub_wrong_parent"])
    );
  });
});
