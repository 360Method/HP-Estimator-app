/**
 * useDbSync — On-login DB → EstimatorContext sync.
 *
 * Fires once when the user is authenticated. Fetches:
 *  1. All customers with their opportunities
 *  2. All invoices (with line items + payments)
 *  3. All schedule events
 * …and merges them into the local EstimatorContext state.
 *
 * Merge strategy:
 *  - Customers already in local state are skipped (preserves unsaved edits).
 *  - Invoices and schedule events replace whatever is in localStorage.
 */
import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useEstimator } from "@/contexts/EstimatorContext";
import type {
  Customer,
  Opportunity,
  PipelineArea,
  OpportunityStage,
  Invoice,
  InvoiceLineItem,
  PaymentRecord,
  ScheduleEvent,
  ScheduleEventType,
  RecurrenceRule,
} from "@/lib/types";

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
    portalApprovedAt: o.portalApprovedAt ?? undefined,
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
    additionalPhones: (() => { try { return JSON.parse(dbCust.additionalPhones ?? "[]"); } catch { return []; } })(),
    email: dbCust.email ?? "",
    additionalEmails: (() => { try { return JSON.parse(dbCust.additionalEmails ?? "[]"); } catch { return []; } })(),
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

/** Convert a DB invoice row (with lineItems + payments) to the in-memory Invoice shape */
function dbInvoiceToLocal(dbInv: any): Invoice {
  const lineItems: InvoiceLineItem[] = (dbInv.lineItems ?? []).map((li: any) => ({
    id: li.id,
    description: li.description ?? "",
    qty: li.qty ?? 1,
    unitPrice: li.unitPrice ?? 0,
    total: li.total ?? 0,
    notes: li.notes ?? undefined,
  }));
  const payments: PaymentRecord[] = (dbInv.payments ?? []).map((p: any) => ({
    id: p.id,
    method: p.method ?? "other",
    amount: p.amount ?? 0,
    paidAt: p.paidAt ?? new Date().toISOString(),
    reference: p.reference ?? "",
    note: p.note ?? "",
  }));
  return {
    id: dbInv.id,
    type: (dbInv.type ?? "deposit") as "deposit" | "final",
    status: dbInv.status ?? "draft",
    invoiceNumber: dbInv.invoiceNumber ?? "",
    customerId: dbInv.customerId ?? "",
    opportunityId: dbInv.opportunityId ?? "",
    sourceEstimateId: dbInv.sourceEstimateId ?? undefined,
    subtotal: dbInv.subtotal ?? 0,
    taxRate: dbInv.taxRate ?? 0,
    taxAmount: dbInv.taxAmount ?? 0,
    total: dbInv.total ?? 0,
    depositPercent: dbInv.depositPercent ?? undefined,
    amountPaid: dbInv.amountPaid ?? 0,
    balance: dbInv.balance ?? 0,
    issuedAt: dbInv.issuedAt ?? new Date().toISOString(),
    dueDate: dbInv.dueDate ?? new Date().toISOString(),
    paidAt: dbInv.paidAt ?? undefined,
    serviceDate: dbInv.serviceDate ?? undefined,
    payments,
    lineItems,
    notes: dbInv.notes ?? "",
    internalNotes: dbInv.internalNotes ?? "",
    paymentTerms: dbInv.paymentTerms ?? undefined,
    taxLabel: dbInv.taxLabel ?? undefined,
    stripePaymentIntentId: dbInv.stripePaymentIntentId ?? undefined,
    stripeClientSecret: dbInv.stripeClientSecret ?? undefined,
    paypalOrderId: dbInv.paypalOrderId ?? undefined,
    completionSignature: dbInv.completionSignature ?? undefined,
    completionSignedBy: dbInv.completionSignedBy ?? undefined,
    completionSignedAt: dbInv.completionSignedAt ?? undefined,
  };
}

/** Convert a DB schedule event row to the in-memory ScheduleEvent shape */
function dbScheduleEventToLocal(dbEv: any): ScheduleEvent {
  let assignedTo: string[] = [];
  try { assignedTo = JSON.parse(dbEv.assignedTo ?? "[]"); } catch { assignedTo = []; }
  let recurrence: RecurrenceRule | undefined;
  try {
    const r = JSON.parse(dbEv.recurrence ?? "null");
    if (r) recurrence = r;
  } catch { recurrence = undefined; }
  return {
    id: dbEv.id,
    type: (dbEv.type ?? "task") as ScheduleEventType,
    title: dbEv.title ?? "",
    start: dbEv.start ?? "",
    end: dbEv.end ?? "",
    allDay: dbEv.allDay ?? false,
    opportunityId: dbEv.opportunityId ?? undefined,
    customerId: dbEv.customerId ?? undefined,
    assignedTo,
    notes: dbEv.notes ?? "",
    color: dbEv.color ?? undefined,
    recurrence,
    parentEventId: dbEv.parentEventId ?? undefined,
    completed: dbEv.completed ?? false,
    completedAt: dbEv.completedAt ?? undefined,
    createdAt: dbEv.createdAt instanceof Date
      ? dbEv.createdAt.toISOString()
      : (dbEv.createdAt ?? new Date().toISOString()),
    updatedAt: dbEv.updatedAt instanceof Date
      ? dbEv.updatedAt.toISOString()
      : (dbEv.updatedAt ?? new Date().toISOString()),
  };
}

/**
 * Call this hook once inside an authenticated component (e.g. Home.tsx).
 * It runs the sync exactly once per session (guarded by a ref).
 *
 * @param isAuthenticated - pass `true` only when the user is logged in.
 */
export function useDbSync(isAuthenticated: boolean) {
  const { mergeDbCustomers, mergeDbInvoices, mergeDbScheduleEvents } = useEstimator();
  const hasSynced = useRef(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!isAuthenticated || hasSynced.current) return;
    hasSynced.current = true;

    // 1. Customers + opportunities
    utils.customers.listWithOpportunities.fetch({ limit: 500 })
      .then((dbCustomers) => {
        const locals = dbCustomers.map(dbCustomerToLocal);
        mergeDbCustomers(locals);
      })
      .catch((err) => {
        console.warn("[useDbSync] Failed to sync customers from DB:", err);
      });

    // 2. Invoices (all, with line items + payments)
    utils.invoices.list.fetch({ limit: 500 })
      .then((dbInvoices) => {
        const locals = dbInvoices.map(dbInvoiceToLocal);
        mergeDbInvoices(locals);
      })
      .catch((err) => {
        console.warn("[useDbSync] Failed to sync invoices from DB:", err);
      });

    // 3. Schedule events
    utils.schedule.list.fetch({})
      .then((dbEvents) => {
        const locals = dbEvents.map(dbScheduleEventToLocal);
        mergeDbScheduleEvents(locals);
      })
      .catch((err) => {
        console.warn("[useDbSync] Failed to sync schedule events from DB:", err);
      });
  }, [isAuthenticated, mergeDbCustomers, mergeDbInvoices, mergeDbScheduleEvents, utils]);
}
