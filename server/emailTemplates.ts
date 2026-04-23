/**
 * emailTemplates.ts — server-side template lookup + render.
 *
 * Templates live in the `emailTemplates` table (first-class entity).
 * The `key` column is a stable machine identifier; code paths look templates
 * up by key and fill merge vars via `renderTemplate`.
 *
 * If a template is missing (e.g. fresh DB before seed ran), callers can
 * fall back to the inline defaults in `appSettings` (legacy path).
 */
import { getDb } from "./db";
import { emailTemplates } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";

const TENANT_ID = 1;

export type EmailTemplateKey =
  | "magic_link"
  | "estimate_sent"
  | "estimate_approved"
  | "invoice_sent"
  | "invoice_paid"
  | "job_sign_off"
  | "change_order_approved";

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
  preheader: string;
}

/** Substitute {{var}} placeholders with string values. Missing vars render as empty. */
export function renderTemplate(
  template: string | null | undefined,
  vars: Record<string, string | number | null | undefined>,
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v === null || v === undefined ? "" : String(v);
  });
}

/**
 * Look up a template by key and render it with merge vars.
 * Returns null if no template found (caller should fall back to inline defaults).
 */
export async function renderEmailTemplate(
  key: EmailTemplateKey | string,
  vars: Record<string, string | number | null | undefined>,
): Promise<RenderedTemplate | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(emailTemplates)
    .where(and(eq(emailTemplates.tenantId, TENANT_ID), eq(emailTemplates.key, key)))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    subject: renderTemplate(row.subject, vars),
    html: renderTemplate(row.html, vars),
    text: renderTemplate(row.text ?? "", vars),
    preheader: renderTemplate(row.preheader ?? "", vars),
  };
}
