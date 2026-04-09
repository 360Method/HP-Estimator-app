/**
 * Customers router — DB-backed CRUD for customers and their addresses.
 * All procedures are protectedProcedure (admin-only).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import {
  listCustomers,
  getCustomerById,
  findCustomerByEmail,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listCustomerAddresses,
  createCustomerAddress,
  deleteCustomerAddress,
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
});

export const customersRouter = router({
  /** List all customers, optionally filtered by search string */
  list: protectedProcedure
    .input(z.object({ search: z.string().optional(), limit: z.number().default(200), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      return listCustomers(input.search, input.limit, input.offset);
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

  /** Delete a customer */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteCustomer(input.id);
      return { success: true };
    }),

  /** Find customer by email (used during booking wizard dedup) */
  findByEmail: protectedProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      return findCustomerByEmail(input.email);
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
    }))
    .mutation(async ({ input }) => {
      const id = nanoid();
      return createCustomerAddress({ id, ...input });
    }),

  /** Remove an address */
  removeAddress: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteCustomerAddress(input.id);
      return { success: true };
    }),
});
