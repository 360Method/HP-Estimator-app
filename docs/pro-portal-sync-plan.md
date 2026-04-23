# Pro ↔ Portal Sync Plan
**Status:** Awaiting approval  
**Date:** 2026-04-13

---

## Root Cause Summary

The pro side (EstimatorContext) is a **client-side in-memory state machine** that syncs to the DB only once on login (`useDbSync`). The portal side writes directly to the DB. The two never talk in real time. Specific failures:

| Symptom | Root Cause |
|---|---|
| Estimate stays "Draft" on pro side after portal approval | `MERGE_DB_CUSTOMERS` only adds **new** customers; it never overwrites existing in-memory opportunities. Portal writes `stage='Won'` to DB but the pro browser never re-reads it. |
| Pro pipeline does not auto-advance stage | `updateOpportunity` in `portal.ts` writes `stage='Won'` and `wonAt` to DB correctly, but the pro client's React state is stale. |
| Pro side never sees deposit invoice created by portal | Deposit invoice is created in `portalInvoices` (portal schema), not in the pro-side `invoices` table. No bridge exists. |
| Messaging is one-way | `portalMessages` table exists and InboxPage reads it, but there is no unread badge, no polling, and no SSE push to the pro side when a customer sends a message. |
| Portal customer doesn't see pro-side job updates immediately | Portal reads DB directly, so job progress updates are visible — but only after a manual page refresh (no polling/SSE on the portal side). |

---

## Proposed Fix Plan (6 Workstreams)

### WS-1: Pro-side opportunity live-reload on portal events

**Problem:** Pro browser never re-reads DB after portal approval.  
**Fix:**
- Add a `GET /api/events/opportunities` SSE endpoint that fires whenever `updateOpportunity` is called from the portal router.
- Add a `useOpportunitySSE` hook on the pro side that listens to this stream and dispatches `UPDATE_OPPORTUNITY` into EstimatorContext when a matching opportunity changes.
- Fallback: add a `portal.getOpportunityStatus` tRPC query + a 30-second polling interval in `useDbSync` that re-fetches opportunities with `updatedAt > lastSyncedAt`.

**Stage mapping on approval:**
- `stage = 'Won'` + `wonAt = now` → pro pipeline shows opportunity under **Won** column.
- `area` stays `'estimate'` until pro manually converts to job (matches existing `APPROVE_ESTIMATE` flow).

---

### WS-2: Pro pipeline stage auto-advance rules

**Problem:** Even if the pro re-reads the DB, the stage value `'Won'` may not match the expected pipeline column label.  
**Fix:**
- Confirm that `'Won'` is a valid `OpportunityStage` value in `types.ts` and that the pipeline board renders a **Won** column for `area='estimate'`.
- Add a `portalApprovedAt` field to the opportunity DB row so the pro can distinguish "approved via portal" from "approved in-app".
- Show an **"Approved via Portal"** badge on the opportunity card (already partially done in PipelineBoard — verify it reads `wonAt` from the re-synced DB row).

---

### WS-3: Portal → Pro invoice bridge

**Problem:** Deposit invoice created in `portalInvoices` is invisible to the pro-side `InvoiceSection`.  
**Fix (two options — pick one):**
- **Option A (recommended):** When `approveEstimate` creates a `portalInvoice`, also write a corresponding row to the pro-side `invoices` table (linked by `hpOpportunityId`). The pro `InvoiceSection` already reads from this table.
- **Option B:** Add a `portal.getInvoicesByOpportunity` HP procedure and a new "Portal Invoices" sub-tab in `InvoiceSection` that shows portal-originated invoices read-only.

Option A is cleaner — one source of truth per invoice.

---

### WS-4: Bidirectional messaging with unread badges

**Problem:** Pro InboxPage reads `portalMessages` but has no real-time push and no unread count badge in the nav.  
**Fix:**
- Extend the existing SSE infrastructure (`/api/sse`) to broadcast a `portal_message` event when a customer sends a message.
- Add an unread count badge to the Inbox nav icon in `MetricsBar` — query `portalMessages` where `senderRole='customer' AND readAt IS NULL`.
- Add a `markPortalMessageRead` mutation that fires when the pro opens a conversation thread.
- On the portal side, add a 15-second polling interval to the `PortalMessages` page so customers see HP replies without a manual refresh.

---

### WS-5: Portal real-time job progress updates

**Problem:** Portal `PortalJobDetail` shows milestones and updates but requires a manual refresh to see new HP posts.  
**Fix:**
- Add a 20-second `refetchInterval` to the `portal.getCustomerJobProgress` query in `PortalJobDetail`.
- When HP posts a job update (`postJobUpdate`), call `notifyOwner` (already done) **and** trigger an email to the customer (same pattern as `sendOverdueReminderEmail`).

---

### WS-6: Change order status badge on pro pipeline card

**Problem:** When a CO is pending customer approval, the pro has no visual alert without opening the job.  
**Fix:**
- Add a `portal.getPendingCOCount` HP procedure that returns a count of `portalChangeOrders` where `status='sent'` grouped by `hpOpportunityId`.
- In `PipelineBoard KanbanCard`, show an amber **"CO Pending"** badge when count > 0 (mirrors the existing "Approved via Portal" badge pattern).

---

## Implementation Order

| Priority | Workstream | Effort | Impact |
|---|---|---|---|
| P0 | WS-1: Opportunity live-reload | Medium | Fixes the reported bug immediately |
| P0 | WS-2: Stage auto-advance rules | Small | Ensures pipeline column is correct |
| P1 | WS-3: Invoice bridge | Medium | Closes the deposit invoice gap |
| P1 | WS-4: Bidirectional messaging | Medium | Closes the messaging gap |
| P2 | WS-5: Portal job progress polling | Small | Better UX for customers |
| P2 | WS-6: CO badge on pipeline card | Small | Pro-side awareness |

---

## Out of Scope (Deferred)

- Full WebSocket real-time sync (overkill for a single-user tool; SSE + polling is sufficient).
- Merging `portalInvoices` and pro `invoices` into a single table (requires a large migration).
- Customer-initiated stage changes (customers cannot move their own pipeline stage).

---

## Approval

Review the plan above. Reply **"approved"** to begin implementation, or request changes to any workstream.
