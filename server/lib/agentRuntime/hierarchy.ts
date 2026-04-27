/**
 * server/lib/agentRuntime/hierarchy.ts
 *
 * Enforces the Visionary → Integrator → 8 Department Heads → sub-agents chain.
 *
 * Rules:
 *   - Integrator seat (department = "integrator"): reportsToSeatId is null
 *     (the Visionary — Marcin — is the implicit parent).
 *   - Department Head seat (isDepartmentHead = true, dept != integrator):
 *     reportsToSeatId must point to THE integrator seat.
 *   - Sub-agent (isDepartmentHead = false, dept != integrator):
 *     reportsToSeatId must point to a Head in the same department.
 *
 * Escalation flow:
 *   sub-agent → Head → Integrator → Visionary (Marcin).
 * Handoffs may go:
 *   - up (to the agent's direct parent), or
 *   - sideways within the same department (to a peer reporting to the same Head).
 */

import type { DbAiAgent } from "../../../drizzle/schema";

export type AgentShape = Pick<
  DbAiAgent,
  "id" | "department" | "isDepartmentHead" | "reportsToSeatId"
>;

export type HierarchyViolation = {
  code: "orphan_integrator" | "head_wrong_parent" | "sub_wrong_parent" | "sub_cross_department" | "missing_parent";
  message: string;
};

/**
 * Validate a proposed (or existing) agent row against the rest of the roster.
 * Returns the first violation or null when valid. `siblings` should be the
 * full roster EXCLUDING the agent being validated (so updates can use the
 * pre-update roster and the update's own id isn't counted as its own parent).
 */
export function validateHierarchy(
  agent: AgentShape & { seatName?: string },
  siblings: AgentShape[]
): HierarchyViolation | null {
  const { department, isDepartmentHead, reportsToSeatId } = agent;

  // Integrator seat
  if (department === "integrator") {
    if (!isDepartmentHead && reportsToSeatId != null) {
      // The Integrator is conceptually a "Head of all Heads" — but we store it
      // as department=integrator. It must report to no one in-system.
      return {
        code: "orphan_integrator",
        message: "Integrator seat must have reportsToSeatId = null (Visionary is implicit).",
      };
    }
    return null;
  }

  // Department Head
  if (isDepartmentHead) {
    if (reportsToSeatId == null) {
      return {
        code: "head_wrong_parent",
        message: "Department Head must report to the Integrator seat (reportsToSeatId cannot be null).",
      };
    }
    const parent = siblings.find((s) => s.id === reportsToSeatId);
    if (!parent) {
      return {
        code: "missing_parent",
        message: `reportsToSeatId ${reportsToSeatId} does not exist.`,
      };
    }
    if (parent.department !== "integrator") {
      return {
        code: "head_wrong_parent",
        message: "Department Head may only report to the Integrator seat.",
      };
    }
    return null;
  }

  // Sub-agent
  if (reportsToSeatId == null) {
    return {
      code: "sub_wrong_parent",
      message: "Sub-agents must report to a Department Head in their own department.",
    };
  }
  const parent = siblings.find((s) => s.id === reportsToSeatId);
  if (!parent) {
    return {
      code: "missing_parent",
      message: `reportsToSeatId ${reportsToSeatId} does not exist.`,
    };
  }
  if (!parent.isDepartmentHead) {
    return {
      code: "sub_wrong_parent",
      message: "Sub-agents must report to a Department Head (not a peer or the Integrator directly).",
    };
  }
  if (parent.department !== department) {
    return {
      code: "sub_cross_department",
      message: `Sub-agent in '${department}' cannot report to Head in '${parent.department}'.`,
    };
  }
  return null;
}

/**
 * Handoff validation — a sub-agent may only hand off to its direct parent
 * (its Head) or a peer in the same department (another seat reporting to the
 * same Head). A Head hands off to the Integrator. An Integrator escalation
 * must go to the Visionary (null parent — handled outside the agent runtime,
 * as a notification to Marcin).
 */
export function canHandoff(args: {
  from: AgentShape;
  to: AgentShape;
  roster: AgentShape[];
}): { ok: true } | { ok: false; reason: string } {
  const { from, to, roster } = args;

  // Up: from → direct parent
  if (from.reportsToSeatId === to.id) return { ok: true };

  // Sideways: peers sharing a parent
  if (
    from.reportsToSeatId != null &&
    to.reportsToSeatId === from.reportsToSeatId &&
    from.department === to.department
  ) {
    return { ok: true };
  }

  // Heads can delegate downward to their own sub-agents (to.reportsToSeatId = from.id)
  if (from.isDepartmentHead && to.reportsToSeatId === from.id) return { ok: true };

  // Integrator may delegate to any Department Head
  if (from.department === "integrator" && to.isDepartmentHead) return { ok: true };

  // Otherwise reject — preserves the bottom-up escalation contract.
  return {
    ok: false,
    reason: `Handoff rejected: ${from.department}→${to.department} not permitted under the escalation rules. Route via the Department Head.`,
  };
}

/** Scan the roster and return every violation — used at boot for logging. */
export function auditRoster(roster: AgentShape[]): Array<{ agentId: number; v: HierarchyViolation }> {
  const out: Array<{ agentId: number; v: HierarchyViolation }> = [];
  for (const a of roster) {
    const siblings = roster.filter((s) => s.id !== a.id);
    const v = validateHierarchy(a, siblings);
    if (v) out.push({ agentId: a.id, v });
  }
  return out;
}
