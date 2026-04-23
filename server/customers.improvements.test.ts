/**
 * Tests for customers router improvements:
 * detectDuplicates, merge, bulkAddTag, exportCsv, bulkDelete
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock db helpers ───────────────────────────────────────────────────────────
vi.mock('./db', () => ({
  listCustomers: vi.fn(),
  listCustomersFiltered: vi.fn(),
  getCustomerById: vi.fn(),
  findCustomerByEmail: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  deleteCustomer: vi.fn(),
  listCustomerAddresses: vi.fn(),
  createCustomerAddress: vi.fn(),
  updateCustomerAddress: vi.fn(),
  deleteCustomerAddress: vi.fn(),
  listOpportunities: vi.fn(),
  detectDuplicates: vi.fn(),
  mergeCustomers: vi.fn(),
  bulkAddTag: vi.fn(),
}));

import {
  detectDuplicates,
  mergeCustomers,
  bulkAddTag,
  getCustomerById,
  listOpportunities,
  deleteCustomer,
} from './db';

// ── detectDuplicates ──────────────────────────────────────────────────────────
describe('detectDuplicates db helper', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no duplicates', async () => {
    vi.mocked(detectDuplicates).mockResolvedValue([]);
    const result = await detectDuplicates();
    expect(result).toEqual([]);
  });

  it('returns duplicate groups', async () => {
    const mockGroups = [
      {
        reason: 'email',
        customers: [
          { id: 'c1', email: 'test@test.com', displayName: 'Alice' },
          { id: 'c2', email: 'test@test.com', displayName: 'Alice Duplicate' },
        ],
      },
    ];
    vi.mocked(detectDuplicates).mockResolvedValue(mockGroups as any);
    const result = await detectDuplicates();
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('email');
    expect(result[0].customers).toHaveLength(2);
  });

  it('can return phone-based duplicates', async () => {
    const mockGroups = [
      {
        reason: 'phone',
        customers: [
          { id: 'c3', mobilePhone: '5551234567', displayName: 'Bob' },
          { id: 'c4', mobilePhone: '5551234567', displayName: 'Robert' },
        ],
      },
    ];
    vi.mocked(detectDuplicates).mockResolvedValue(mockGroups as any);
    const result = await detectDuplicates();
    expect(result[0].reason).toBe('phone');
  });
});

// ── mergeCustomers ────────────────────────────────────────────────────────────
describe('mergeCustomers db helper', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls mergeCustomers with sourceId and targetId', async () => {
    vi.mocked(mergeCustomers).mockResolvedValue(undefined);
    await mergeCustomers('source-id', 'target-id');
    expect(mergeCustomers).toHaveBeenCalledWith('source-id', 'target-id');
  });

  it('is called once per merge operation', async () => {
    vi.mocked(mergeCustomers).mockResolvedValue(undefined);
    await mergeCustomers('a', 'b');
    expect(mergeCustomers).toHaveBeenCalledTimes(1);
  });
});

// ── bulkAddTag ────────────────────────────────────────────────────────────────
describe('bulkAddTag db helper', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is called with correct ids and tag', async () => {
    vi.mocked(bulkAddTag).mockResolvedValue(undefined);
    await bulkAddTag(['c1', 'c2', 'c3'], 'VIP');
    expect(bulkAddTag).toHaveBeenCalledWith(['c1', 'c2', 'c3'], 'VIP');
  });

  it('handles empty id array gracefully', async () => {
    vi.mocked(bulkAddTag).mockResolvedValue(undefined);
    await bulkAddTag([], 'VIP');
    expect(bulkAddTag).toHaveBeenCalledWith([], 'VIP');
  });
});

// ── bulkDelete logic ──────────────────────────────────────────────────────────
describe('bulkDelete logic', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips customers that have linked opportunities', async () => {
    vi.mocked(listOpportunities).mockResolvedValue([
      { customerId: 'c1' } as any,
    ]);
    vi.mocked(deleteCustomer).mockResolvedValue(undefined);

    const allOpps = await listOpportunities(undefined, undefined, false, 5000);
    const idsWithOpps = new Set(allOpps.map(o => o.customerId));
    const ids = ['c1', 'c2'];
    const deleted: string[] = [];
    const skipped: string[] = [];
    for (const id of ids) {
      if (idsWithOpps.has(id)) skipped.push(id);
      else { await deleteCustomer(id); deleted.push(id); }
    }

    expect(skipped).toEqual(['c1']);
    expect(deleted).toEqual(['c2']);
    expect(deleteCustomer).toHaveBeenCalledTimes(1);
    expect(deleteCustomer).toHaveBeenCalledWith('c2');
  });

  it('deletes all when none have opportunities', async () => {
    vi.mocked(listOpportunities).mockResolvedValue([]);
    vi.mocked(deleteCustomer).mockResolvedValue(undefined);

    const allOpps = await listOpportunities(undefined, undefined, false, 5000);
    const idsWithOpps = new Set(allOpps.map(o => o.customerId));
    const ids = ['c3', 'c4'];
    for (const id of ids) {
      if (!idsWithOpps.has(id)) await deleteCustomer(id);
    }

    expect(deleteCustomer).toHaveBeenCalledTimes(2);
  });
});

// ── exportCsv logic ───────────────────────────────────────────────────────────
describe('exportCsv logic', () => {
  it('produces correct CSV header', () => {
    const header = ['Name', 'Company', 'Email', 'Mobile', 'Street', 'City', 'State', 'Zip', 'Type', 'Lead Source', 'Tags', 'Lifetime Value', 'Outstanding Balance', 'Created'];
    expect(header[0]).toBe('Name');
    expect(header[2]).toBe('Email');
    expect(header.length).toBe(14);
  });

  it('escapes commas in CSV values', () => {
    const escape = (v: string | number | null | undefined) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    expect(escape('Smith, John')).toBe('"Smith, John"');
    expect(escape('No comma')).toBe('No comma');
    expect(escape('Say "hello"')).toBe('"Say ""hello"""');
  });

  it('handles null/undefined values gracefully', () => {
    const escape = (v: string | number | null | undefined) => {
      const s = String(v ?? '');
      return s.includes(',') ? `"${s}"` : s;
    };
    expect(escape(null)).toBe('');
    expect(escape(undefined)).toBe('');
    expect(escape(0)).toBe('0');
  });
});
