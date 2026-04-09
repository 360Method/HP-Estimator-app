/**
 * useDbSync — On-login DB → EstimatorContext sync.
 *
 * Fires once when the user is authenticated. Fetches all customers with
 * their opportunities from the database and merges them into the local
 * EstimatorContext state via MERGE_DB_CUSTOMERS.
 *
 * Merge strategy:
 *  - Customers already in local state are skipped (preserves unsaved edits).
 *  - New DB-only customers are prepended to the list.
 *
 * This ensures the Customers list is always populated from the DB on login,
 * without requiring the admin to navigate through the Requests page.
 */
import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useEstimator } from "@/contexts/EstimatorContext";
import type { Customer, Opportunity, PipelineArea, OpportunityStage } from "@/lib/types";

/** Convert a DB opportunity row to the in-memory Opportunity shape */
function dbOppToLocal(o: any): Opportunity {
  return {
    id: o.id,
    area: (o.area ?? "lead") as PipelineArea,
    stage: (o.stage ?? "New Lead") as OpportunityStage,
    title: o.title ?? "",
    value: o.value ?? 0,
    jobNumber: o.jobNumber ?? undefined,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : (o.createdAt ?? new Date().toISOString()),
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : (o.updatedAt ?? new Date().toISOString()),
    notes: o.notes ?? "",
    archived: o.archived ?? false,
    archivedAt: o.archivedAt ?? undefined,
    sourceLeadId: o.sourceLeadId ?? undefined,
    sourceEstimateId: o.sourceEstimateId ?? undefined,
    convertedToEstimateAt: o.convertedToEstimateAt ?? undefined,
    convertedToJobAt: o.convertedToJobAt ?? undefined,
    sentAt: o.sentAt ?? undefined,
    wonAt: o.wonAt ?? undefined,
    scheduledDate: o.scheduledDate ?? undefined,
    scheduledEndDate: o.scheduledEndDate ?? undefined,
    scheduledDuration: o.scheduledDuration ?? undefined,
    assignedTo: o.assignedTo ?? undefined,
    scheduleNotes: o.scheduleNotes ?? undefined,
    tasks: (() => { try { return JSON.parse(o.tasks ?? "null") ?? undefined; } catch { return undefined; } })(),
    attachments: (() => { try { return JSON.parse(o.attachments ?? "null") ?? undefined; } catch { return undefined; } })(),
    jobActivity: (() => { try { return JSON.parse(o.jobActivity ?? "null") ?? undefined; } catch { return undefined; } })(),
    clientSnapshot: (() => { try { return JSON.parse(o.clientSnapshot ?? "null") ?? undefined; } catch { return undefined; } })(),
  };
}

/** Convert a DB customer row (with embedded opportunities) to the in-memory Customer shape */
function dbCustomerToLocal(dbCust: any): Customer {
  let tags: string[] = [];
  try { tags = JSON.parse(dbCust.tags ?? "[]"); } catch { tags = []; }

  const opportunities: Opportunity[] = (dbCust.opportunities ?? []).map(dbOppToLocal);

  return {
    id: dbCust.id,
    firstName: dbCust.firstName ?? "",
    lastName: dbCust.lastName ?? "",
    displayName: dbCust.displayName ?? "",
    company: dbCust.company ?? "",
    mobilePhone: dbCust.mobilePhone ?? "",
    homePhone: dbCust.homePhone ?? "",
    workPhone: dbCust.workPhone ?? "",
    email: dbCust.email ?? "",
    role: dbCust.role ?? "",
    customerType: (dbCust.customerType ?? "homeowner") as "homeowner" | "business",
    doNotService: dbCust.doNotService ?? false,
    street: dbCust.street ?? "",
    unit: dbCust.unit ?? "",
    city: dbCust.city ?? "",
    state: dbCust.state ?? "",
    zip: dbCust.zip ?? "",
    addressNotes: dbCust.addressNotes ?? "",
    customerNotes: dbCust.customerNotes ?? "",
    billsTo: dbCust.billsTo ?? "",
    tags,
    leadSource: (dbCust.leadSource ?? "") as any,
    referredBy: dbCust.referredBy ?? "",
    sendNotifications: dbCust.sendNotifications ?? true,
    sendMarketingOptIn: dbCust.sendMarketingOptIn ?? false,
    defaultTaxCode: dbCust.defaultTaxCode ?? undefined,
    createdAt: dbCust.createdAt instanceof Date
      ? dbCust.createdAt.toISOString()
      : (dbCust.createdAt ?? new Date().toISOString()),
    lifetimeValue: dbCust.lifetimeValue ?? 0,
    outstandingBalance: dbCust.outstandingBalance ?? 0,
    opportunities,
  };
}

/**
 * Call this hook once inside an authenticated component (e.g. Home.tsx).
 * It runs the sync exactly once per session (guarded by a ref).
 *
 * @param isAuthenticated - pass `true` only when the user is logged in.
 */
export function useDbSync(isAuthenticated: boolean) {
  const { mergeDbCustomers } = useEstimator();
  const hasSynced = useRef(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!isAuthenticated || hasSynced.current) return;
    hasSynced.current = true;

    utils.customers.listWithOpportunities.fetch({ limit: 500 })
      .then((dbCustomers) => {
        const locals = dbCustomers.map(dbCustomerToLocal);
        mergeDbCustomers(locals);
      })
      .catch((err) => {
        // Non-fatal — local state still works; log for debugging
        console.warn("[useDbSync] Failed to sync customers from DB:", err);
      });
  }, [isAuthenticated, mergeDbCustomers, utils]);
}
