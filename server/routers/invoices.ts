/**
 * Invoices router — DB-backed CRUD for pro-side invoices.
 * Replaces the localStorage invoices[] array in EstimatorContext.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import {
  listInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  listInvoiceLineItems,
  replaceInvoiceLineItems,
  listInvoicePayments,
  addInvoicePayment,
  deleteInvoicePayment,
} from "../db";

const LineItemInput = z.object({
  id: z.string(),
  description: z.string(),
  qty: z.number().default(1),
  unitPrice: z.number().default(0),
  total: z.number().default(0),
  notes: z.string().optional(),
});

const PaymentInput = z.object({
  id: z.string(),
  method: z.string(),
  amount: z.number(),
  paidAt: z.string(),
  reference: z.string().default(""),
  note: z.string().optional(),
});

const InvoiceInput = z.object({
  id: z.string(),
  type: z.enum(["deposit", "final"]).default("deposit"),
  status: z.string().default("draft"),
  invoiceNumber: z.string(),
  customerId: z.string(),
  opportunityId: z.string(),
  sourceEstimateId: z.string().optional(),
  subtotal: z.number().default(0),
  taxRate: z.number().default(0),
  taxAmount: z.number().default(0),
  total: z.number().default(0),
  depositPercent: z.number().optional(),
  amountPaid: z.number().default(0),
  balance: z.number().default(0),
  issuedAt: z.string(),
  dueDate: z.string(),
  paidAt: z.string().optional(),
  serviceDate: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  paymentTerms: z.string().optional(),
  taxLabel: z.string().optional(),
  stripePaymentIntentId: z.string().optional(),
  stripeClientSecret: z.string().optional(),
  paypalOrderId: z.string().optional(),
  completionSignatureUrl: z.string().optional(),
  completionSignedBy: z.string().optional(),
  completionSignedAt: z.string().optional(),
  lineItems: z.array(LineItemInput).default([]),
  payments: z.array(PaymentInput).default([]),
});

export const invoicesRouter = router({
  /** List invoices, optionally filtered by customer or opportunity */
  list: protectedProcedure
    .input(z.object({
      customerId: z.string().optional(),
      opportunityId: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().default(200),
    }))
    .query(async ({ input }) => {
      const rows = await listInvoices(input);
      // Attach line items and payments to each invoice
      const result = await Promise.all(rows.map(async (inv) => {
        const lineItems = await listInvoiceLineItems(inv.id);
        const payments = await listInvoicePayments(inv.id);
        return { ...inv, lineItems, payments };
      }));
      return result;
    }),

  /** Get a single invoice with line items and payments */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const inv = await getInvoiceById(input.id);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      const lineItems = await listInvoiceLineItems(inv.id);
      const payments = await listInvoicePayments(inv.id);
      return { ...inv, lineItems, payments };
    }),

  /** Create or upsert a full invoice (with line items) */
  create: protectedProcedure
    .input(InvoiceInput)
    .mutation(async ({ input }) => {
      const { lineItems, payments, ...invoiceData } = input;
      await createInvoice(invoiceData);
      await replaceInvoiceLineItems(input.id, lineItems);
      // Payments are added separately via addPayment
      return getInvoiceById(input.id);
    }),

  /** Update invoice fields (not line items) */
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: InvoiceInput.partial().omit({ id: true, lineItems: true, payments: true }),
    }))
    .mutation(async ({ input }) => {
      const existing = await getInvoiceById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await updateInvoice(input.id, input.data);
      return getInvoiceById(input.id);
    }),

  /** Replace all line items for an invoice */
  updateLineItems: protectedProcedure
    .input(z.object({
      invoiceId: z.string(),
      lineItems: z.array(LineItemInput),
    }))
    .mutation(async ({ input }) => {
      await replaceInvoiceLineItems(input.invoiceId, input.lineItems);
      return listInvoiceLineItems(input.invoiceId);
    }),

  /** Add a payment record to an invoice and recalculate amountPaid/balance/status */
  addPayment: protectedProcedure
    .input(z.object({
      invoiceId: z.string(),
      payment: PaymentInput,
    }))
    .mutation(async ({ input }) => {
      const inv = await getInvoiceById(input.invoiceId);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      await addInvoicePayment({ ...input.payment, invoiceId: input.invoiceId });
      // Recalculate totals
      const payments = await listInvoicePayments(input.invoiceId);
      const amountPaid = payments.reduce((s, p) => s + p.amount, 0);
      const balance = inv.total - amountPaid;
      const status = balance <= 0 ? "paid" : amountPaid > 0 ? "partial" : inv.status;
      await updateInvoice(input.invoiceId, {
        amountPaid,
        balance,
        status,
        paidAt: balance <= 0 ? new Date().toISOString() : undefined,
      });
      return getInvoiceById(input.invoiceId);
    }),

  /** Remove a payment record */
  removePayment: protectedProcedure
    .input(z.object({ invoiceId: z.string(), paymentId: z.string() }))
    .mutation(async ({ input }) => {
      await deleteInvoicePayment(input.paymentId);
      const inv = await getInvoiceById(input.invoiceId);
      if (!inv) return;
      const payments = await listInvoicePayments(input.invoiceId);
      const amountPaid = payments.reduce((s, p) => s + p.amount, 0);
      const balance = inv.total - amountPaid;
      const status = balance <= 0 ? "paid" : amountPaid > 0 ? "partial" : "due";
      await updateInvoice(input.invoiceId, { amountPaid, balance, status });
      return getInvoiceById(input.invoiceId);
    }),

  /** Void an invoice */
  void: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await updateInvoice(input.id, { status: "void" });
    }),

  /** Delete an invoice and all its line items + payments */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteInvoice(input.id);
    }),

  /** Bulk upsert — used for migrating localStorage data to DB */
  bulkUpsert: protectedProcedure
    .input(z.array(InvoiceInput))
    .mutation(async ({ input }) => {
      for (const inv of input) {
        const { lineItems, payments, ...invoiceData } = inv;
        const existing = await getInvoiceById(inv.id);
        if (existing) {
          await updateInvoice(inv.id, invoiceData);
        } else {
          await createInvoice(invoiceData);
        }
        await replaceInvoiceLineItems(inv.id, lineItems);
      }
      return { count: input.length };
    }),
});
