/**
 * Smoke tests for invoices and schedule DB helpers.
 * Verifies that the new DB tables and helpers are wired correctly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createInvoice,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  listInvoices,
  replaceInvoiceLineItems,
  listInvoiceLineItems,
  addInvoicePayment,
  listInvoicePayments,
  createScheduleEvent,
  getScheduleEventById,
  updateScheduleEvent,
  deleteScheduleEvent,
  listScheduleEvents,
} from './db';

const TEST_INV_ID = 'test-inv-001';
const TEST_EV_ID = 'test-ev-001';

describe('Invoice DB helpers', () => {
  afterAll(async () => {
    await deleteInvoice(TEST_INV_ID).catch(() => {});
    await deleteScheduleEvent(TEST_EV_ID).catch(() => {});
  });

  it('creates and retrieves an invoice', async () => {
    await createInvoice({
      id: TEST_INV_ID,
      type: 'deposit',
      status: 'draft',
      invoiceNumber: 'INV-TEST-001',
      customerId: 'cust-test',
      opportunityId: 'opp-test',
      subtotal: 1000,
      taxRate: 0,
      taxAmount: 0,
      total: 1000,
      amountPaid: 0,
      balance: 1000,
      issuedAt: new Date().toISOString(),
      dueDate: new Date().toISOString(),
    });
    const inv = await getInvoiceById(TEST_INV_ID);
    expect(inv).toBeTruthy();
    expect(inv!.invoiceNumber).toBe('INV-TEST-001');
    expect(inv!.total).toBe(1000);
  });

  it('updates invoice status', async () => {
    await updateInvoice(TEST_INV_ID, { status: 'sent' });
    const inv = await getInvoiceById(TEST_INV_ID);
    expect(inv!.status).toBe('sent');
  });

  it('replaces line items', async () => {
    await replaceInvoiceLineItems(TEST_INV_ID, [
      { id: 'li-1', description: 'Labor', qty: 2, unitPrice: 250, total: 500 },
    ]);
    const items = await listInvoiceLineItems(TEST_INV_ID);
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe('Labor');
  });

  it('adds a payment and lists payments', async () => {
    await addInvoicePayment({
      id: 'pay-1',
      invoiceId: TEST_INV_ID,
      method: 'cash',
      amount: 500,
      paidAt: new Date().toISOString(),
      reference: '',
    });
    const payments = await listInvoicePayments(TEST_INV_ID);
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(500);
  });

  it('lists invoices', async () => {
    const all = await listInvoices({ customerId: 'cust-test' });
    expect(all.length).toBeGreaterThan(0);
  });
});

describe('Schedule Event DB helpers', () => {
  it('creates and retrieves a schedule event', async () => {
    await createScheduleEvent({
      id: TEST_EV_ID,
      type: 'job',
      title: 'Test Phase — Test Job',
      start: new Date().toISOString(),
      end: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      allDay: false,
      customerId: 'cust-test',
      opportunityId: 'opp-test',
      completed: false,
    });
    const ev = await getScheduleEventById(TEST_EV_ID);
    expect(ev).toBeTruthy();
    expect(ev!.title).toBe('Test Phase — Test Job');
  });

  it('updates a schedule event', async () => {
    await updateScheduleEvent(TEST_EV_ID, { completed: true });
    const ev = await getScheduleEventById(TEST_EV_ID);
    expect(ev!.completed).toBe(true);
  });

  it('lists schedule events', async () => {
    const all = await listScheduleEvents({ customerId: 'cust-test' });
    expect(all.length).toBeGreaterThan(0);
  });
});
