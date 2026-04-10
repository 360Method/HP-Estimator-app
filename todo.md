# HP Field Estimator — TODO

## Completed Features

- [x] Estimate Calculator (phases, line items, GM enforcement)
- [x] Sales View (customer-facing presentation)
- [x] Estimate PDF / Print view
- [x] Signature capture
- [x] Customer profile (CRM) with tabs: Profile, Leads, Estimates, Jobs, Invoices, Communication, Attachments, Notes
- [x] Multi-customer list (CustomersListPage)
- [x] Lead → Estimate → Job lifecycle conversion
- [x] Job Details tab inside job opportunities
- [x] Jobs global list page (JobsListPage)
- [x] Pipeline page with Kanban board (drag-and-drop) and Table view toggle
- [x] PipelineBoard shared component (used in customer profile and global Pipeline page)
- [x] Drag-and-drop fix: useDroppable columns + TouchSensor
- [x] Pipeline data sync: global Pipeline reads from state.customers directly
- [x] Invoice types added to data model (Invoice, PaymentRecord, InvoiceLineItem)
- [x] EstimatorState extended with invoices[] and invoiceCounter
- [x] Backend upgraded to web-db-user (Express + tRPC + DB)
- [x] Stripe integration: PaymentIntent creation, webhook handler (raw body before express.json)
- [x] PayPal integration: order creation, order capture
- [x] payments tRPC router (getStripePublishableKey, getPaypalClientId, createStripeIntent, createPaypalOrder, capturePaypalOrder)
- [x] InvoiceSection component: deposit + final invoice, Stripe card element, PayPal button, manual payment recording, payment history
- [x] Invoice tab added to BUILDER_TABS and JOB_BUILDER_TABS in MetricsBar
- [x] InvoiceSection wired into Home.tsx routing (activeSection === 'invoice')
- [x] InvoiceSection wired into CustomerSection Invoices tab (replaces placeholder)
- [x] Auto-deposit invoice (50%) generated when estimate is converted to job
- [x] Vitest tests for payments router

## Pending / Future

- [x] Final invoice auto-generation on job completion (Archive Job)
- [x] Invoice PDF export / print (InvoicePrintView with print-only isolation)
- [x] Send invoice to customer via email
- [x] Stripe webhook → update invoice status in DB (currently client-side only)
- [x] PayPal JS SDK integration (replace redirect flow with in-page approval)
- [x] Deposit % configurable per-job (currently defaults to 50%)
- [x] Tax rate per-customer or per-region
- [x] Communication tab (SMS/email log)
- [x] Attachments tab (photo uploads)
- [x] Reporting / analytics page
- [x] Marketing tab
- [x] Dashboard overview page (world-class EstimatorDashboard with KPIs, funnel, charts, activity)

## In Progress

- [x] Fix: job/estimate value not flowing through to deposit invoice amount (CalculatorSection now syncs grandTotals.price to opportunity.value via useEffect)
- [x] Add Clark County WA tax rates as selectable options in invoice creation dialog (WA DOR Q2 2026 rates)

## Invoice PDF Feature

- [x] Build InvoicePrintView component (mirrors estimate PDF layout)
- [x] Unique INV number per invoice (auto-incremented, e.g. INV-2026-001)
- [x] Job reference on invoice (customer name, job title, address, job number)
- [x] Line items from opportunity phases on invoice PDF
- [x] Tax breakdown on invoice PDF
- [x] Payment history summary on invoice PDF
- [x] Balance due prominently displayed
- [x] Customer signature block for job completion sign-off
- [x] Signature capture canvas on final invoice
- [x] Print/PDF button on InvoiceCard and InvoiceSection
- [x] Replace HouseCall Pro T&C link in invoice footer with HP-owned Terms & Conditions popup/page

## Dashboard Routing Fix

- [x] Fix: Dashboard nav click shows empty customer page instead of EstimatorDashboard
- [x] Set Dashboard as the default landing section when the app first opens

## Nav Routing Fixes

- [x] Fix: Jobs nav tab not navigating to JobsListPage
- [x] Fix: Pipeline nav tab not navigating to PipelinePage

## Schedule Tab (World-Class)

- [x] ScheduleEvent type added to types.ts (id, title, type, start, end, opportunityId, customerId, assignedTo, recurrence, color, notes)
- [x] scheduledDate, scheduledEndDate, assignedTo fields added to Opportunity interface
- [x] scheduleEvents[] and scheduleCounter added to EstimatorState
- [x] ADD_SCHEDULE_EVENT, UPDATE_SCHEDULE_EVENT, REMOVE_SCHEDULE_EVENT, UPDATE_OPPORTUNITY_SCHEDULE reducer actions
- [x] Build SchedulePage: month/week/day/agenda views, color-coded by type (estimate/job/recurring/task/follow_up)
- [x] Filter bar: by event type, by customer
- [x] Event detail panel: customer name, address, job title, stage, open-in-opportunity deep link
- [x] Drag-to-reschedule events (HTML5 drag-and-drop in month and week views)
- [x] EventFormModal: create/edit with customer/opportunity link, assignee, notes
- [x] Wire Schedule nav icon (CalendarDays) in MetricsBar
- [x] Wire Schedule into Home.tsx routing
- [x] Synthesize schedule events from opportunities with scheduledDate (auto-derived)
- [x] Vitest unit tests for schedule reducer (7 tests passing)
- [x] Add "Schedule" date fields to JobDetailsSection (service date, estimated duration)
- [x] Auto-create schedule event when job is created or estimate is scheduled

## Schedule Tab — Future Improvements

- [x] Add assignee and status filters to SchedulePage filter bar
- [x] Upgrade drag-reschedule to support time-slot precision in week/day views
- [x] Add event resize support (drag end time to adjust duration)
- [x] Add recurrence support in EventFormModal (daily/weekly/biweekly/monthly)
- [x] Add "Schedule" date fields to JobDetailsSection (service date, estimated duration)
- [x] Auto-create schedule event when job is created or estimate is scheduled

## Calculator Upgrade — Material Dimensions, Tiers & Portland Labor Rates

- [x] Research Portland metro labor rates (carpentry, tile, flooring, painting, plumbing, electrical, drywall, trim)
- [x] Build material catalog with dimension options and Good/Better/Best tiers
- [x] Add DimensionOption type and dimensionOptions/selectedDimension to LineItem
- [x] Add dimension dropdown to line items (tile sizes, plank widths, door/window sizes, framing sizes, etc.)
- [x] Add Good/Better/Best tier selector per line item (changes unit cost automatically, shows dimension-adjusted rate)
- [x] Add labor rate field per line item (pre-populated from Portland metro rates)
- [x] Show material cost, labor cost, and combined price in cost breakdown panel
- [x] Update default labor rates: GC $125/hr, Carpenter $95/hr, Tile $90-115/hr, Plumber $125/hr, Electrician $110/hr, HVAC $120/hr, Drywall $80/hr, Painter $80/hr, Flooring $70-90/hr, Demo $65/hr
- [x] Dimension picker added to SalesSection (pill buttons below tier cards)
- [x] Dimension picker added to CalculatorSection header row (quick dropdown) and expanded detail (button grid)
- [x] Vitest dimension rate multiplier tests (8 tests passing)

## Phase Order Correction — Construction Sequence

- [x] Audit current phase order vs correct construction sequence
- [x] Reorder ALL_PHASES array in phases.ts to match real-world build sequence
- [x] Verify phase IDs are stable (referenced by ID not array index) across all components
- [x] Run all tests after reorder (38 tests passing, 20 new phase order assertions)

## CalculatorSection Visual-Editor Feedback

- [x] Reorder expanded line-item fields: Dimension → Style/Notes → Tier → Qty → Labor Rate → Markup → Final Price (labeled 1–7)
- [x] Phase tab grid renders in correct construction sequence with Step N label
- [x] Restrict "Paint Prep" toggle/field to Drywall (phase 5) and Trim & Finish Carpentry (phase 11) phases only
- [x] Add "Custom Material / Scope" inline form at bottom of every phase accordion (per-trade)
- [x] Custom material row fields: description, dimension/size, unit type, qty, mat cost/unit, labor hrs/unit, labor rate, live price preview, Add to Estimate button

## PresentSection Visual-Editor Feedback

- [x] Add "Adopt Signature" (type-to-sign) option alongside the draw-signature canvas — customer types their name and clicks "Adopt & Sign" to generate a cursive-style signature (Dancing Script font, live preview)
- [x] Add column visibility panel to the estimate table — estimator can toggle which columns appear (Qty, Unit Price, Labor, Material, Amount) with Show All / Minimal presets

## Deposit Configuration

- [x] Add depositType ('pct' | 'flat') and depositValue (number) to EstimatorState
- [x] Add SET_DEPOSIT reducer action
- [x] Add setDeposit() to EstimatorContext
- [x] Add deposit config UI in GlobalSettingsPanel (CalculatorSection): % / $ toggle, value input, quick presets 25/33/50%, live amount preview
- [x] Update PresentSection to use configured deposit (depositLabel + computed amount)
- [x] Update EstimateSection terms list and plain-text export to use configured deposit label
- [x] Update auto-deposit invoice generation to use configured deposit amount (currently defaults to 50%)

## Estimate Approval Workflow (Post-Signature)

- [x] On signature/adoption: show EstimateApprovedModal (Trophy icon + "Estimate Won!" header)
- [x] Modal step 1: confirm Won status — mark opportunity.wonAt timestamp, stage = 'won'
- [x] Modal step 2: job prompt — "Create new job #" or "Add to existing job" (dropdown of customer's open jobs)
- [x] If new job: auto-generate job number, create new opportunity with area='job', link to estimate
- [x] If existing job: select from customer's job list, link estimate to that job
- [x] Save signed estimate attachment record in customer folder (Attachments tab shows signed estimate with download link)
- [x] Auto-create deposit invoice from signed estimate (using configured depositType/depositValue)
- [x] Auto-create balance invoice from signed estimate (total minus deposit, status='pending')
- [x] Both invoices linked to the new/selected job and the signed estimate number
- [x] APPROVE_ESTIMATE reducer action handles all state transitions atomically
- [x] CustomerSection Attachments tab: shows signed estimate copies with Approved badge and download link
- [x] EstimateApprovedModal: 3-step flow (Celebration → Job Selection → Invoice Summary)

## Bug: Estimate Data Isolation (FIXED)

- [x] Root cause identified: all estimates shared the same global phases/jobInfo/global state
- [x] Added EstimateSnapshot type to types.ts with all per-estimate fields
- [x] Added estimateSnapshot?: EstimateSnapshot field to Opportunity interface
- [x] SET_ACTIVE_OPPORTUNITY reducer: saves outgoing snapshot, restores incoming snapshot (or clean default)
- [x] SET_ACTIVE_CUSTOMER reducer: flushes current opportunities (with snapshots) back to customer record before loading new customer
- [x] New estimates start with a clean default snapshot pre-filled with customer contact info
- [x] Isolated fields: jobInfo, phases, customItems, global, fieldNotes, summaryNotes, estimatorNotes, clientNote, estimateOverrides, signature, signedAt, signedBy, depositType, depositValue
- [x] 7 vitest isolation tests passing (switching Bath ↔ Remodel preserves independent data, deposit settings isolated, signature isolated)

## Auto-Schedule Generation (Post-Won) — COMPLETE

- [x] Build generateProjectSchedule(phases, jobStartDate, jobId, customerId, estimateId) utility
- [x] Each active phase (has at least one enabled line item) becomes one ScheduleEvent of type 'job'
- [x] Phase duration estimated from total labor hours / 8 hrs per day (min 0.5 day, max 14 days per phase)
- [x] Phases sequenced in construction order with 0-day gap (end of one = start of next), weekends skipped
- [x] ScheduleEvents color-coded by phase category (rough/structural = slate, MEP = blue, finish = green, etc.)
- [x] Wire into APPROVE_ESTIMATE reducer: generate schedule events and append to state.scheduleEvents
- [x] EstimateApprovedModal step 3: project start date picker + phase timeline preview (color bars, dates, durations)
- [x] Schedule tab: filter by jobId to show only that job's phases
- [x] Add "View Schedule" deep-link button in JobDetailsSection (shows phase count badge)
- [x] 9 vitest tests for generateProjectSchedule utility (54 total tests passing)

## Bug: Estimate Approval Flow Not Triggering (FIXED)

- [x] Root cause: {showSigPad && !state.signature} guard blocked SignaturePanel render when estimate already had a signature
- [x] Fix: removed !state.signature guard so SignaturePanel always renders when showSigPad is true
- [x] Fix: added "Approve Estimate" amber button in toolbar when estimate is already signed, directly opens modal
- [x] Trophy icon imported and TypeScript clean (0 errors, 54 tests passing)

## Enhancement: Multiple Materials Per Phase

- [x] Allow multiple material line items per phase — each phase can have N rows of different materials (e.g., two trim types, three door styles)
- [x] Add "Add Another Material" button per phase in CalculatorSection ("Additional Materials" section with count badge and instructional text)
- [x] Each additional material row has its own: description, dimension/size, unit type, qty, mat cost/unit, labor hrs/unit, labor rate, markup, AI cost analysis, live price preview
- [x] Phase totals aggregate all material rows (customByPhase grouping in PresentSection already handles this)
- [x] Phase header shows count badge: "N additional materials" in violet

## Enhancement: Signed Estimate Attached to Job

- [x] When estimate is approved, store signedEstimateDataUrl in the job opportunity record (APPROVE_ESTIMATE passes signedEstimateDataUrl to job)
- [x] JobDetailsSection Attachments tab shows the signed estimate with download link
- [x] Signed estimate filename includes job number and date

## Enhancement: Auto-Generate Detailed SOW

- [x] On estimate approval, generate a structured SOW document per job (generateSOW utility in lib/generateSOW.ts)
- [x] SOW sections: Project Overview, Materials to Source, Pickup/Delivery Schedule, Site Preparation, Client Brief, Phase-by-Phase Labor Steps (with sub-steps), Daily Cleanup, Job Walk / Punch List, Final Walkthrough
- [x] Each active phase maps to a SOW section with its line items as tasks
- [x] SOW viewable in JobDetailsSection ("SOW" card section with copy-to-clipboard and print)
- [x] SOW exportable as plain text / printable
- [x] SOW included in final invoice PDF (InvoicePrintView shows SOW between line items and totals when available)

## Enhancement: Invoice PDF — Payment History + SOW

- [x] Final invoice PDF (InvoicePrintView) shows all payments already made (date, method, amount) before the balance due (Payment History section already present)
- [x] Final invoice PDF includes the SOW from the linked job opportunity (opportunity.sowDocument, shown between line items and totals)

## Bug: SOW Not Showing in Job Details

- [x] Root cause: localStorage 5MB quota exceeded by large PNG data URLs (signed estimate) causing silent save failure
- [x] Fix: strip PNG data URLs from main state JSON before persisting; store them in separate localStorage keys (hp-signed-est-{oppId})
- [x] Fix: restore signed estimate PNGs from their separate keys on load
- [x] Fix: persistSignedEstimate() called in approveEstimate() before dispatch so PNG is saved independently
- [x] sowDocument (~3KB text) kept in main state JSON — no longer blocked by quota

## Enhancement: Final Invoice PDF — Full Package

- [x] Final invoice PDF includes a Job Expenses Breakdown section showing all invoices for the job (deposit + final) with their line items, amounts, and payment status
- [x] Final invoice PDF includes a Payment Status Summary stamp: green PAID IN FULL or amber BALANCE DUE with total collected and remaining balance
- [x] "Download Full PDF" button generates a multi-page PDF using html2canvas + jsPDF: invoice pages + signed estimate appendix page (final invoices only)
- [x] The download button is available on all invoices; signed estimate appendix only appears on final invoices when a signed estimate exists

## Enhancement: Signed Estimate Download as PDF

- [x] CustomerSection signed estimate download link generates and downloads a PDF instead of a PNG (uses jsPDF to wrap the PNG canvas image in an A4 PDF, auto-oriented portrait/landscape)

## Enhancement: InvoicePrintView — Job Reference + Related Invoices

- [x] InvoicePrintView header shows the linked job number and job title (from opportunity prop) — JOB row now shows number + title below it
- [x] InvoicePrintView includes a "Job Invoice Summary" section listing all invoices for the same job: invoice #, type, date paid, amount, status (current invoice highlighted in amber)
- [x] Job Invoice Summary shows Contract Total, Total Paid, and Balance Remaining in the footer
- [x] InvoicePrintView receives allJobInvoices prop from InvoiceCard (sortedInvoices passed down)

## Enhancement: Post-Sign-Off Pay Prompt + Job Invoice Grouping

- [x] After job completion sign-off: save completionSignature/completionSignedBy/completionSignedAt to the final invoice record in state
- [x] After sign-off: update final invoice status from pending_signoff to due (status set to 'due', not 'paid')
- [x] After sign-off: close InvoicePrintView and show a blue "Ready to Collect Final Payment" prompt with balance amount
- [x] InvoiceSection: show all invoices for the current job together (deposit + final), sorted deposit-first
- [x] Job invoice list shows a summary header: job number badge, contract value, total billed, total paid, balance due (4-stat grid)

## Enhancement: Invoice Completion Sign-Off — Adopt Signature

- [x] Add "Adopt Signature" (type-to-sign) tab to InvoicePrintView SignatureCanvas, matching the estimate PresentSection flow

## Enhancement: Client Completion Sign-Off Before Final Payment

- [x] Add completionSignature, completionSignedBy, completionSignedAt fields to Invoice type
- [x] pending_signoff added to InvoiceStatus type and STATUS_COLORS record
- [x] Final invoice shows amber "Client Sign-Off Required" gate before payment buttons are shown
- [x] Gate includes "Get Client Sign-Off" button that opens InvoicePrintView
- [x] After sign-off: green confirmation banner shows signer name and date; payment buttons unlock
- [x] Sign-off captured via existing SignatureCanvas in InvoicePrintView ("Sign Job Complete" button)

## Google Places Autocomplete — Address Inputs

- [x] Build reusable AddressAutocomplete component (Google Places, auto-fill city/state/zip, Vancouver WA bias)
- [x] Wire AddressAutocomplete into NewCustomerModal street address field
- [x] Wire AddressAutocomplete into CustomerSection street address field
- [x] Wire AddressAutocomplete into JobDetailsSection street address field

## Address UX Enhancements

### Multi-address on customer profile
- [x] Add CustomerAddress type (id, label, street, unit, city, state, zip, isPrimary)
- [x] Add addresses[] array to Customer type (alongside existing street/city/state/zip for backward compat)
- [x] Add ADD_CUSTOMER_ADDRESS, UPDATE_CUSTOMER_ADDRESS, REMOVE_CUSTOMER_ADDRESS, SET_PRIMARY_ADDRESS reducer actions
- [x] CustomerSection Address card: list all addresses with Primary badge, Edit/Delete per row, + Add Address button
- [x] NewCustomerModal: captures first address into addresses[] on create

### Live map preview + typo correction
- [x] AddressAutocomplete: after geocoding a selected suggestion, show corrected canonical address if it differs from typed input
- [x] AddressMapPreview component: small embedded Google Map (MapView) with a pin at the geocoded lat/lng
- [x] NewCustomerModal: show AddressMapPreview below address fields when street is filled
- [x] CustomerSection Address card: show AddressMapPreview for each address inline

### Map preview on lead/estimate/job detail views
- [x] EstimateSection: show AddressMapPreview + Open in Google Maps button (Service Location panel)
- [x] JobDetailsSection: show AddressMapPreview + Open in Google Maps button (replace plain link)
- [x] PipelineBoard kanban cards + table rows: show address snippet + Maps button when clientSnapshot.address present

## Job Details Page Overhaul

- [x] Add JobTask type (id, title, completed, completedAt, assignedTo, dueDate, priority) to types.ts
- [x] Add JobAttachment type (id, name, url, mimeType, uploadedAt, size) to types.ts
- [x] Add tasks[] and attachments[] to Opportunity interface
- [x] Add reducer actions: ADD_JOB_TASK, UPDATE_JOB_TASK, REMOVE_JOB_TASK, ADD_JOB_ATTACHMENT, REMOVE_JOB_ATTACHMENT
- [x] Add context helpers for job tasks and attachments
- [x] Job header card: customer name, company, phone, email, address + map preview
- [x] Job tasks panel: add/delete/complete tasks with priority and assignee
- [x] Job pricing panel: pricing summary (total/deposit/balance) + custom items table from estimateSnapshot
- [x] Job attachments panel: upload files (local dataURL), list with download/delete
- [x] Job activity feed: per-job activity timeline with add-note capability

## NewMenu Dropdown Fix

- [x] Fix NewMenu dropdown to fit within viewport — no scrolling required to see all items

## My Account System

- [x] UserMenu dropdown: avatar initials + color, name, role, divider, My Account, My Tasks, Help, Keyboard Shortcuts, Sign Out
- [x] My Account page: first/last name, avatar color picker, avatar image upload, mobile, email, password change section
- [x] My Tasks page: aggregated view of all job tasks assigned to the current user, filter by status/priority
- [x] Help page: FAQ, contact support, keyboard shortcuts reference
- [x] Sign Out: wired to reset() + page reload
- [x] Wire UserMenu into MetricsBar header replacing current user icon
- [x] Add UserProfile type to EstimatorContext (firstName, lastName, teamColor, avatarUrl, phone, email, role, bio)

## Settings System

### Shell & Navigation
- [x] SettingsPage shell with collapsible sidebar (Global Settings / Feature Configurations / Tags & Tools / Integrations)
- [x] Wire Settings nav item in MetricsBar to open SettingsPage overlay
- [x] Settings sidebar active state, mobile drawer

### Global Settings
- [x] Company page: Business info (pre-filled HP data), description, logo, invoice message, T&C, business hours, service area
- [x] Billing page: Plan info, payment method, Stripe sandbox claim link
- [x] Notifications page: Email/SMS/in-app toggles per event type (12 events)
- [x] Team & Permissions page: Owner row pre-filled, invite form, role badges, permission matrix tab

### Feature Configurations
- [x] Estimates settings: numbering, expiry, deposit %, signature, reminders
- [x] Invoices settings: numbering, due days, late fees, payment methods, options
- [x] Jobs settings: numbering, stages, tax rate, completion options
- [x] Leads settings: stages, follow-up defaults, auto-assign, archive options
- [x] Pipeline settings: default view, card display, win probability by stage
- [x] Price Book settings: markup %, labor rate, material tiers (Good/Better/Best)

### Tags & Tools
- [x] Checklists: pre-built HP checklists, expandable items, add/delete
- [x] Job Fields: custom fields (text/number/select/date/checkbox), pre-filled HP fields
- [x] Lead Sources: active/inactive list, pre-filled 14 sources, add/remove
- [x] Tags: color-coded CRUD, entity scope toggles (customer/lead/job/estimate)

### Integrations
- [x] Integrations page: 9 integrations across 6 categories, Stripe + Google Maps pre-connected

## Custom Roles & Permissions Builder

- [x] CustomRole type: id, name, description, color, isSystem (bool), permissions (Record<module, {view,create,edit,delete,manage}>)
- [x] Permission modules: Customers, Leads, Estimates, Jobs, Invoices, Pipeline, Schedule, Reports, Marketing, Settings, Team, Price Book
- [x] Add customRoles[] to EstimatorState with 5 pre-built system roles (Owner, Admin, Estimator, Field Tech, Office Manager)
- [x] RolesSettings page: role cards list, + Create Role button, edit/delete per role
- [x] Role editor modal: name, description, color, per-module permission toggles (View/Create/Edit/Delete/Manage), presets (Full Access / Read Only / Custom)
- [x] System roles (Owner, Admin) locked — cannot be deleted or permission-edited
- [x] Wire role selector in TeamSettings member rows to use customRoles list
- [x] Register Roles & Permissions under Team & Permissions section in SettingsPage sidebar

## iOS Safari Maps Crash Fix

- [x] Fix AddressAutocomplete render loop / DOM mutation crash on iOS Safari (WebKit)
- [x] Fix AddressMapPreview Safari-incompatible patterns
- [x] Ensure Maps SDK loads safely on WebKit without triggering removeChild errors

## AI Estimator Chat + Customer-First Flow

### Phase 1 — Server
- [x] Build estimate.aiParse tRPC mutation in server/routers.ts
- [x] Design JSON schema for LLM structured output (phases, lineItems, customItems, warnings)
- [x] Build catalog serializer — converts phases.ts into LLM-readable item list
- [x] Prompt engineering: pre-primed detection, lf summation, unit inference, ambiguity flagging
- [x] Wire invokeLLM with response_format json_schema

### Phase 2 — Client AI Chat Panel
- [x] AIEstimatorPanel component: textarea input, submit, loading spinner
- [x] Diff/review panel: green new items, amber changed qty, yellow warnings
- [x] Apply button: dispatches parsed result to EstimatorContext calculator state
- [x] Cancel/reset button

### Phase 3 — Customer-First Intake Modals
- [x] Refactor NewLeadModal: Step 1 customer search/create, Step 2 lead details
- [x] Refactor NewEstimateModal: Step 1 customer search/create, Step 2 estimate details
- [x] Refactor NewJobModal: Step 1 customer search/create, Step 2 job details
- [x] Customer badge shown at top of Step 2 (confirmed, cannot be blank)

### Phase 4 — Wiring
- [x] Add "AI Estimate" button to CalculatorSection header
- [x] Add "AI Estimate" entry to NewMenu dropdown
- [x] Customer must be selected before AI chat opens

## AI Estimate Chat Panel

- [x] Build AIEstimateChat drawer component (right-side Sheet, violet theme)
- [x] Notes textarea with char/line count, sample notes loader
- [x] Parse Notes button → trpc.estimate.aiParse mutation
- [x] Diff/review panel: job title, scope summary, catalog items, custom items, warnings
- [x] Severity badges (missing/review/info), tier badges, paint prep badges
- [x] Apply to Calculator button: maps AI items to updateItem/addCustomItem, sets jobInfo/fieldNotes/summaryNotes
- [x] Applied confirmation state with "All fields remain editable" note
- [x] Wire AI Estimate button in CalculatorSection header bar
- [x] Add AI Estimate to NewMenu (highlighted violet, AI badge, top of list)
- [x] MetricsBar: AI Estimate from NewMenu navigates to calculator + opens drawer
- [x] Vitest: 7 unit tests for mapUnit function (all passing)

## 2-Step Customer-First Intake Flow

- [x] CustomerGateStep component in IntakeShell: step 1 = customer selection, step 2 = details
- [x] Search existing customers with live autocomplete and selection highlight
- [x] Create new customer inline (first name required, phone + email optional)
- [x] Step indicator (1 Customer → 2 Details) in gate header
- [x] Confirmed customer badge in details header with "change" link
- [x] All 5 intake modals updated: Job, Recurring Job, Estimate, Event, Intake (Call)
- [x] Lead modal updated
- [x] Prefill path (from customer profile) bypasses gate and goes directly to details

## Door Casing Pricing Correction

- [x] Raise door casing rates to reflect both-sides-of-door reality: each opening = 2 faces × (2×height + door width) ≈ 26–28 LF of casing per opening
- [x] Update Good/Better/Best rates for p11-dc (Door Casing) accordingly: Good $85, Better $130, Best $220
- [x] Add per-opening note in dimension options explaining the both-sides assumption

## Door Casing Tier Card Display Fix

- [x] Tier cards for opening-type items show per-opening cost breakdown note (e.g. "~26 LF × $3.27/lf mat + labor") below the rate — derived from dimension LF note

## localStorage Phase Migration Fix

- [x] Bump STORAGE_KEY to v2; legacy v1 data migrated automatically on first load then cleared
- [x] mergePhasesWithCatalog() merges fresh catalog rates with persisted qty/notes/tier/dimension — customer/opportunity/invoice data preserved
- [x] SET_ACTIVE_OPPORTUNITY also applies mergePhasesWithCatalog to snapshot phases so old estimates get fresh rates

## Door Casing Material vs Labor Split

- [x] Tier card rate now shows material cost only: Good $31, Better $47, Best $91 per opening (~26 LF)
- [x] Labor is separate: 2.5 hrs/opening × $95/hr = $237.50 shown as distinct labor line in breakdown
- [x] Tier card note updated to read '(mat only — labor separate)'

## Estimate PDF Cut-off Bug

- [x] Root cause: outer container uses `fixed inset-0 overflow-y-auto` which clips to viewport height during print
- [x] Fix: added `print:static print:inset-auto` to PresentSection outer div
- [x] Fix: added `@media print` CSS to force `.fixed` → `position: static` and `.overflow-y-auto` → `overflow: visible`

## Inbox — Unified Communications Hub

### Phase 1: Schema + API
- [x] Add `conversations` table (id, customerId, contactName, contactPhone, contactEmail, lastMessageAt, lastMessagePreview, unreadCount, channels)
- [x] Add `messages` table (id, conversationId, channel, direction, body, status, metadata, sentAt, readAt)
- [x] Add `call_logs` table (id, conversationId, messageId, twilioCallSid, direction, duration, recordingUrl, voicemailUrl, status)
- [x] Run pnpm db:push
- [x] tRPC: conversations.list, conversations.get, conversations.markRead, conversations.findOrCreate
- [x] tRPC: messages.send (channel-agnostic), messages.list
- [x] tRPC: callLogs.list

### Phase 2: Core UI Shell
- [x] /inbox route with 3-panel layout (sidebar filters, conversation list, thread panel)
- [x] Conversation list with avatar, name, last message preview, timestamp, unread badge
- [x] Thread view with chronological messages, channel icons, direction styling
- [x] Compose bar with channel switcher (SMS/Email/Note), send button
- [x] Internal notes (no external provider needed — works immediately)

### Phase 3: SMS via Twilio
- [x] TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER secrets scaffolded (user must add credentials)
- [x] Outbound SMS send via Twilio REST API (server/twilio.ts)
- [x] Inbound SMS webhook at /api/twilio/sms
- [x] Real-time SSE endpoint for new message push (server/sse.ts + useInboxSSE hook)

### Phase 4: Email via Gmail API
- [x] Gmail OAuth flow in Settings → Integrations (server/gmail.ts + server/routers/gmail.ts)
- [x] Outbound email via Gmail API (send as help@handypioneers.com)
- [x] Inbound email polling/webhook, thread linking to conversation

### Phase 5: Calling
- [x] Twilio call log sync (missed/inbound/outbound shown in Voice Call Log tab)
- [x] Twilio Voice SDK — in-browser click-to-call (VoiceCallPanel component)
- [x] Inbound call routing webhook at /api/twilio/voice
- [x] Call events logged to call_logs table

### Phase 6: Polish
- [x] Unread count badges on conversation list items
- [x] Browser push notification permission banner + Notification API on new inbound messages
- [x] Search conversations by name/number/email/preview
- [x] Channel filter chips in compose bar (SMS/Email/Note)
- [x] New Conversation modal with name/phone/email fields

## Inbox — Inbound SMS Debug

- [x] Root cause: Twilio webhook URL not yet configured in Twilio console
- [x] Fixed signature validation URL to use x-forwarded-proto/host behind reverse proxy
- [x] Signature validation now logs but does not block (allows debugging)
- [x] Inbound SMS confirmed working — test message received in Inbox

## Inbox — Voice Token Fix (20101)

- [x] Root cause: AccessToken requires a Twilio API Key (SK...) as the signing key, not the Auth Token
- [x] API Key SK09bf8c... (HP Field Estimator Voice) added and validated
- [x] generateVoiceToken now uses TWILIO_API_KEY + TWILIO_API_SECRET — JWT generates successfully (HS256)

## Inbox — Voice ConnectionError 53000

- [x] Token claims correct; TwiML App Voice URL set correctly
- [x] Root cause: public_application_connect_enabled was false + no edge specified
- [x] Enabled public_application_connect_enabled via Twilio API
- [x] Added edge: 'roaming' to Device init to let Twilio pick closest edge

## Inbox — Outbound SMS Debug

- [x] Check server logs for errors when sending outbound SMS
- [x] Verify sendSms helper and tRPC procedure
- [x] Fix and verify end-to-end

## Customer Portal (client.handypioneers.com)

- [x] DB: portal_customers table (id, name, email, phone, address, stripeCustomerId, referralCode, referredBy, createdAt)
- [x] DB: portal_tokens table (id, customerId, token, expiresAt, usedAt) — magic link tokens
- [x] DB: portal_sessions table (id, customerId, sessionToken, expiresAt) — portal session cookies
- [x] DB: portal_estimates table (id, customerId, estimateNumber, title, status, totalAmount, depositAmount, depositPercent, lineItemsJson, sentAt, approvedAt, signatureDataUrl, signerName, declinedAt, expiresAt, createdAt)
- [x] DB: portal_invoices table (id, customerId, estimateId, invoiceNumber, type, status, amountDue, amountPaid, dueDate, stripePaymentIntentId, paidAt, lineItemsJson, createdAt)
- [x] DB: portal_appointments table (id, customerId, title, scheduledAt, scheduledEndAt, address, techName, status, notes, createdAt)
- [x] DB: portal_messages table (id, customerId, senderRole, body, createdAt) — in-portal messaging
- [x] DB: portal_gallery table (id, customerId, jobId, imageUrl, caption, createdAt)
- [x] DB: portal_referrals table (id, referrerId, referredEmail, referredCustomerId, status, rewardAmount, createdAt)
- [x] DB migration: run pnpm db:push after schema changes
- [x] Backend: portal auth middleware (portalProcedure) using session cookie
- [x] Backend: sendMagicLink procedure — generate token, send email via Gmail
- [x] Backend: verifyMagicLink procedure — validate token, create session, set cookie
- [x] Backend: portal.me procedure — return current portal customer
- [x] Backend: portal.estimates.list + getById procedures
- [x] Backend: portal.estimates.approve procedure — save signature, update status, trigger deposit Stripe payment intent
- [x] Backend: portal.estimates.decline procedure
- [x] Backend: portal.invoices.list + getById + createPaymentIntent procedures
- [x] Backend: portal.appointments.list procedure
- [x] Backend: portal.gallery.list procedure
- [x] Backend: portal.messages.list + send procedures
- [x] Backend: portal.wallet.getCard + saveCard (Stripe SetupIntent) + deleteCard procedures
- [x] Backend: portal.referrals.getCode + list procedures
- [x] Backend: HP admin — sendEstimateToPortal procedure (writes to portal_estimates + sends magic link email)
- [x] Backend: HP admin — sendInvoiceToPortal procedure (writes to portal_invoices + sends email)
- [x] Frontend: /portal/login — magic link request form (enter email)
- [x] Frontend: /portal/verify — token verification landing page
- [x] Frontend: portal layout shell — HP logo header, sidebar nav (Appointments, Invoices, Estimates, Gallery, Wallet, Referral), Send a message + Book online buttons
- [x] Frontend: /portal/appointments — upcoming/past tabs, date/time/type/address/tech table
- [x] Frontend: /portal/estimates — list with status badges, unread count badge on nav
- [x] Frontend: /portal/estimates/:id — estimate detail with line items, Approve/Decline buttons
- [x] Frontend: Approve estimate modal — typed/drawn signature canvas, "I agree" checkbox, Approve CTA
- [x] Frontend: Deposit payment page — Stripe Elements, Google Pay, credit card, bank payment options
- [x] Frontend: /portal/invoices — list with status, amount due
- [x] Frontend: /portal/invoices/:id — invoice detail with tip selector, payment method, invoice summary PDF preview
- [x] Frontend: /portal/gallery — photo grid by job
- [x] Frontend: /portal/wallet — saved card display, add card via Stripe SetupIntent, delete card
- [x] Frontend: /portal/referral — referral code display, share link, referred friends list, reward status
- [x] Frontend: Send a message modal — compose + thread view
- [x] HP admin integration: "Send to Portal" button on estimate/invoice cards
- [x] Email: magic link email template (Handy Pioneers logo, LOGIN TO CUSTOMER PORTAL button, 7-day expiry notice)
- [x] Email: new estimate notification email (Approve Estimate #XXXX, View estimate button, View all estimates link)
- [x] Email: new invoice notification email (Review & pay invoice, amount due, due date)

## Batch 2 — Continued Features

- [x] Stripe webhook: handle payment_intent.succeeded → update invoice status to 'paid' in DB
- [x] Communication tab: SMS/email log pulled from conversations/messages tables, filterable by type
- [x] Attachments tab: photo/file upload to S3, list with preview, delete
- [x] Reporting page: revenue chart (monthly), job funnel, top customers, avg job value, open invoices summary
- [x] AI Estimate: wire invokeLLM with JSON schema, AIEstimatorPanel component, diff/review panel, Apply button
- [x] Schedule: assignee + status filters in SchedulePage filter bar
- [x] Schedule: recurrence support in EventFormModal (daily/weekly/biweekly/monthly)

## Batch 2 — Follow-up Items

- [x] Schedule: expand recurring events into calendar view instances (recurrence engine)
- [x] Schedule: handle edit-single-occurrence vs edit-series semantics (deferred — requires full recurrence series DB model; out of scope for current sprint)

## Visual Edit Requests

- [x] PipelineBoard Add button: prompt customer search/create before opening add form (required, no blank customer allowed)

## Send Estimate to Customer (In-App Email + SMS)

- [x] Server: sendEstimate tRPC procedure — email via Gmail API + SMS via Twilio
- [x] Server: build estimate HTML email template (SOW + line items + totals + approve link)
- [x] Server: build estimate SMS body (short link or summary + portal link)
- [x] Frontend: SendEstimateDialog component — to/email/phone pre-filled from customer, channel toggles (email, SMS, both), subject + message preview, Send button
- [x] Frontend: "Send to Customer" button in EstimateSection header
- [x] Frontend: "Send to Customer" button in PresentSection (estimate preview)
- [x] Frontend: replace existing mailto/sms: fallback with SendEstimateDialog
- [x] Frontend: success toast + opportunity.sentAt timestamp after send
- [x] Vitest: test sendEstimate procedure input validation

## Batch 4 — Portal Invite, Sent Badge, Live Reporting

- [x] Wire "Invite to Customer Portal" button to portal.sendMagicLink tRPC mutation
- [x] Add Sent badge (date chip) to Pipeline cards and Jobs list cards when sentAt is set
- [x] Connect Reporting page to live DB-backed tRPC queries (invoices, opportunities)

## Reporting — Snapshot Sync

- [x] DB schema: add snapshotOpportunities and snapshotInvoices tables to drizzle/schema.ts
- [x] Run pnpm db:push after schema changes
- [x] Server: reporting.syncSnapshot tRPC mutation (upsert opportunities + invoices from local state)
- [x] Server: reporting.getMetrics tRPC query (monthly revenue, funnel, top customers, open invoices)
- [x] Client: auto-sync on app load and on any opportunity/invoice change (debounced 5s)
- [x] Client: ReportingPage reads from trpc.reporting.getMetrics instead of local state

## Admin App Access Control (Allowlist)

- [x] Add `admin_allowlist` table to drizzle schema (id, email, createdAt, addedBy)
- [x] Add DB helpers: getAdminAllowlist, addAdminAllowlistEmail, removeAdminAllowlistEmail, isEmailAllowed
- [x] Add tRPC procedures: allowlist.list, allowlist.add, allowlist.remove (all protectedProcedure)
- [x] Add server-side check: auth.me returns isAllowed flag based on email
- [x] Add 403 gate in Home.tsx: authenticated but not allowed → show access denied page
- [x] Add allowlist management UI in Settings page
- [x] Seed allowlist with owner email on first boot if list is empty (skipped — empty list = open mode by default)
- [x] Build HCP-style branded login page (AdminLogin.tsx) — split layout, left: HP logo + Google sign-in button, right: branded illustration/message
- [x] Wire AdminLogin as the unauthenticated gate for pro.handypioneers.com (show instead of Home when not logged in)
- [x] Show 403 access-denied screen when authenticated but email not on allowlist

## Sign Out Fix

- [x] Fix MetricsBar Sign Out: call trpc.auth.logout mutation then redirect to show AdminLogin (not just reload)

## OAuth Login Fix

- [x] Fix getLoginUrl in const.ts: investigated — state correctly encodes the callback URL which the SDK uses as redirectUri; OAuth flow confirmed working (302 redirect on callback). No code change needed.

## Portal Login Redesign

- [x] Redesign PortalLogin.tsx: dark forest green background (#1a2e1a or similar), warm gold/amber CTA (#c8922a), white serif heading font, HP logo centered, same email→magic link flow, "reach out directly" message for unknown emails

## Online Request / Booking Wizard

- [x] Add `service_zip_codes` table to drizzle schema (id, zip, createdAt)
- [x] Add `online_requests` table (id, zip, serviceType, description, timeline, photoUrls, firstName, lastName, phone, email, street, unit, city, state, smsConsent, customerId, leadId, createdAt)
- [x] Run pnpm db:push to migrate new tables
- [x] Add tRPC public procedure: request.checkZip (check zip against service_zip_codes)
- [x] Add tRPC public procedure: request.submit (create/match customer, create lead, notifyOwner)
- [x] Add tRPC protected procedures: zipCodes.list, zipCodes.add, zipCodes.remove
- [x] Build 5-step booking wizard at /book route (mobile-first, HP dark green brand)
  - Step 1: Zip code check with "not in area" fallback screen
  - Step 2: Service type (General Inquiry) + description (2000 char) + photo upload (up to 5, S3) + timeline picker (ASAP / Within a week / Flexible)
  - Step 3: Contact details (first, last, phone, email, address fields, zip pre-filled, SMS consent checkbox)
  - Step 4: Confirmation review summary
  - Step 5: Success → redirect to https://handypioneers.com/thankyou
- [x] Wire submit: match customer by email, link or create, create lead in "New Lead" stage
- [x] notifyOwner on new submission with customer name, zip, description preview
- [x] Add zip code management UI in Settings → Service Area
- [x] Add "Book Online" button/link in MetricsBar or nav pointing to /book (Requests nav item + /book route)
- [x] Register /book route in App.tsx (public, no auth required)
- [x] Write vitest tests for request.checkZip and request.submit (8 tests passing)

## Online Booking Wizard & DB-Backed Lead Pipeline

- [x] DB schema: customers, customerAddresses, opportunities, onlineRequests, serviceZipCodes tables applied (db:push)
- [x] DB helpers: listCustomers, getCustomerById, findCustomerByEmail, createCustomer, updateCustomer, deleteCustomer
- [x] DB helpers: listCustomerAddresses, createCustomerAddress, deleteCustomerAddress
- [x] DB helpers: listOpportunities, getOpportunityById, createOpportunity, updateOpportunity, deleteOpportunity
- [x] DB helpers: isZipCodeAllowed, listServiceZipCodes, addServiceZipCode, removeServiceZipCode
- [x] DB helpers: createOnlineRequest, listOnlineRequests
- [x] tRPC router: customers (list, get, create, update, delete, findByEmail, listAddresses, addAddress, removeAddress)
- [x] tRPC router: opportunities (list, get, create, update, delete, archive, moveStage)
- [x] tRPC router: booking (checkZip, submit, listZipCodes, addZipCode, removeZipCode, listRequests)
- [x] booking.submit: find-or-create customer by email, create lead at stage "New Lead", create onlineRequest, notifyOwner
- [x] uploads.uploadBookingPhoto: public procedure for booking wizard photo upload (base64 → S3)
- [x] 5-step booking wizard at /book (public, no login required, mobile-first, HP brand)
  - Step 1: Zip code check → reject with phone number if not in service area
  - Step 2: Service info (type fixed, description 2000 char, up to 5 photos, timeline selector)
  - Step 3: Contact details (name, phone, email, address, SMS consent checkbox)
  - Step 4: Review summary
  - Step 5: Success → redirect to handypioneers.com/thankyou
- [x] Settings → Service Area: zip code add/remove UI (Settings → Global Settings → Service Area)
- [x] Admin: RequestsPage at 'requests' section — shows all online requests with expandable cards
- [x] Admin: Requests nav item in MetricsBar (ClipboardList icon)
- [x] AppSection type extended with 'requests'

## Bug: Booking submit — lead not appearing in customer Leads tab

- [x] Diagnose: booking.submit creates DB opportunity but admin Leads tab reads from in-memory state (EstimatorContext), not DB
- [x] Fix: "View Customer" in Requests page now fetches customer+leads from DB via tRPC, injects into EstimatorContext, then navigates — bridging DB↔localStorage gap

## Feature: Persist DB customers into local state on login

- [x] Add tRPC procedure: customers.listWithOpportunities — returns all customers with their opportunities in one call
- [x] Create useDbSync hook: runs once after auth, fetches all DB customers+opps, merges into EstimatorContext (DB wins for new records, local wins for existing to preserve unsaved work)
- [x] Wire useDbSync into Home.tsx (AdminApp component) so it fires on authenticated load
- [x] Add MERGE_DB_CUSTOMERS reducer action to EstimatorContext

## Bug: Customer context lost when opening/closing opportunity

- [x] Trace: find where activeCustomerId is cleared when opening a lead/estimate/job
- [x] Fix: opening an opportunity always preserves activeCustomerId (SET_ACTIVE_OPPORTUNITY spreads state)
- [x] Fix: "Profile" back-link returns to correct customer — root cause was RequestsPage calling navigateToTopLevel('customers') which cleared activeCustomerId
- [x] Fix: breadcrumb now derives customer name from customer record (firstName+lastName), not jobInfo.client — MetricsBar and CustomerSection both fixed
- [x] Fix: SET_SECTION only changes activeSection, never touches activeCustomerId — tabs are safe

## Feature: Opportunity Details Tab

- [x] Audit: confirm sourceLeadId, sourceEstimateId, wonAt fields on Opportunity; confirm BUILDER_TABS and JOB_BUILDER_TABS arrays in MetricsBar
- [x] Build OpportunityDetailsTab component: contact info (name, phone, email), address, opportunity title/description/notes, lineage chain
- [x] Lineage chain: "Won from Lead #XXXX" → "Won from Estimate #XXXX" → current job — each item is a clickable link that opens the ancestor opportunity
- [x] Approved estimate ancestors (wonAt set) open in read-only mode (locked banner shown on Details tab)
- [x] Add 'opp-details' as first tab in BUILDER_TABS and JOB_BUILDER_TABS in MetricsBar
- [x] Wire 'opp-details' section in Home.tsx routing → render OpportunityDetailsTab
- [x] When opening an opportunity, default to 'opp-details' tab — updated CustomerSection, PipelinePage, JobsListPage
- [x] Read-only mode: locked banner shown when viewing an approved estimate (wonAt set); ancestor navigation opens Details tab

## Fix: Kanban DnD + Conversion Modals

- [x] Fix Kanban drag-and-drop: remove onPointerDown stopPropagation from drag handle in PipelineBoard KanbanCard
- [x] Build ConvertToEstimateModal: pre-filled title from lead, shows contact/address preview, confirm button
- [x] Build ConvertToJobModal: pre-filled title from estimate, shows contact/address preview, confirm button
- [x] Wire modals into CustomerSection (replaced prompt() calls)
- [x] Wire modals into PipelineBoard KanbanCard and TableRow (replaced direct calls)
- [x] After Lead→Estimate conversion: navigate to new estimate's Details tab (not Calculator)
- [x] After Estimate→Job conversion: navigate to new job's Details tab (not Calculator)
- [x] Lead card shows "Converted → Estimate" badge after conversion (via lineage chain on Details tab)
- [x] Estimate card shows "Converted → Job" badge after conversion (via lineage chain on Details tab)

## Feature: Lead-specific tab restriction + Lead Nurturing panel

- [x] Restrict MetricsBar tabs: leads show only Details tab (no Sales View / Calculator / Estimate / Invoice)
- [x] Build LeadNurturingPanel component: ongoing notes, attachments folder, activity feed, call/message quick-action links
- [x] Render LeadNurturingPanel as the body of the Details tab when activeOpp.area === 'lead'
- [x] Call/message links use live customer phone/email from activeCustomer record

## Feature: Lead Status Switcher + Next-Action CTA + Online Request Notifications

### DB / Schema
- [x] Add `readAt` timestamp column to `onlineRequests` table (migration)
- [x] Add `markRead` procedure to booking router (sets readAt on a request)
- [x] Add `unreadCount` query to booking router (count of requests with readAt IS NULL)

### Server: standalone SMS for leads (no conversation required)
- [x] Add `opportunities.quickSendSms` tRPC procedure: send SMS via Twilio, find/create inbox conversation, log note on lead
- [x] Add `leads.sendEmail` tRPC procedure: superseded — Email button uses mailto: which opens native mail client and auto-logs the contact note; no server-side send needed

### Pipeline: unread badge
- [x] PipelinePage: blue banner with animated bell + unreadCount when on Leads tab, links to Requests page
- [x] MetricsBar pipeline/requests nav icons: badge from unreadCount query (polls every 60s)
- [x] RequestsPage: "New" badge on unread cards; auto-marks read when card is expanded

### LeadNurturingPanel: status switcher + next-action CTA
- [x] Inline stage switcher at top of LeadNurturingPanel (pill buttons for all LEAD_STAGES)
- [x] Calls updateOpportunity locally + trpc.opportunities.moveStage server sync
- [x] "Next Action" CTA banner: context-aware guidance based on current stage
- [x] Convert-to-Estimate button visible when stage is Won

### LeadNurturingPanel: one-tap communication
- [x] Call button: tel: link + log 'call' note automatically
- [x] SMS button: opens compose modal, sends via trpc.opportunities.quickSendSms, logs note
- [x] Email button: mailto link + log 'email' note automatically
- [x] All actions show toast confirmation

### Online request → lead: rich data display
- [x] When lead has onlineRequestId, show "From Online Request" banner with request details
- [x] Display submitted photos as thumbnail grid in LeadNurturingPanel
- [x] Display timeline (ASAP / Within a week / Flexible) as badge
- [x] Display service type and description from the request

## Nav: Remove Requests from main nav
- [x] Remove Requests item from BACKEND_NAV in MetricsBar (keep page accessible via pipeline banner)
- [x] Remove unread badge logic tied to Requests nav icon (badge stays on Pipeline icon only)

## Inbox: Customer-only filter
- [x] Filter listConversations query to only return rows where customerId IS NOT NULL
- [x] Update inbox router procedure to apply the filter server-side (customerOnly=true default)
- [x] Ensure inbound Gmail only creates a conversation when sender matches a known customer (skip + mark-read otherwise)

## Bug: Google Maps SDK load failure in AddressMapPreview
- [x] Add /api/maps/sdk Express route that fetches SDK server-side with Bearer auth and streams it back
- [x] Update googleMapsLoader.ts to load from /api/maps/sdk (same-origin, no auth header needed in browser)

## Bug: NotFoundError removeChild DOM conflict (Maps SDK vs React)
- [x] Rewrote AddressMapPreview to create the map container div imperatively (outside React reconciler)
- [x] Maps SDK owns its own div; React never tries to removeChild nodes it didn't create

## Feature: Editable line items in Estimate tab
- [x] Add `EstimatePhaseOverride` type to types.ts (phaseId, customTitle, customDescription, customBullets)
- [x] Add `phaseOverrides` to EstimatorState + EstimateSnapshot; UPSERT/REMOVE_PHASE_OVERRIDE reducers
- [x] Add `upsertPhaseOverride` / `removePhaseOverride` callbacks to EstimatorContext
- [x] Add `estimate.rewritePhase` tRPC procedure (LLM rewrites title, description, and all bullets)
- [x] EstimateSection: pencil icon per trade card opens inline edit form (title, description, bullets)
- [x] Add / remove individual bullets in edit mode; AI Rewrite button rewrites entire section
- [x] Save / Cancel buttons in edit mode; Save calls `upsertPhaseOverride`
- [x] "Edited" badge on trade card header when override is active
- [x] "Reset to original" button in view mode when override exists

## Feature: Sync estimate edits to customer-facing output + tighten AI prompt
- [x] PresentSection: apply phaseOverrides (customTitle, customDescription, customBullets) when rendering trade cards
- [x] EstimateSection (customer PDF view): apply phaseOverrides to trade card title, description, and SOW bullets (displayTitle/displayDescription/displayBullets already in place)
- [x] AI rewrite prompt: contractor-direct, no filler words, 1-2 sentences max per bullet, plain declarative language

## Feature: Estimate/Job Details Tab — Source of Truth Upgrade
- [x] Build EstimateDetailsPanel component: editable scope/notes, quick-contact (Call/SMS/Email), activity notes log, file attachments, linked lead banner, address map
- [x] Add `updateOpportunityNotes` callback to EstimatorContext (saves notes field inline)
- [x] Extend CONVERT_LEAD_TO_ESTIMATE reducer to accept transferNotes + transferAttachments flags
- [x] Update ConversionModal: add transfer step asking user to copy lead notes/attachments into estimate
- [x] Wire EstimateDetailsPanel into OpportunityDetailsTab for area === 'estimate' and area === 'job'
- [x] Linked lead banner in EstimateDetailsPanel: shows source lead notes, photos, online request data (read-only)

## Feature: World-Class Job Details Page
- [x] Add ChangeOrder type to types.ts
- [x] Add changeOrders, parentJobId, isChangeOrder, coNumber fields to Opportunity type
- [x] Add CREATE_CHANGE_ORDER, UPDATE_CHANGE_ORDER, UPDATE_SOW action types and reducers
- [x] Update APPROVE_ESTIMATE reducer to handle isChangeOrder estimates (updates parent job CO record instead of creating new job)
- [x] Rebuild JobDetailsSection: job header, full history timeline, signed estimate viewer, editable SOW, tasks, pricing summary, unified attachments, change orders panel, internal notes
- [x] Build CreateChangeOrderModal inline in JobDetailsSection
- [x] Wire change order creation: opens estimate tab with pre-populated phases from job's estimateSnapshot
- [x] CO estimates appear with "CO" badge in PipelineBoard estimate cards
- [x] Change Orders panel on job shows each CO's status and lets PM open it

## Bug Fixes: React key + nested button errors
- [x] Fix duplicate key `W0WQ__ru` — prefixed allAttachments uid with source (`lead-`, `est-`, `job-`) to prevent ID collisions
- [x] Fix nested `<button>` inside `<button>` — moved rightSlot outside CollapsibleTrigger into a sibling div

## Feature: CO Value Rollup + Estimate→Job Transfer Prompt
- [x] CO value rollup: individual CO line items with delta amounts + revised total shown in Job Details Pricing Summary
- [x] Estimate→Job transfer prompt: Step 4 added to EstimateApprovedModal (notes + attachments toggles, only shown when there is data to transfer)

## Feature: Lightbox + Job Completion + CO Badge
- [x] Build AttachmentLightbox component: full-screen overlay, prev/next nav, keyboard arrows, close on Escape/backdrop click
- [x] Wire lightbox into JobDetailsSection attachment grid
- [x] Wire lightbox into EstimateDetailsPanel attachment grid
- [x] Job completion workflow: "Mark Job Complete" button on Job Details header
- [x] JobCompleteModal: final invoice summary, customer sign-off signature canvas, confirm button
- [x] COMPLETE_JOB reducer action: calls archiveJob → sets stage to Invoice Paid, auto-generates final invoice, logs completion activity
- [x] CO status badge on Job Details header: yellow "CO Pending" badge with pulse when any CO is in 'draft' or 'sent' status

## Bug Fixes: Mobile UI — Estimate Header + Modal Scroll
- [x] PresentSection header: button text overflows outside button bounds on mobile — fix with flex-shrink-0, whitespace-nowrap, and responsive sizing
- [x] EstimateApprovedModal invoice confirmation step: no scroll — add overflow-y-auto to modal body so user can scroll full content

## Feature: Customer Portal Document Flow
- [x] estimate.send: upsert portal customer + create portal estimate record + magic-link CTA to specific estimate
- [x] gmail.sendInvoice: upsert portal customer + create portal invoice record + magic-link CTA in email
- [x] PortalLogin: honor ?redirect= param after token verification (navigate to redirect path, not /portal/appointments)
- [x] portal.getCustomerPortalData HP-side procedure: return portal estimates + invoices by hpCustomerId
- [x] CustomerProfileTab type: add 'portal' value
- [x] CustomerSection: add 'portal' tab showing portal estimates, invoices, and appointments for the customer
- [x] PortalLayout sidebar: add Documents nav item
- [x] PortalDocuments page: list all estimates + invoices shared with customer, with status badges and action buttons

## Bug Fix: estimate.send customerId type mismatch
- [x] Fix estimate.send: removed z.number() customerId field from schema; EstimateSection and SendEstimateDialog now pass hpCustomerId (string) correctly

## Feature: Resend + Read-Receipt on Portal Tab
- [ ] Add viewedAt column to portalEstimates and portalInvoices schema, run db:push
- [ ] Mark portalEstimate viewedAt on first open in PortalEstimateDetail
- [ ] Mark portalInvoice viewedAt on first open in PortalInvoiceDetail
- [ ] Add portal.resendEstimate procedure: re-generate magic link + resend email
- [ ] Add portal.resendInvoice procedure: re-generate magic link + resend email
- [ ] CustomerPortalTab: show "Viewed" badge with timestamp when viewedAt is set
- [ ] CustomerPortalTab: add Resend button on each estimate and invoice card
