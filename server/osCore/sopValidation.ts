/**
 * server/osCore/sopValidation.ts
 *
 * Publish-time checks for HP-OS SOP documents. A document only reaches the
 * live registry as status=final + enabled=true, and the publish mutation
 * refuses to flip those flags while any of these checks fail. Messages are
 * plain language because the person reading them is not a developer.
 */

import { parseCron } from "../lib/agentRuntime/cron";
import { AGENT_EVENTS } from "../lib/agentRuntime/triggerBus";
// Side-effect imports populate the tool registry before tool keys are checked.
import "../lib/agentRuntime/phase2Tools";
import "../lib/agentRuntime/osTools";
import "../lib/agentRuntime/dispatcher/dispatcher";
import { getTool } from "../lib/agentRuntime/tools";

export type SopCandidate = {
  kind: "human" | "agent";
  body: string;
  events: string | null;
  cron: string | null;
  tools: string | null;
  approval: string;
  maxTurns: number;
  runLimitDaily: number;
  taskTitleTemplate: string | null;
  taskDueOffsetHours: number | null;
};

const MAX_TURNS_CEILING = 8;

function splitList(v: string | null): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function validateSopForPublish(c: SopCandidate): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  const events = splitList(c.events);
  const knownEvents = new Set<string>(AGENT_EVENTS);
  for (const ev of events) {
    if (!knownEvents.has(ev)) {
      errors.push(
        `This SOP listens for an event named "${ev}" that the system never fires. Known events: ${AGENT_EVENTS.join(", ")}.`,
      );
    }
  }

  if (c.cron && !parseCron(c.cron)) {
    errors.push(
      `The schedule "${c.cron}" is not a valid five-part cron expression (minute hour day-of-month month day-of-week, e.g. "0 7 * * *" for 7:00 every day).`,
    );
  }

  if (!c.cron && events.length === 0) {
    errors.push(
      "This SOP has no trigger: give it a schedule (cron) or at least one event, otherwise it will never run.",
    );
  }

  if (c.kind === "agent") {
    if (!c.body.trim()) {
      errors.push("An agent SOP needs instructions in the body; it is the system prompt for every run.");
    }
    for (const key of splitList(c.tools)) {
      if (!getTool(key)) {
        errors.push(`This SOP asks for a tool named "${key}" that does not exist.`);
      }
    }
    if (!["default", "always", "never-send"].includes(c.approval)) {
      errors.push(`Approval must be "default", "always", or "never-send" (got "${c.approval}").`);
    }
    if (!Number.isFinite(c.maxTurns) || c.maxTurns < 1 || c.maxTurns > MAX_TURNS_CEILING) {
      errors.push(`maxTurns must be between 1 and ${MAX_TURNS_CEILING}.`);
    }
    if (!Number.isFinite(c.runLimitDaily) || c.runLimitDaily < 1 || c.runLimitDaily > 500) {
      errors.push("runLimitDaily must be between 1 and 500.");
    }
  }

  if (c.kind === "human") {
    if (
      c.taskDueOffsetHours !== null &&
      c.taskDueOffsetHours !== undefined &&
      (!Number.isFinite(c.taskDueOffsetHours) || c.taskDueOffsetHours < 0 || c.taskDueOffsetHours > 24 * 90)
    ) {
      errors.push("The task due offset must be between 0 and 2160 hours (90 days).");
    }
    if (c.taskTitleTemplate && c.taskTitleTemplate.length > 300) {
      errors.push("The task title template is too long (300 characters max).");
    }
  }

  return { ok: errors.length === 0, errors };
}
