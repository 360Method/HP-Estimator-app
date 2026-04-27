/**
 * Customers router — DB-backed CRUD for customers and their addresses.
 * All procedures are protectedProcedure (admin-only).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import {
  listCustomers,
  listCustomersFiltered,
  getCustomerById,
  findCustomerByEmail,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listCustomerAddresses,
  createCustomerAddress,
  updateCustomerAddress,
  deleteCustomerAddress,
  listOpportunities,
  detectDuplicates,
  mergeCustomers,
  mergeStubIntoCustomer,
  bulkAddTag,
} from "../db";
import { nanoid } from "nanoid";

const CustomerInput = z.object({
  firstName: z.string().default(""),
  lastName: z.string().default(""),
  displayName: z.string().default(""),
  company: z.string().default(""),
  mobilePhone: z.string().default(""),
  homePhone: z.string().default(""),
  workPhone: z.string().default(""),
  email: z.string().default(""),
  role: z.string().default(""),
  customerType: z.enum(["homeowner", "business"]).default("homeowner"),
  doNotService: z.boolean().default(false),
  street: z.string().default(""),
  unit: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  zip: z.string().default(""),
  addressNotes: z.string().optional(),
  customerNotes: z.string().optional(),
  billsTo: z.string().default(""),
  tags: z.array(z.string()).default([]),
  leadSource: z.string().default(""),
  referredBy: z.string().default(""),
  sendNotifications: z.boolean().default(true),
  sendMarketingOptIn: z.boolean().default(false),
  defaultTaxCode: z.string().optional(),
  additionalPhones: z.string().optional(), // JSON: [{label, number}]
  additionalEmails: z.string().optional(), // JSON: [{label, address}]
});

export const customersRouter = router({
  /** List all customers, optionally filtered by search string */
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().default(200), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      return listCustomers(input.search, input.limit, input.offset);
    }),

  /** Advanced filtered list with type/leadSource/tags/city/zip/sort */
  listFiltered: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      customerType: z.string().optional(),
      leadSource: z.string().optional(),
      tags: z.array(z.string()).optional(),
      city: z.string().optional(),
      zip: z.string().optional(),
      sortBy: z.enum(['lastName', 'city', 'createdAt', 'lifetimeValue']).optional(),
      sortDir: z.enum(['asc', 'desc']).optional(),
      limit: z.number().default(300),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      return listCustomersFiltered(input);
    }),

  /**
   * List all customers with their opportunities (leads, estimates, jobs).
   * Used for the on-login DB→state sync so the admin Customers list is
   * always populated from the database without manual navigation.
   */
  listWithOpportunities: protectedProcedure
    .input(z.object({ limit: z.number().default(500) }))
    .query(async ({ input }) => {
      const [allCustomers, allOpps] = await Promise.all([
        listCustomers(undefined, input.limit, 0),
        listOpportunities(undefined, undefined, false, 2000),
      ]);
      // Group opportunities by customerId for O(n) lookup
      const oppsByCustomer = new Map<string, typeof allOpps>();
      for (const opp of allOpps) {
        const list = oppsByCustomer.get(opp.customerId) ?? [];
        list.push(opp);
        oppsByCustomer.set(opp.customerId, list);
      }
      return allCustomers.map(c => ({
        ...c,
        opportunities: oppsByCustomer.get(c.id) ?? [],
      }));
    }),

  /** Get a single customer by ID, with addresses */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const customer = await getCustomerById(input.id);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      const addresses = await listCustomerAddresses(input.id);
      return { ...customer, addresses };
    }),

  /** Create a new customer */
  create: protectedProcedure
    .input(CustomerInput)
    .mutation(async ({ input }) => {
      const id = nanoid();
      const displayName = input.displayName || `${input.firstName} ${input.lastName}`.trim() || input.company || "Unknown";
      const customer = await createCustomer({
        id,
        ...input,
        displayName,
        tags: JSON.stringify(input.tags),
        email: input.email.toLowerCase().trim(),
      });
      // Phase 4 trigger: customer with a lead-source flag is a fresh lead.
      // Fires Lead Nurturer AI (and any other lead.created subscribers).
      if ((input.leadSource ?? "").trim().length > 0) {
        const { emitAgentEvent } = await import("../lib/agentRuntime/triggerBus");
        emitAgentEvent("lead.created", {
          customerId: id,
          displayName,
          email: input.email,
          mobilePhone: input.mobilePhone,
          leadSource: input.leadSource,
          referredBy: input.referredBy,
        }).catch(() => null);
      }
      return customer;
    }),

  /** Update an existing customer */
  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(CustomerInput.partial()))
    .mutation(async ({ input }) => {
      const { id, tags, ...rest } = input;
      const existing = await getCustomerById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      await updateCustomer(id, {
        ...rest,
        ...(tags !== undefined ? { tags: JSON.stringify(tags) } : {}),
        ...(rest.email ? { email: rest.email.toLowerCase().trim() } : {}),
      });
      return getCustomerById(id);
    }),

  /** Delete a customer (only if no linked opportunities) */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteCustomer(input.id);
      return { success: true };
    }),

  /** Bulk delete customers — skips any that have linked opportunities */
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const allOpps = await listOpportunities(undefined, undefined, false, 5000);
      const idsWithOpps = new Set(allOpps.map(o => o.customerId));
      const skipped: string[] = [];
      const deleted: string[] = [];
      for (const id of input.ids) {
        if (idsWithOpps.has(id)) {
          skipped.push(id);
        } else {
          await deleteCustomer(id);
          deleted.push(id);
        }
      }
      return { deleted, skipped };
    }),

  /** Find customer by email (used during booking wizard dedup) */
  findByEmail: protectedProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      return findCustomerByEmail(input.email);
    }),

  // ── Deduplication & Merge ──────────────────────────────────────────────────

  /** Detect likely duplicate customer groups */
  detectDuplicates: protectedProcedure
    .query(async () => {
      return detectDuplicates();
    }),

  /**
   * Merge a stub (unknown-caller) customer into a real customer.
   * Transfers all conversations, opportunities, invoices, and schedule events, then deletes the stub.
   */
  mergeStub: protectedProcedure
    .input(z.object({ stubId: z.string(), targetId: z.string() }))
    .mutation(async ({ input }) => {
      if (input.stubId === input.targetId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot merge a customer into itself' });
      }
      await mergeStubIntoCustomer(input.stubId, input.targetId);
      return { success: true };
    }),

  /** Merge sourceId into targetId (re-parents opps/addresses/conversations, soft-deletes source) */
  merge: protectedProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string() }))
    .mutation(async ({ input }) => {
      if (input.sourceId === input.targetId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot merge a customer with itself" });
      }
      await mergeCustomers(input.sourceId, input.targetId);
      return { success: true };
    }),

  // ── Bulk Tag ───────────────────────────────────────────────────────────────

  /** Add a tag to multiple customers */
  bulkAddTag: protectedProcedure
    .input(z.object({ customerIds: z.array(z.string()), tag: z.string().min(1) }))
    .mutation(async ({ input }) => {
      await bulkAddTag(input.customerIds, input.tag);
      return { success: true };
    }),

  // ── Export CSV ─────────────────────────────────────────────────────────────

  /** Export selected customers as CSV string */
  exportCsv: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const rows = await Promise.all(input.ids.map(id => getCustomerById(id)));
      const valid = rows.filter(Boolean) as Awaited<ReturnType<typeof getCustomerById>>[];
      const header = ['Name', 'Company', 'Email', 'Mobile', 'Street', 'City', 'State', 'Zip', 'Type', 'Lead Source', 'Tags', 'Lifetime Value', 'Outstanding Balance', 'Created'];
      const escape = (v: string | number | null | undefined) => {
        const s = String(v ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [header.join(',')];
      for (const c of valid) {
        if (!c) continue;
        const tags: string[] = c.tags ? JSON.parse(c.tags as unknown as string) : [];
        lines.push([
          escape(`${c.firstName} ${c.lastName}`.trim() || c.displayName),
          escape(c.company),
          escape(c.email),
          escape(c.mobilePhone),
          escape(c.street),
          escape(c.city),
          escape(c.state),
          escape(c.zip),
          escape(c.customerType),
          escape(c.leadSource),
          escape(tags.join('; ')),
          escape(c.lifetimeValue),
          escape(c.outstandingBalance),
          escape(c.createdAt?.toISOString?.() ?? ''),
        ].join(','));
      }
      return { csv: lines.join('\n') };
    }),

  // ── Addresses ──────────────────────────────────────────────────────────────

  /** List all addresses for a customer */
  listAddresses: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      return listCustomerAddresses(input.customerId);
    }),

  /** Add an address to a customer */
  addAddress: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      label: z.string().default("Home"),
      street: z.string(),
      unit: z.string().default(""),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      isPrimary: z.boolean().default(false),
      isBilling: z.boolean().default(false),
      propertyNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = nanoid();
      return createCustomerAddress({ id, ...input });
    }),

  /** Set one address as primary (clears isPrimary on all others for this customer) */
  setPrimaryAddress: protectedProcedure
    .input(z.object({ customerId: z.string(), addressId: z.string() }))
    .mutation(async ({ input }) => {
      // Clear all primary flags for this customer then set the chosen one
      const allAddresses = await listCustomerAddresses(input.customerId);
      for (const addr of allAddresses) {
        await updateCustomerAddress(addr.id, { isPrimary: addr.id === input.addressId });
      }
      return { success: true };
    }),

  /** Set one address as billing (clears isBilling on all others for this customer) */
  setBillingAddress: protectedProcedure
    .input(z.object({ customerId: z.string(), addressId: z.string() }))
    .mutation(async ({ input }) => {
      const allAddresses = await listCustomerAddresses(input.customerId);
      for (const addr of allAddresses) {
        await updateCustomerAddress(addr.id, { isBilling: addr.id === input.addressId });
      }
      return { success: true };
    }),

  /** Update an address */
  updateAddress: protectedProcedure
    .input(z.object({
      id: z.string(),
      label: z.string().optional(),
      street: z.string().optional(),
      unit: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      isPrimary: z.boolean().optional(),
      isBilling: z.boolean().optional(),
      propertyNotes: z.string().optional(),
      lat: z.string().optional(),
      lng: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateCustomerAddress(id, data);
      return { success: true };
    }),

  /** Remove an address */
  removeAddress: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteCustomerAddress(input.id);
      return { success: true };
    }),

  /** Import customers from CSV rows (upsert by email) */
  importCsv: protectedProcedure
    .input(z.object({
      rows: z.array(z.object({
        displayName: z.string().default(''),
        firstName: z.string().default(''),
        lastName: z.string().default(''),
        company: z.string().default(''),
        email: z.string().default(''),
        mobilePhone: z.string().default(''),
        homePhone: z.string().default(''),
        workPhone: z.string().default(''),
        street: z.string().default(''),
        city: z.string().default(''),
        state: z.string().default(''),
        zip: z.string().default(''),
        customerType: z.string().default(''),
        leadSource: z.string().default(''),
        notes: z.string().default(''),
        tags: z.string().default(''),
      }))
    }))
    .mutation(async ({ input }) => {
      const { nanoid } = await import('nanoid');
      let created = 0;
      let updated = 0;
      for (const row of input.rows) {
        const existing = row.email ? await findCustomerByEmail(row.email) : null;
        const tags = row.tags ? JSON.stringify(row.tags.split(';').map((t: string) => t.trim()).filter(Boolean)) : '[]';
        if (existing) {
          await updateCustomer(existing.id, {
            ...(row.displayName && { displayName: row.displayName }),
            ...(row.firstName && { firstName: row.firstName }),
            ...(row.lastName && { lastName: row.lastName }),
            ...(row.company && { company: row.company }),
            ...(row.mobilePhone && { mobilePhone: row.mobilePhone }),
            ...(row.homePhone && { homePhone: row.homePhone }),
            ...(row.workPhone && { workPhone: row.workPhone }),
            ...(row.street && { street: row.street }),
            ...(row.city && { city: row.city }),
            ...(row.state && { state: row.state }),
            ...(row.zip && { zip: row.zip }),
            ...(row.customerType && { customerType: row.customerType as any }),
            ...(row.leadSource && { leadSource: row.leadSource as any }),
            ...(row.notes && { notes: row.notes }),
            ...(row.tags && { tags }),
          });
          updated++;
        } else {
          const name = row.displayName || `${row.firstName} ${row.lastName}`.trim() || row.email || 'Imported';
          await createCustomer({
            id: nanoid(),
            displayName: name,
            firstName: row.firstName || '',
            lastName: row.lastName || '',
            company: row.company || '',
            email: row.email || '',
            mobilePhone: row.mobilePhone || '',
            homePhone: row.homePhone || '',
            workPhone: row.workPhone || '',
            street: row.street || '',
            city: row.city || '',
            state: row.state || '',
            zip: row.zip || '',
            customerType: (row.customerType as any) || 'homeowner',
            leadSource: (row.leadSource as any) || 'other',
            customerNotes: row.notes || '',
            tags,
            lifetimeValue: 0,
            outstandingBalance: 0,
          });
          created++;
        }
      }
      return { created, updated, skipped: 0, total: input.rows.length };
    }),

  // ── Real-time duplicate lookup (used during intake forms) ─────────────────
  findSimilar: protectedProcedure
    .input(z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      excludeId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const all = await listCustomers(undefined, 1000, 0);
      const active = all.filter((c: any) => !c.mergedIntoId && c.id !== input.excludeId);

      const normPhone = (p?: string | null) => (p ?? '').replace(/\D/g, '').replace(/^1/, '').slice(-10);
      const normName = (s?: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
      function lev(a: string, b: string, max = 4): number {
        if (a === b) return 0;
        if (Math.abs(a.length - b.length) > max) return max + 1;
        const dp = Array.from({ length: b.length + 1 }, (_: unknown, i: number) => i);
        for (let i = 1; i <= a.length; i++) {
          let prev = dp[0]; dp[0] = i;
          for (let j = 1; j <= b.length; j++) {
            const tmp = dp[j];
            dp[j] = a[i-1] === b[j-1] ? prev : 1 + Math.min(prev, dp[j], dp[j-1]);
            prev = tmp;
          }
        }
        return dp[b.length];
      }

      const inPhone = normPhone(input.phone);
      const inName = normName(input.name);
      const inEmail = (input.email ?? '').toLowerCase().trim();

      const results: Array<{ customer: typeof active[0]; reason: string; score: number }> = [];

      for (const c of active) {
        let score = 0;
        let reason = '';

        const cEmail = ((c as any).email ?? '').toLowerCase().trim();
        if (inEmail && cEmail && inEmail === cEmail) { score = 100; reason = 'Same email'; }

        if (!reason) {
          const cPhone = normPhone((c as any).mobilePhone || (c as any).homePhone || (c as any).workPhone);
          if (inPhone.length >= 7 && cPhone.length >= 7 && inPhone === cPhone) { score = 95; reason = 'Same phone number'; }
        }

        if (!reason && inName.length >= 3) {
          const cName = normName((c as any).displayName || `${(c as any).firstName} ${(c as any).lastName}`);
          if (cName.length >= 3) {
            const dist = lev(inName, cName, 3);
            if (dist === 0) { score = 90; reason = 'Same name'; }
            else if (dist <= 2) { score = 75; reason = 'Similar name'; }
            else if (dist <= 3) { score = 55; reason = 'Possible name match'; }
          }
        }

        if (score >= 55) results.push({ customer: c, reason, score });
      }

      return results
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ customer, reason, score }) => ({
          id: (customer as any).id,
          displayName: (customer as any).displayName || `${(customer as any).firstName} ${(customer as any).lastName}`.trim(),
          email: (customer as any).email,
          mobilePhone: (customer as any).mobilePhone,
          city: (customer as any).city,
          state: (customer as any).state,
          reason,
          score,
        }));
    }),
});
