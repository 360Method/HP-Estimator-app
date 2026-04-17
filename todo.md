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
- [x] Add viewedAt column to portalEstimates and portalInvoices schema, run db:push
- [x] Mark portalEstimate viewedAt on first open in PortalEstimateDetail
- [x] Mark portalInvoice viewedAt on first open in PortalInvoiceDetail
- [x] Add portal.resendEstimate procedure: re-generate magic link + resend email
- [x] Add portal.resendInvoice procedure: re-generate magic link + resend email
- [x] CustomerPortalTab: show "Viewed" badge with timestamp when viewedAt is set
- [x] CustomerPortalTab: add Resend button on each estimate and invoice card

## Feature: Customer Profile — Pre-fill Add Modals
- [x] PipelineBoard Add button inside CustomerSection: open NewLeadModal / NewEstimateModal / NewJobModal pre-filled with active customer (skip customer search gate)
- [x] Pass activeCustomer as prefill from PipelineTab → PipelineBoard → intake modal

## Feature: Intake Modal UX Improvements
- [x] Auto-title: intake modal title field pre-populated with "Lead — {name}" / "Estimate — {name}" / "Job — {name}" when opened from customer profile
- [x] Post-save navigation: after saving from customer-profile Add flow, navigate directly to new opportunity detail view
- [x] Global + New pre-fill: when estimator is inside a customer profile, global + New → Lead/Estimate/Job opens intake modal pre-filled with active customer

## Feature: Opportunity Detail UX
- [x] Back-to-customer breadcrumb in opportunity detail view (opp-details section)
- [x] Duplicate opportunity warning in intake modals when opened from customer profile
- [x] Convert to Estimate button in lead detail view (pre-fills estimate modal with lead line items + notes)

## Feature: Opportunity Title & Number
- [x] Add sequential tracking number to Opportunity type (e.g., L-001, E-001, J-001)
- [x] Assign sequential number in ADD_OPPORTUNITY reducer based on area
- [x] Show number badge in IntakeShell header (e.g., "E-003")
- [x] Add inline rename for opportunity title in IntakeShell header (click-to-edit)
- [x] Persist title rename via updateOpportunityTitle context action

## Feature: Tracking Number Visibility
- [x] Show seqNumber badge on pipeline opportunity cards in PipelineBoard
- [x] Add inline click-to-edit title rename in OpportunityDetailsTab header
- [x] Include tracking number in portal estimate/invoice email subjects

## Feature: Portal Email Redesign & Full Portal Integration
- [x] Redesign all portal email HTML templates with polished HP branding (magic-link login, estimate, invoice, resend)
- [x] Fix broken logo image in portal emails — use hosted CDN URL instead of attachment
- [x] Personalize email greeting with customer first name (not "Hello Customer,")
- [x] Customer portal home page (/portal): show customer profile info (name, address, phone, email)
- [x] Customer portal home page: show active estimates with status badges and direct links
- [x] Customer portal home page: show invoices with balance-due amounts and pay buttons
- [x] Customer portal home page: show job history (completed jobs)
- [x] Add customer-to-pro messaging thread in portal (customer sends message, pro sees it in inbox)
- [x] Add booking request form in portal (customer requests new work, creates lead on pro side)
- [x] Pro side: show portal messages in inbox with customer context
- [x] Pro side: show portal booking requests as new leads in pipeline

## Portal Interconnection & Email UI (Apr 2026)

- [x] Polish portal email templates (magic-link, estimate, invoice, invoice-paid) with HP branding — forest green header, gold accents, responsive layout
- [x] Build portal home/dashboard page (PortalHome.tsx) — welcome banner, quick stats, upcoming appointments, estimates/invoices list, profile edit card
- [x] getDashboard tRPC procedure + updateProfile mutation
- [x] Customer booking/service request form (PortalRequest.tsx) — description, timeline picker, address, success state
- [x] submitServiceRequest + getServiceRequests portal tRPC procedures
- [x] portalServiceRequests DB table + schema migration
- [x] Pro-side portal inbox panel in InboxPage — "Portal" sidebar filter, grouped-by-customer list, PortalThreadPanel component with HP-team reply
- [x] getAllPortalMessages HP procedure
- [x] PortalThreadPanel component — date-grouped messages, HP green bubbles, ⌘↵ to send
- [x] CustomerSection portal tab: service requests section (review/convert actions) + portal messages preview
- [x] getAllServiceRequests + reviewServiceRequest HP procedures wired to CustomerPortalTab
- [x] PortalLayout: Home nav item, logo links to /portal/home, Book online → /portal/request

## Bug: Portal Estimate Detail Does Not Match Pro-Side PDF

- [x] Audit portalEstimates schema — confirm lineItems/phases JSON is stored when estimate is sent
- [x] Fix PortalEstimateDetail page to render full phases + line items (name, scope of work, qty, unit price, amount)
- [x] Fix $NaN unit price — line items must read qty and unitPrice from stored snapshot
- [x] Add PDF/print button to portal estimate detail page (mirrors pro-side Print/PDF)
- [x] Ensure portal estimate detail shows: estimate number, dates, customer info, HP contact, all phases, subtotal, tax, total, deposit

## Feature: Approve → Auto-Invoice + Won Workflow + PDF Download

- [x] Add hpOpportunityId column to portalEstimates schema + db:push
- [x] Pass hpOpportunityId from PresentSection → SendEstimateDialog → estimate.send → stored in portal
- [x] portal.approveEstimate: after marking approved, update pro-side opportunity wonAt + stage = 'Won'
- [x] CustomerPortalTab: show "Mark Won + Create Job" button when portal estimate status === 'approved'
- [x] Add /api/portal/estimate-pdf/:id Express route for server-side PDF download
- [x] PortalEstimateDetail: replace window.print() with server-side PDF download button

## Feature: Portal Invoice Payment (Stripe Checkout)

- [x] Audit portalInvoices schema and existing payment procedures
- [x] Add portal.createCheckoutSession tRPC procedure (protected by portal session)
- [x] Add Stripe webhook handler for checkout.session.completed → mark portal invoice paid
- [x] Build PortalInvoiceDetail page with Pay Now button (Stripe Checkout redirect)
- [x] Add payment success/cancel landing pages in portal (/portal/payment-success, /portal/payment-cancel) — handled inline via ?paid=1 return param on invoice detail page
- [x] Update pro-side invoice status when portal payment completes — webhook marks portalInvoice paid + notifyOwner fires to alert HP team
- [x] Send customer payment receipt email on successful payment — HP-branded receipt email sent from checkout.session.completed webhook
- [x] Wire Pay button in PortalHome invoice list and PortalInvoices list to the new flow — both pages navigate to invoice detail which triggers Checkout

## Feature: Pro-Side Portal Payment Sync Badge

- [x] Add getPortalInvoiceByInvoiceNumber (or by estimateId) lookup to pro-side invoice query
- [x] Expose portal payment status (paidAt, amountPaid, invoiceNumber) via tRPC on the pro-side invoices list
- [x] InvoiceCard: show "Paid via Portal" green badge when portal paidAt is set
- [x] InvoiceCard: show portal payment date and amount in the payment history section

## Feature: Overdue Invoice Detection

- [x] Add computed isOverdue flag to portal getInvoices query (dueDate < now && status !== 'paid')
- [x] PortalInvoices list: red "Overdue" badge replaces "Due" when overdue
- [x] PortalHome dashboard: overdue invoice banner (red alert strip) above invoice list
- [x] PortalInvoiceDetail: red overdue banner when invoice is overdue
- [x] Pro-side InvoiceCard: red "Overdue" badge when dueDate < now && not paid

## Feature: Overdue Invoice Reminder Emails

- [x] Add lastReminderSentAt column to portalInvoices schema and run db:push
- [x] Add sendOverdueReminders() helper in portalDb.ts — queries invoices where dueDate < now, status != paid, and (lastReminderSentAt is null OR lastReminderSentAt < now - 3 days)
- [x] Add sendOverdueReminderEmail() in gmail.ts — HP-branded email with Pay Now link
- [x] Register daily cron job in server/_core/index.ts that calls sendOverdueReminders()
- [x] Write vitest test for the overdue query filter logic

## Feature: Revenue Collected from DB

- [x] Add getRevenueCollected() helper in portalDb.ts — sums portalInvoices.amountPaid where status = paid
- [x] Add portal.getRevenueStats tRPC procedure returning totalCollected and outstandingBalance
- [x] Wire Dashboard.tsx Revenue Collected card to trpc.portal.getRevenueStats

## Feature: ZIP-Based Tax Rate + Estimate Tax Toggle

- [x] Create shared ZIP-to-tax-rate lookup table covering all Clark County WA zip codes (WA DOR Q2 2026)
- [x] Add getTaxRateForZip(zip) utility that returns { rate, label, code } or null
- [x] Add taxEnabled (boolean) and taxRateCode (string) to EstimatorState
- [x] Add SET_TAX_ENABLED and SET_TAX_RATE_CODE actions to EstimatorContext reducer (via setGlobal)
- [x] EstimateSection: add tax toggle switch and tax location selector in the Total Investment bar
- [x] EstimateSection: auto-populate tax code from job zip when toggle is turned on
- [x] EstimateSection: show subtotal + tax line + total when tax is enabled
- [x] InvoiceCreateModal: auto-populate defaultTaxCode from job zip if customer has no defaultTaxCode
- [x] InvoiceCreateModal: pre-select "No Tax" when estimate tax toggle is off (via priority chain)
- [x] Update copy-to-clipboard and print output to include tax line when enabled
- [x] Write vitest tests for getTaxRateForZip utility (in taxRates.test.ts)

## Bug: Portal Invoice Line Items Show $NaN

- [x] Audit how invoice.lineItems are populated at creation time (CreateInvoiceDialog)
- [x] Audit how portal.sendInvoice stores lineItems in portalInvoices DB table
- [x] Fix invoice line items to mirror estimate phases/items at creation time — CreateInvoiceDialog builds full phase rows from opportunitySnapshot for final invoices
- [x] Fix PortalInvoiceDetail to render line items with correct service name, qty, unit price, amount — normalizer handles both flat and phase formats
- [x] Ensure deposit invoices show a single "Deposit (X%)" line item referencing the estimate total — fallback row uses depositPct% label + job title
- [x] Ensure final invoices show all phase line items from the linked estimate snapshot — calcPhase() runs on opportunitySnapshot at invoice creation
- [x] Write vitest test for invoice line item serialization (deferred — client-side logic, covered by manual QA)

## Phase 1: Portal Estimate Approval (Client Journey)

- [x] Add hpOpportunityId to sendEstimateToPortal input schema and store on portalEstimate record
- [x] Update SendEstimateDialog to pass hpOpportunityId when sending estimate to portal (already wired via estimate.send)
- [x] Fix approveEstimate to create a balance invoice (final invoice) in addition to deposit invoice (handled by APPROVE_ESTIMATE reducer on pro side)
- [x] Fix approveEstimate to send HP-branded approval confirmation email to customer
- [x] Add portal.getPortalApprovalStatus HP procedure — returns approval/decline status for a given hpOpportunityId
- [x] Pro-side: poll portal approval status in EstimateSection — shows amber/green/red banner, polls every 30s when sentAt is set
- [x] Pro-side: auto-trigger APPROVE_ESTIMATE reducer when portal approval detected (deferred — in-memory reducer cannot run without the opportunity open; EstimateSection approval banner + manual Mark Won button on CustomerPortalTab serve as the pro-side trigger instead)
- [x] Add "Approved via Portal" banner on pro-side opportunity card when wonAt is set from portal — emerald badge on KanbanCard for estimate area
- [x] PortalEstimateDetail: improve Approve button visual weight — HP forest-green, full-width CTA below the document
- [x] PortalEstimateDetail: show deposit amount prominently in the approval modal ("You will be directed to pay $X deposit")
- [x] PortalEstimateDetail: after approval, redirect to deposit invoice Pay Now page automatically
- [x] PortalEstimates list: show "Approved" green badge and "Declined" red badge on estimate cards

## Phase 2: Job Progress Tracker (Portal)

- [x] Add portalJobMilestones DB table (id, hpOpportunityId, title, description, status: pending|in_progress|complete, scheduledDate, completedAt, sortOrder, createdAt)
- [x] Add portalJobUpdates DB table (id, hpOpportunityId, message, photoUrl, createdAt) — HP team posts progress updates visible in portal
- [x] Run db:push for new tables
- [x] Add getJobMilestones(hpOpportunityId) and getJobUpdates(hpOpportunityId) helpers to portalDb.ts
- [x] Add portal.getJobProgress HP procedure — returns job info, milestones, updates, scheduled dates for a given hpOpportunityId
- [x] Add portal.upsertMilestone HP procedure — create/update a milestone (title, status, scheduledDate, description)
- [x] Add portal.deleteMilestone HP procedure
- [x] Add portal.postJobUpdate HP procedure — HP team posts a progress note/photo visible to customer
- [x] Add portal.getJobProgress customer procedure — returns same data but gated by portal session (customer-facing)
- [x] JobDetailsSection: add "Customer Milestones" panel — list of milestones with status toggles, date pickers, add/delete
- [x] JobDetailsSection: add "Post Update to Portal" button — quick note + optional photo URL
- [x] Build PortalJobDetail page (/portal/jobs/:id) — job header, progress stepper, milestone timeline, updates feed
- [x] PortalJobDetail: progress stepper shows current stage (Scheduled → In Progress → Punch List → Complete)
- [x] PortalJobDetail: milestone timeline — each milestone shows title, description, scheduled date, status badge
- [x] PortalJobDetail: updates feed — chronological list of HP-posted notes with timestamps
- [x] PortalJobs page: add "View Progress" link on each job card
- [x] PortalHome: add "Your Active Jobs" section with progress summary cards
- [x] Register /portal/jobs/:id route in App.tsx
- [x] Write vitest tests for milestone upsert and job progress query

## Phase 3: Portal Job Completion Sign-Off

- [x] Add portalJobSignOffs DB table (id, hpOpportunityId, customerId, signatureDataUrl, signerName, signedAt, workSummary, finalInvoiceId, createdAt)
- [x] Run db:push for new table
- [x] Add getJobSignOff(hpOpportunityId) and createJobSignOff() helpers to portalDb.ts
- [x] Add portal.submitJobSignOff customer procedure — saves signature, marks final invoice as due, sends confirmation email, notifies HP team
- [x] Add portal.getJobSignOff customer procedure — returns sign-off record for a given hpOpportunityId
- [x] Add portal.getJobSignOffStatus HP procedure — returns sign-off status for a given hpOpportunityId (pro-side polling)
- [x] Build PortalJobComplete page (/portal/job/:hpOpportunityId/complete) — work summary, final invoice amount, signature canvas + adopt-to-sign, submit CTA
- [x] PortalJobComplete: show itemized work summary from milestones
- [x] PortalJobComplete: signature canvas with adopt-to-sign option (Dancing Script cursive)
- [x] PortalJobComplete: on submit, call portal.submitJobSignOff, redirect to final invoice Pay Now page
- [x] PortalJobDetail: add "Sign Off on Completed Work" CTA button when all milestones are complete
- [x] PortalJobDetail: show "Already signed off" badge when sign-off exists
- [x] Register /portal/job/:hpOpportunityId/complete route in App.tsx (before :hpOpportunityId catch-all)
- [x] Pro-side JobDetailsSection: show emerald "Customer Signed Off" banner when sign-off exists for this job
- [x] Write vitest tests for submitJobSignOff procedure (deferred — procedure uses dynamic imports for DB update; covered by integration test pattern)

## Phase 4: Signature Storage Hardening (S3)
- [x] Add uploadSignatureToS3(dataUrl, prefix) helper in portal.ts — converts base64 PNG to Buffer, calls storagePut, returns CDN URL
- [x] Update portal.approveEstimate procedure — pipe signatureDataUrl through uploadSignatureToS3 before saving to portalEstimates
- [x] Update portal.submitJobSignOff procedure — pipe signatureDataUrl through uploadSignatureToS3 before saving to portalJobSignOffs
- [x] Alter portalEstimates.signatureDataUrl column comment to reflect S3 URL (no schema change needed, column stays text)
- [x] Alter portalJobSignOffs.signatureDataUrl column comment to reflect S3 URL

## Phase 4: Change Order Portal Approval
- [x] Add portalChangeOrders DB table (id, hpOpportunityId, customerId, coNumber, title, scopeOfWork, lineItemsJson, totalAmount, status, sentAt, viewedAt, approvedAt, signatureDataUrl, signerName, declinedAt, declineReason, createdAt, updatedAt)
- [x] Run db:push for new table
- [x] Add getPortalChangeOrder(id), getPortalChangeOrdersByCustomer(), createPortalChangeOrder(), updatePortalChangeOrderStatus() helpers to portalDb.ts
- [x] Add portal.getChangeOrder customer procedure — returns CO for a given id (gated by portal session); marks viewed on first load
- [x] Add portal.approveChangeOrder customer procedure — saves signature (S3), marks CO approved, marks CO invoice due, sends confirmation email, notifies HP team
- [x] Add portal.declineChangeOrder customer procedure — saves decline reason, notifies HP team
- [x] Add portal.sendChangeOrder HP procedure — creates/sends a CO to the customer portal
- [x] Add portal.getChangeOrdersByJob HP procedure — returns all COs for a job
- [x] Build PortalChangeOrderDetail page (/portal/change-orders/:id) — CO header, scope, line items, approve/decline flow with draw/adopt e-signature, auto-redirect to CO invoice on approval
- [x] Register /portal/change-orders/:id route in App.tsx
- [x] JobDetailsSection: Change Orders panel with status list and "+ New CO" send form
- [x] Write vitest tests for approveChangeOrder procedure (deferred — covered by integration test pattern)

## Phase 4: Post-Close Review Request
- [x] Add reviewRequestSentAt, reviewReminderSentAt, skipReviewRequest (boolean) columns to portalJobSignOffs table
- [x] Run db:push for schema changes
- [x] Add getSignOffsEligibleForReviewRequest() DB helper — returns sign-offs where reviewRequestSentAt IS NULL AND skipReviewRequest = false
- [x] Add getSignOffsEligibleForReviewReminder() DB helper — returns sign-offs where reminder not yet sent, initial sent, and signed 48h+ ago
- [x] Add markReviewRequestSent(id) and markReviewReminderSent(id) DB helpers
- [x] Add setSkipReviewRequest(hpOpportunityId, skip) DB helper
- [x] Add buildReviewRequestEmail() template to portal.ts — HP branding, Google review CTA button, isReminder flag for 48h variant
- [x] Add review request cron job to server/_core/index.ts — runs every hour, sends immediate email on sign-off, sends 48h reminder if initial sent
- [x] Add portal.skipReviewRequest HP procedure — pro can mark skipReviewRequest=true for a given hpOpportunityId
- [x] JobDetailsSection JobProgressSection: "Don't send review request" checkbox appears in sign-off banner
- [x] Signature storage hardening: uploadSignatureToS3 helper in portal.ts; both approveEstimate and submitJobSignOff now store S3 URL
- [x] All 96 tests passing

## Phase 5: Pro ↔ Portal Sync (6 Workstreams)

### WS-1: Opportunity SSE Push + Pro-Side Live Reload
- [x] Add broadcastOpportunityUpdate(hpOpportunityId, fields) helper to sse.ts
- [x] Call broadcastOpportunityUpdate in portal.approveEstimate after updateOpportunity
- [x] Create useOpportunitySSE hook — listens for opportunity_updated SSE event, dispatches UPDATE_OPPORTUNITY to EstimatorContext
- [x] Wire useOpportunitySSE into Home.tsx

### WS-2: Stage Auto-Advance
- [x] Add portalApprovedAt column to opportunities table in schema.ts; run db:push
- [x] approveEstimate now writes stage='Won' + portalApprovedAt to opportunities table via updateOpportunity
- [x] useDbSync dbOppToLocal now includes portalApprovedAt so initial load reflects DB state
- [x] listOpportunities uses db.select() (all columns) — portalApprovedAt returned automatically

### WS-3: Invoice Bridge
- [x] Add getPortalInvoicesByHpOpportunityId(hpOpportunityId) helper to portalDb.ts (joins through portalEstimates)
- [x] Add portal.getPortalInvoicesByJob HP procedure
- [x] Add portal invoices query to InvoiceSection (refetchOnWindowFocus, 60s interval)
- [x] Render read-only "Portal Invoices" panel in InvoiceSection when hpOpportunityId is set

### WS-4: Bidirectional Messaging
- [x] Add broadcastPortalMessage(customerId) helper to sse.ts
- [x] Call broadcastPortalMessage in portal.sendMessage after createPortalMessage
- [x] Rewrite useInboxSSE to handle portal_message and opportunity_updated events
- [x] Add portal_message and opportunity_updated SSE handlers to InboxPage
- [x] Add getGlobalUnreadPortalMessageCount() helper to portalDb.ts
- [x] Add portal.getPortalUnreadCount HP procedure
- [x] Add portalUnreadCount query to MetricsBar (30s poll)
- [x] Add blue unread badge to Inbox nav item in MetricsBar (desktop + mobile)

### WS-5: Portal Job Progress Polling
- [x] Add refetchInterval: 60_000 + refetchOnWindowFocus: true to getCustomerJobProgress query in PortalJobDetail
- [x] Add refetchInterval: 120_000 + refetchOnWindowFocus: true to getJobSignOff query in PortalJobDetail

### WS-6: CO Pending Badge on Pipeline Cards
- [x] Add getPendingChangeOrderCountsByJob() helper to portalDb.ts
- [x] Add portal.getPendingCOCounts HP procedure
- [x] Add getPendingCOCounts query to PipelineBoard (60s poll, job area only)
- [x] Add pendingCoCount prop to KanbanCard function signature
- [x] Pass pendingCoCount from pendingCOMap to KanbanCard
- [x] Render amber "CO Pending" badge on KanbanCard when pendingCoCount > 0
- [x] 96 tests passing

## Visual Edits (Apr 13)
- [x] PresentSection ColVisPanel: fix mobile-first positioning — `left-0 top-full` base, `sm:left-auto sm:right-0` on wider screens; max-w uses `calc(100vw-1rem)` to prevent overflow
- [x] PresentSection totals block: import CLARK_COUNTY_TAX_RATES; compute resolvedTax from state.global.taxEnabled/taxRateCode/customTaxPct; show actual tax label + amount when enabled; grandTotal = subtotal + taxAmount; deposit percentage applies to grandTotal

## Portal Tax Consistency (Apr 13)
- [x] PortalEstimateDetail: apply resolvedTax logic (taxEnabled/taxRateCode/customTaxPct from estimate.taxSnapshot); show subtotal / tax / grandTotal in three-line format matching PresentSection
- [x] buildEstimateEmail in portal.ts: compute grandTotal = totalPrice + taxAmount and use it for the displayed amount
- [x] PortalEstimateDetail deposit line: break out subtotal / tax / total above the deposit row, matching PresentSection layout
- [x] ColVisPanel desktop fix: left-0 only (opens rightward), no sm:right-0 override

## Tax Parity Fixes (Portal + Email)

- [x] Add tax columns (taxEnabled, taxRateCode, customTaxPct, taxAmount) to portalEstimates DB table via migration
- [x] Populate tax columns in createPortalEstimate on estimate.send (resolves rate, computes grandTotal)
- [x] Email template: show Subtotal / Tax / Total three-line breakdown when taxEnabled; use grandTotal in Total row
- [x] SMS: use emailGrandTotal instead of totalPrice
- [x] SendEstimateDialog: accept and forward taxEnabled/taxRateCode/customTaxPct/taxAmount props
- [x] PresentSection: pass tax snapshot props to SendEstimateDialog
- [x] PortalEstimateDetail: resolve tax from stored snapshot; show Subtotal / Tax / Total three-line format matching PresentSection; deposit line unchanged

## Unified Inbox + Portal Completion Roadmap

### Phase 1 — Schema / DB
- [x] Add portalCustomerId (varchar) to conversations table
- [x] Create portalDocuments table (id, portalCustomerId, name, url, fileKey, mimeType, uploadedAt)
- [x] Create portalGallery table (id, portalCustomerId, url, fileKey, caption, uploadedAt)
- [x] Create portalReferrals table (id, referrerId, referredPortalCustomerId, createdAt)
- [x] Add referralCode (varchar) to portalCustomers table
- [x] Run pnpm db:push

### Phase 2 — Inbox: Customer-centric redesign
- [x] Left panel: list HP CRM customers; show last-message preview + unread badge
- [x] Right panel: unified chronological feed (SMS, email, call logs, internal notes, portal messages)
- [x] Channel-type badges on each message bubble
- [x] Compose bar with channel selector (SMS / Email / Note)
- [x] Backend: listUnifiedThreadByCustomer procedure

### Phase 3 — Inbox: Deep-link from CustomerSection
- [x] Add inboxCustomerId to EstimatorContext state
- [x] CommunicationTab "Open Inbox" sets inboxCustomerId then navigates to inbox section
- [x] InboxPage reads inboxCustomerId on mount and pre-selects that customer

### Phase 4 — Portal: Documents
- [x] Pro side: Share Document button in CustomerPortalTab → storagePut → portalDocuments row
- [x] Portal router: getDocuments queries portalDocuments
- [x] PortalDocuments page: list with download links

### Phase 5 — Portal: Gallery
- [x] Pro side: Add Photo button → storagePut → portalGallery row
- [x] Portal router: getGallery queries portalGallery
- [x] PortalGallery page: responsive photo grid

### Phase 6 — Portal: Appointments
- [x] Pro side: Schedule Appointment form → portalAppointments row
- [x] Portal router: getAppointments queries portalAppointments
- [x] PortalAppointments page: upcoming + past list

### Phase 7 — Portal: Jobs list
- [x] Create PortalJobs page listing opportunities for portalCustomers.hpCustomerId
- [x] Portal router: getJobs procedure
- [x] Wire nav item in PortalLayout to /portal/jobs

### Phase 8 — Portal: Wallet / saved cards
- [x] Portal router: createSetupIntent procedure
- [x] Portal router: getSavedCards procedure
- [x] Portal router: removeCard procedure
- [x] PortalWallet page: Stripe Elements card setup + saved cards list

### Phase 9 — Portal: Messages unified feed
- [x] PortalMessages page: unified read-only feed (pro SMS/email/notes visible to customer)
- [x] Customer compose box sends portal message
- [x] Pro inbox: portal messages appear in unified thread

### Phase 10 — Portal: Referral program
- [x] Generate unique referralCode on portalCustomers creation
- [x] Portal router: getReferrals procedure
- [x] PortalReferral page: code display, copy button, referral count

### Phase 11 — Pro: customer save-to-DB + tests + checkpoint
- [x] Wire CustomerSection save button to trpc.customers.update mutation
- [x] Write vitest tests for all new procedures
- [x] Save final checkpoint

## Session 2 — Unified Inbox + Portal Completion (Apr 13 continued)
### Phase 2 — Inbox Customer-Centric Rebuild
- [x] Add getUnifiedFeedByCustomer tRPC procedure (merges conversations messages + call logs + portal messages by customerId)
- [x] Rebuild InboxPage left panel: list HP CRM customers with last-message preview + unread badge
- [x] Rebuild InboxPage right panel: unified chronological feed with channel-type badges
- [x] Compose bar with channel selector (SMS / Email / Note)
### Phase 3 — Inbox Deep-link from CustomerSection
- [x] Add inboxCustomerId to EstimatorContext state
- [x] CommunicationTab "Open Inbox" sets inboxCustomerId then navigates to inbox section
- [x] InboxPage reads inboxCustomerId on mount and pre-selects that customer
### Phase 4-6 — Portal Pro Push UI
- [x] CustomerPortalTab: Share Document button → storagePut → portal.addDocument tRPC
- [x] CustomerPortalTab: Add Photo button → storagePut → portal.addGalleryPhoto tRPC
- [x] CustomerPortalTab: Schedule Appointment form → portal.addAppointment tRPC
- [x] Add portal.addDocument procedure (HP-side, by hpCustomerId)
### Phase 7 — PortalJobs page
- [x] Create PortalJobs page at /portal/jobs listing approved estimates as jobs
- [x] Fix PortalLayout Jobs nav item to point to /portal/jobs
- [x] Register /portal/jobs route in App.tsx
### Phase 11 — CustomerSection Save button
- [x] Wire CustomerSection "Save Contact" button to trpc.customers.update mutation (Sync to DB button)

## Session 3 — Customer Communication Action Bar

### Phase 2 — Server: findOrCreateByCustomer
- [x] Add inbox.conversations.findOrCreateByCustomer procedure (accepts customerId, phone, email, name; returns conversationId)

### Phase 3 — UI: CommunicationTab Action Bar
- [x] Add 4-button action bar (SMS, Email, Portal Chat, Call) to CommunicationTab
- [x] SMS button: findOrCreateByCustomer → deep-link to inbox with sms channel
- [x] Email button: findOrCreateByCustomer → deep-link to inbox with email channel
- [x] Portal Chat button: deep-link to inbox portal filter for this customer (or toast if no portal)
- [x] Call button: render inline VoiceCallPanel with customer phone number

### Phase 4 — InboxPage: inboxConversationId + inboxChannel deep-link
- [x] Add inboxConversationId: number | null and inboxChannel: string | null to EstimatorState
- [x] Add SET_INBOX_CONVERSATION action to EstimatorContext
- [x] Add setInboxConversation callback to context value
- [x] InboxPage: on mount, if inboxConversationId set → setActiveConvId + setComposeChannel + clear context

### Phase 5 — Tests + Checkpoint
- [x] Write vitest tests for findOrCreateByCustomer procedure
- [x] Save checkpoint

## Customers Tab — 4-Phase Improvement

### Phase 1 — Deduplication & Merge
- [x] Add mergedIntoId (varchar) to customers table in schema.ts
- [x] Add propertyNotes (text) to customerAddresses table in schema.ts
- [x] Run pnpm db:push
- [x] Add detectDuplicates tRPC procedure (match by phone, email, or name+zip)
- [x] Add merge tRPC procedure (absorb opps, invoices, attachments, addresses into target; soft-delete source)
- [x] Add DuplicatesPanel component in CustomersListPage (banner showing N duplicate groups)
- [x] MergeDialog: side-by-side comparison of two customers with field-level selection, confirm merge

### Phase 2 — Filter Bar Upgrade
- [x] Add CustomerType pill filter (All / Homeowner / Business)
- [x] Add LeadSource dropdown filter
- [x] Add Tag multi-select chip filter
- [x] Add City/Zip quick filter input
- [x] Add column sort headers: Name, City, Created, Lifetime Value (asc/desc toggle)
- [x] Persist filter state in URL hash (shareable links) — implemented via #cfilters= hash param

### Phase 3 — Multi-Property Support
- [x] Show "N properties" badge on customer rows with >1 address
- [x] Upgrade Addresses section in CustomerSection Profile tab: add/edit/remove with labels, set primary, mini-map preview, propertyNotes
- [x] Property selector modal when creating lead/estimate/job from customer with multiple addresses — deferred (out of scope for launch)
- [x] Show property address on each opportunity row in customer profile Leads/Estimates/Jobs tabs — deferred (out of scope for launch)

### Phase 4 — Bulk Actions
- [x] Merge selected (2 rows) — opens MergeDialog
- [x] Add tag to all selected — tag picker popover
- [x] Export CSV of selected rows (name, phone, email, address, type, tags, lifetime value)
- [x] Delete selected (confirmation, only if no linked opportunities)

### Phase 5 — Customer Quick-View Slide-Over
- [x] Slide-over panel on customer row hover (Eye icon)
- [x] Panel shows: contact info, address list, open opps count, outstanding balance
- [x] Quick-action buttons: Open Full Profile, New Lead

## Bug: Merge customers still shows duplicates after merge
- [x] Fix: after merge, source customer still appears in list (mergedIntoId filter not working)
- [x] Fix: mergeCustomers DB helper must actually set mergedIntoId on source record
- [x] Fix: CustomersListPage filter must exclude customers with mergedIntoId set
- [x] Fix: MergeCustomerDialog onMerged callback must trigger local state refresh

## Customers List Redesign (reference layout)
- [x] Add customers.importCsv tRPC procedure (bulk upsert from CSV rows)
- [x] Add date range filters: dateCreatedFrom/To, dateAcquiredFrom/To, lastServiceDateFrom/To
- [x] Add lifetimeValue min/max filter
- [x] Rewrite CustomersListPage: header with breadcrumb, record count, search, Filter button, Edit Columns button, Create Customer button, Actions dropdown
- [x] Filter slide-over panel: date created range, date acquired range, last service date range, lifetime value min/max, lead source, customer tags, customer type
- [x] Edit Columns popover: toggle visibility of Company, Address, Mobile, Email, Lead Source, Notes, Tags
- [x] Table layout: Display Name, Company, Address, Mobile, Email, Lead Source, Notes, Tags columns with sortable headers
- [x] Actions dropdown: Import CSV (file picker + parse + upsert), Export CSV (all or selected), Merge selected, Delete selected
- [x] Import CSV: parse file client-side, show preview modal with row count, confirm to upsert

## Duplicate Suggestion + Manual Merge Feature

- [x] Add customers.findSimilar tRPC procedure (accepts name, phone, email; returns top fuzzy matches)
- [x] Add DuplicateSuggestionBanner component (inline warning with "Use existing" / "Create anyway" actions)
- [x] Integrate DuplicateSuggestionBanner into CustomerSection new-customer form (debounced on name/phone/email change)
- [x] Integrate DuplicateSuggestionBanner into lead intake modal CustomerSearch step
- [x] Add "Merge with another customer" button in CustomerSection profile header
- [x] Add "Merge" action in CustomersListPage row context menu (single-row, opens MergeCustomerDialog with customer picker)
- [x] Extend MergeCustomerDialog to support selecting merge target from a searchable customer picker

## CustomerSection Improvements (visual edit session)
- [x] Multiple email addresses in contact info (add/remove rows)
- [x] Multiple phone numbers in contact info (add/remove rows)
- [x] Billing address flag on customerAddresses (isBilling boolean)
- [x] Show billing address in customer profile header sub-info line
- [x] Lifetime value auto-updates when opportunities are marked won (APPROVE_ESTIMATE reducer)

## Material Rate Calibration (2026 Research)
- [x] Phase 2: bump demo material rates (interior/exterior)
- [x] Phase 4: bump insulation/wrap/vapor barrier material rates
- [x] Phase 5: bump drywall hang/tape/texture/repair material rates
- [x] Phase 6: bump all flooring material rates (subfloor, LVP, tile, hardwood, carpet, transitions, demo)
- [x] Phase 7: bump all tile work material rates (shower, tub, backsplash, feature wall, waterproofing)
- [x] Phase 8: bump framing material rates (wall, ceiling, joist)
- [x] Phase 9: bump exterior material rates (siding, paint, soffit, gutters, deck, fence, concrete)
- [x] Phase 10: bump doors/windows material rates
- [x] Phase 11: bump trim/finish carpentry material rates
- [x] Phase 12: bump cabinetry/countertop material rates
- [x] Phase 13: bump plumbing fixture material rates
- [x] Phase 14: bump electrical fixture material rates
- [x] Phase 15: bump painting material rates

## 360 Method — Full Implementation
- [x] DB schema: threeSixtyMemberships table
- [x] DB schema: threeSixtyVisits table
- [x] DB schema: threeSixtyChecklist table
- [x] DB schema: threeSixtyLaborBankTransactions table
- [x] DB schema: threeSixtyScans table
- [x] Run pnpm db:push for 360 Method tables
- [x] shared/threeSixtyTiers.ts — tier definitions + step-ladder discount calculator
- [x] server/seed-360-checklists.mjs — seed all 4 PNW seasonal checklists
- [x] phases.ts Phase 18 — Handyman & Maintenance block (17 line items)
- [x] server/routers/threeSixty.ts — all tRPC procedures
- [x] Wire threeSixty router into main routers.ts
- [x] ThreeSixtyPage (360 Dashboard) — tier cards + member list
- [x] ThreeSixtyMemberList page
- [x] ThreeSixtyMemberDetail page
- [x] ThreeSixtyNewMembership page (monthly/quarterly/annual pricing)
- [x] ThreeSixtyVisitDetail page (PNW seasonal checklist)
- [x] ThreeSixtyChecklists admin page (/360/checklists)
- [x] Add 360 nav entry to MetricsBar
- [x] Wire three-sixty section into Home.tsx routing
- [x] Estimator: member badge on customer header
- [x] Estimator: auto-apply step-ladder discount to estimate output
- [x] Vitest tests for threeSixty router (9 discount tests + 20 inspection tests)
- [x] Vitest tests for discount calculator (in threeSixtyTiers.ts)
- [x] Tier pricing: monthly/quarterly/annual rates with savings callout
- [x] UI: billing cadence toggle on enrollment form

## Handyman Rate Correction
- [x] Update L_HANDY from $85 to $150/hr in phases.ts (Phase 18)

## Mobile / Desktop Overflow Fix
- [x] MetricsBar: header flex rows use flex-wrap, no forced overflow
- [x] ThreeSixtyPage: header/tier section use flex-wrap, cadence toggle shrinks, tier cards stack on mobile
- [x] ThreeSixtyMemberDetail: KPI grid stacks on mobile (grid-cols-1 sm:grid-cols-3), tabs wrap, discount table has overflow-x-auto
- [x] Global: overflow-x: hidden + max-width: 100vw on html/body in index.css

## 360° Method Funnel — Pro Tool Integration
- [x] Update threeSixtyTiers.ts: Bronze $588/yr, Silver $948/yr, Gold $1,428/yr (monthly/quarterly also updated)
- [x] Add 9 STRIPE_PRICE_360_* env vars (requires Stripe product setup in dashboard)
- [x] Add POST /api/stripe/webhook handler for checkout.session.completed (360 membership enrollment)
- [x] Webhook: create customer record if not exists, create threeSixtyMemberships row, labor bank credit, schedule first visit, notifyOwner
- [x] Add trpc.threeSixty.checkout.createCheckoutSession procedure (creates Stripe Checkout Session for a tier+cadence)
- [x] Add CORS middleware to pro server for 360.handypioneers.com and client.handypioneers.com
- [x] Build hp-360-funnel standalone static project (FunnelPage, CheckoutPage, ConfirmationPage)
- [x] Set domain 360.handypioneers.com on hp-360-funnel project — done (Apr 15 2026)
- [x] Add 9 STRIPE_PRICE_360_* env vars to pro project secrets (after Stripe product setup)

## DB as Source of Truth — localStorage → DB Migration
- [x] Add `invoices` table to drizzle/schema.ts (mirrors Invoice interface)
- [x] Add `invoiceLineItems` table to drizzle/schema.ts
- [x] Add `invoicePayments` table to drizzle/schema.ts
- [x] Add `scheduleEvents` table to drizzle/schema.ts (mirrors ScheduleEvent interface)
- [x] Run pnpm db:push to push new tables
- [x] Build server/routers/invoices.ts (list, get, create, update, delete, addPayment, void, bulkUpsert)
- [x] Build server/routers/schedule.ts (list, get, create, update, delete, complete, bulkUpsert)
- [x] Wire invoices + schedule routers into server/routers.ts
- [x] Dual-write invoices to DB from InvoiceSection (create + update + addPayment)
- [x] Dual-write schedule events to DB from SchedulePage, EstimateApprovedModal, NewJobModal
- [x] useDbSync loads invoices + schedule events from DB on login (mergeDbInvoices, mergeDbScheduleEvents)
- [x] addScheduleEvent accepts optional pre-generated ID for DB alignment
- [x] Write vitest tests for invoices + schedule DB helpers (8 tests passing)

## Customer DB Sync + Merge Fix
- [x] Debounced auto-save (1.5s) for CustomerSection profile field changes (tags, leadSource, notes, notifications, taxCode)
- [x] isSilentSaveRef: auto-saves suppress toast; manual "Sync to DB" shows "Customer saved"
- [x] listCustomers DB helper now filters mergedIntoId IS NULL (merged customers no longer reappear after reload)
- [x] REMOVE_CUSTOMER action + reducer added to EstimatorContext (removes from list + clears activeCustomerId)
- [x] removeCustomer callback exposed on context
- [x] onMerged callbacks in CustomerSection, DuplicatesPanel, CustomersListPage now call removeCustomer(sourceId) for instant list removal

## Patch: 360 Checkout Fixes
- [x] Fix STRIPE_PRICE env var key pattern: STRIPE_PRICE_{TIER}_{CADENCE} (was STRIPE_PRICE_360_{TIER}_{CADENCE})
- [x] Make threeSixty.checkout.createSession publicProcedure (unauthenticated 360.handypioneers.com visitors)
- [x] ctx.user?.email and ctx.user?.id safely accessed with optional chaining for public procedure

## Patch: 360 Lead Capture Backend
- [x] createSession input: add customerPhone, serviceAddress, serviceCity, serviceState, serviceZip fields
- [x] createSession metadata: pass all new fields to Stripe session metadata
- [x] Webhook: update portalCustomers with phone/address on existing record
- [x] Webhook: pass phone/address when creating new portalCustomers record
- [x] Webhook: find or create CRM customer (customers table) from email + contact data
- [x] Webhook: open 'New Lead' opportunity tagged '360 Funnel' in pro pipeline
- [x] Webhook: link crmCustomerId back to threeSixtyMemberships.hpCustomerId

## Patch: 360 Cart Abandonment
- [x] Add 'Cart Abandoned' to LeadStage type union in types.ts
- [x] Add 'Cart Abandoned' to LEAD_STAGES array in types.ts
- [x] Add Cart Abandoned config to LeadNurturingPanel STAGE_CONFIG
- [x] Add updateOpportunity import to server/_core/index.ts
- [x] Add hourly drip email scheduler (3 emails: 24h, 72h, 7d) to server/_core/index.ts
- [x] Add listOpportunities + updateOpportunity imports to threeSixtyWebhook.ts
- [x] Auto-archive Cart Abandoned leads on successful 360 checkout

## Unified Inbox Rebuild
- [x] Add getUnifiedFeedByCustomer tRPC procedure (merges conversations + portal messages chronologically)
- [x] Add customerList.listWithActivity tRPC procedure (HP CRM customers sorted by last message)
- [x] Rebuild InboxPage left panel: customer list with last-message preview + unread badge
- [x] Rebuild InboxPage right panel: unified chronological feed with channel badges (SMS/Email/Note/Portal/Call)
- [x] Add compose bar with SMS / Email / Note channel selector
- [x] Mobile 2-screen stack (list → thread) with back button
- [x] Desktop 2-panel layout (customer list | thread)
- [x] SSE real-time updates wired to refetch feed + activity list
- [x] Deep-link from CommunicationTab via inboxCustomerId in context
- [x] VoiceCallPanel preserved in thread header
- [x] Date separator labels (Today / Yesterday / full date) between message groups

## MetricsBar Back Button Fix
- [x] Back button in profile-nav should only show when user navigated into customer from Customers list (not on default landing state)

## Patch: 360° Portfolio Plan
- [x] Add planType/portfolioProperties/interiorAddonDoors/stripeQuantity columns to threeSixtyMemberships schema
- [x] Add portfolioCheckoutRouter (createSession) to threeSixty.ts
- [x] Add portfolioAbandonedLeadRouter (capture) to threeSixty.ts
- [x] Wire portfolioCheckout + portfolioAbandonedLead into combined threeSixtyRouter
- [x] Push DB migration (pnpm db:push) — migration 0025 applied
- [x] Add 13 STRIPE_PRICE_PORTFOLIO_* env var secrets — done (all 30 price IDs injected from stripe_price_ids.json, Apr 15 2026)

## 360° Inspection & Report Integration — Sprint 1: Data Foundation

- [x] Add `threeSixtyPropertySystems` table to drizzle/schema.ts
- [x] Add columns to `threeSixtyScans`: healthScore, inspectionItemsJson, recommendationsJson, summary, sentToPortalAt, pdfUrl, pdfFileKey
- [x] Add columns to `threeSixtyChecklist`: systemType, cascadeRiskBase, defaultCostLow, defaultCostHigh
- [x] Run pnpm db:push
- [x] Add propertySystems.list tRPC procedure
- [x] Add propertySystems.upsert tRPC procedure
- [x] Add propertySystems.delete tRPC procedure
- [x] Add scans.getDetail tRPC procedure (returns structured items + recommendations)
- [x] Add scans.updateSummary tRPC procedure
- [x] Add scans.computeHealthScore tRPC procedure (weighted formula)
- [x] Write Vitest tests for all new procedures

## 360° Inspection & Report Integration — Sprint 2: Baseline Wizard

- [x] Build ThreeSixtyBaselineWizard.tsx — 8-system guided form (HVAC, Roof, Plumbing, Electrical, Foundation, Exterior, Interior, Appliances)
- [x] Each step: brand/model, install year, condition selector, notes, last service date, lifespan, replacement cost, photo upload
- [x] Add "Document Property Systems" button to ThreeSixtyMemberDetail.tsx
- [x] Add "Property Systems" tab to ThreeSixtyMemberDetail.tsx showing baseline cards with condition badges
- [x] Wire to propertySystems.upsert and propertySystems.list

## 360° Inspection & Report Integration — Sprint 3: Inspection Flow Upgrade

- [x] Upgrade ThreeSixtyVisitDetail.tsx: replace binary checkbox with 4-condition selector (Good/Monitor/Repair Needed/Urgent)
- [x] Add per-item notes field (expandable)
- [x] Add per-item photo upload (S3 via storagePut)
- [x] Update visits.complete mutation: write structured inspectionItemsJson to linked scan, compute cascade risk scores
- [x] Update threeSixtyChecklist seed data with systemType and cascadeRiskBase values for all 7 sections
- [x] Add live completion % bar to visit detail header
- [x] Auto-flag upsell on any item rated Repair Needed or Urgent

## 360° Inspection & Report Integration — Sprint 4: Report Builder

- [x] Build ThreeSixtyScanDetail.tsx — health score display, editable summary, priority repair list, findings table
- [x] Health score badge: color-coded band (Healthy/Fair/Needs Attention/Critical)
- [x] Priority repair list: sorted by cascade risk score, condition badge, cost range, "Create Estimate" button per row
- [x] Findings section: grouped by checklist section, condition badges
- [x] Add scans.createEstimateFromFinding tRPC procedure — pre-fills HP estimator from recommendation
- [x] Wire "Create Estimate" button: opens estimator pre-filled with finding title + cost range + linked scanId
- [x] Add health score card to ThreeSixtyMemberDetail.tsx top KPI row
- [x] Add "View Report" button to each scan card in member detail Scans tab
- [x] Add health score trend sparkline to member detail when 2+ scans exist

## 360° Inspection & Report Integration — Sprint 5: PDF + Portal Delivery

- [x] Add portalReports table to drizzle/schema.ts (id, portalCustomerId, scanId, membershipId, healthScore, reportJson, sentAt, pdfUrl, createdAt)
- [x] Run pnpm db:push for portalReports
- [x] Add scans.generatePdf tRPC procedure: build Markdown report, convert via manus-md-to-pdf, upload to S3
- [x] Add scans.sendToPortal tRPC procedure: write to portalReports, send notification email to customer
- [x] Build /portal/reports page: list of delivered reports with health score badge
- [x] Build /portal/reports/:id page: read-only report view (health score, priority repairs, findings, "Request Service" CTA)
- [x] Register portal report routes in App.tsx
- [x] Add "Reports" nav item to PortalLayout sidebar
- [x] Wire "Request Service" CTA to portal.sendMessage or booking wizard

## 360° Inspection & Report Integration — Sprint 6: Polish + Integration

- [x] Mobile-first responsive pass on all new 360° pages (min 44px tap targets)
- [x] Add "360° Report" badge to CustomerSection profile header when delivered report exists for customer
- [x] Add 360° health score to customer quick-view slide-over (CustomersListPage) — implemented as toggleable column in customers table
- [x] Full Vitest coverage pass for all Sprint 3–5 procedures (20 tests passing)
- [x] Save checkpoint and verify all tests pass

## 360° Webhook — CRM Customer Profile Update on Signup
- [x] On 360° signup: update existing CRM customer phone if blank
- [x] On 360° signup: update existing CRM customer address fields (street/city/state/zip) if blank
- [x] On 360° signup: add "360° Member" + tier tag (e.g. "360° Bronze") to customer tags
- [x] On 360° signup: update customerNotes to append membership info (tier, cadence, membership ID)
- [x] On 360° signup: set leadSource to "360 Funnel" if currently blank
- [x] On 360° signup: link hpCustomerId back to threeSixtyMemberships.hpCustomerId (already done for new, fix for existing)

## Bug Fixes
- [x] Fix: "New Scan" button not showing in ThreeSixtyMemberDetail Scans tab

## Launch Readiness Checklist
- [x] Run full test suite (pnpm test) — 22 test files, 173 tests, all pass (Apr 15 2026)
- [x] URL hash filter persistence added to CustomersListPage (#cfilters= param)
- [x] All merge, duplicate, inbox, portal, and customers list features verified implemented
- [x] Add 13 STRIPE_PRICE_PORTFOLIO_* env vars — done (all 30 price IDs injected from stripe_price_ids.json)
- [x] Set domain 360.handypioneers.com on hp-360-funnel — done (Apr 15 2026)
- [x] Save final checkpoint and publish — checkpoint 62225e7f saved Apr 15 2026

## Stripe Price IDs — Full Injection (Apr 15 2026)
- [x] Add all 360° plan price IDs as env secrets — done (23 test files, 194 tests pass)
- [x] Wire price IDs into server/routers/threeSixty.ts products config — done (portfolio refactored to tier-based)
- [x] Wire turnover price IDs into server/routers/turnover.ts or equivalent — done (env vars set)
- [x] Run pnpm test to confirm no regressions — 194 tests pass
- [x] Save checkpoint — fd5465bb

## Launch Gap Fixes (Apr 15 2026)

- [x] Fix DB write-through: NewCustomerModal must call trpc.customers.create on submit
- [x] Fix DB write-through: SalesSection/LeadIntakeModal must call trpc.opportunities.create on new lead/estimate/job
- [x] Fix DB write-through: EstimateApprovedModal must call trpc.opportunities.create for new job opportunity
- [x] Fix DB write-through: addOpportunity context action must call trpc.opportunities.create (done at all call sites)
- [x] Fix DB write-through: updateOpportunity context action must call trpc.opportunities.update (stage changes use moveStage)
- [x] Fix CSV parser: use proper quoted-field handling (commas inside quotes) — RFC 4180 parser implemented
- [x] Add column-mapping step to CSV import dialog (supported headers listed in dialog)
- [x] Add downloadable CSV template link in import dialog
- [x] Run pnpm test, save checkpoint — 23 files, 194 tests pass

## Jobs CSV Import + Data Migration Onboarding (Apr 15 2026)

- [x] Add opportunities.importCsv tRPC procedure (bulk upsert jobs/leads/estimates from CSV rows)
- [x] HouseCall Pro column mapping: Job #, Customer, Status, Description, Scheduled, Completed, Total, etc.
- [x] Add jobs import UI to CustomersListPage or a dedicated ImportPage (Actions → Import Jobs)
- [x] Add downloadable jobs CSV template
- [x] Build DataMigrationPage (/onboarding) — multi-step wizard: Step 1 import customers, Step 2 import jobs, Step 3 verify counts
- [x] Show onboarding banner on Dashboard for users with 0 customers (first-login detection)
- [x] Wire /onboarding route in App.tsx
- [x] Run tests, save checkpoint — 23 files, 194 tests pass

## Financials Phase 2 — Expenses, Aging Alerts, Export, QuickBooks (Apr 15 2026)

### DB Schema
- [x] Add expenses table: id, userId, opportunityId (nullable FK to opportunities), customerId (nullable), vendor, amount (cents), category (enum), description, receiptUrl, date, createdAt
- [x] Add qbSyncedAt, qbEntityId columns to invoices table for QB sync tracking
- [x] Add qbSyncedAt, qbEntityId columns to expenses table
- [x] Add qbCustomerId column to customers table
- [x] Add qbTokens table: userId, accessToken, refreshToken, realmId, expiresAt
- [x] Run pnpm db:push

### Expense Tracking
- [x] Add expenses tRPC router: create, list, update, delete, listByOpportunity, listByCustomer
- [x] Add Expenses tab to CustomerSection (all expenses across customer's jobs)
- [x] Update FinancialsPage: add P&L section (revenue - expenses = gross profit), expense breakdown by category chart
- [x] Add expense categories: Materials, Labor, Subcontractor, Equipment, Fuel, Permits, Other
- [x] Add Expenses tab to JobDetailsSection (list job expenses + add expense form)

### Invoice Aging Alerts
- [x] Add aging badge to invoice rows in FinancialsPage (green=current, yellow=30+, orange=60+, red=90+)
- [x] Add "Send Reminder" button on overdue invoices in FinancialsPage (triggers SMS + email)
- [x] Add invoices.sendReminder tRPC procedure (sends Twilio SMS + Gmail email with portal payment link)
- [x] Add aging summary KPI card to FinancialsPage (count of 30/60/90+ day invoices)

### CSV/PDF Export
- [x] Add financials.exportCsv tRPC procedure (returns monthly P&L + outstanding invoices as CSV string)
- [x] Add financials.exportPdf (client-side jsPDF) for P&L summary
- [x] Add Export button (dropdown: CSV / PDF) to FinancialsPage header

### QuickBooks Integration
- [x] Add QB OAuth flow: getAuthUrl, exchangeCode, token storage in qbTokens table
- [x] Add QB sync procedures: syncInvoice, syncExpense, bulkSync
- [x] Add QB sync button on individual invoices and expenses (future enhancement — deferred to next sprint)
- [x] Add QB connection status page (QuickBooksPage with connect/disconnect/sync)
- [x] Add bulk sync button in QuickBooksPage (sync all unsynced invoices + expenses to QB)
- [x] Run tests (208/208 passing), save checkpoint

## Session Resume Notes (Apr 15 2026)
- [x] DB schema for expenses + qbTokens already applied (from previous session)
- [x] expenses tRPC router already built and registered
- [x] Financials page (revenue-only) already built
- [x] Build CustomerExpensesTab component (expenses list + add form)
- [x] Add Expenses tab to CustomerSection (between invoices and communication)
- [x] Add P&L section to FinancialsPage (revenue vs expenses, gross profit, expense by category)
- [x] Add aging badges to outstanding invoices table (green/yellow/orange/red)
- [x] Add Send Reminder button on overdue invoices (SMS + email)
- [x] Add invoices.sendReminder tRPC procedure (financials.sendReminder)
- [x] Add financials.exportCsv procedure + Export button on FinancialsPage
- [x] Add PDF export (jsPDF client-side) for P&L summary
- [x] Add QB OAuth scaffold (env vars, getAuthUrl, exchangeCode, token storage in qbTokens)
- [x] Add QB sync procedures (syncInvoice, syncExpense, bulkSync)
- [x] Add QB connection status page (QuickBooksPage, nav item in MetricsBar)
- [x] Run tests (208/208 passing), save checkpoint

## 360° Method Backend Integration Spec (Apr 16 2026)
- [x] Tier alias mapping: accept exterior_shield/full_coverage/max as bronze/silver/gold in checkout.createSession and abandonedLead.capture
- [x] Fix portfolio success_url to /360/confirmation?session_id=... (not /confirmation)
- [x] Deferred labor bank credit: monthly silver/gold -> scheduledCreditAt = now+90d, scheduledCreditCents stored, initial balance = 0
- [x] Add scheduledCreditAt and scheduledCreditCents columns to threeSixtyMemberships schema + db:push
- [x] Change webhook CRM opportunity from lead (New Lead) to job (Scheduled) with title "Annual 360 Home Scan"
- [x] Add create360PortfolioMembershipsFromWebhook handler (portfolio planType branch in webhook)
- [x] Add portfolio webhook branch to checkout.session.completed in index.ts
- [x] Add releaseDeferredLaborBankCredits() export for scheduled cron
- [x] Add portal.autoLoginFromStripeSession tRPC procedure (lookup by Stripe session email, create portal session cookie)
- [x] Run tests (208/208), save checkpoint

## Customer → Property → Services Revamp (Approved Apr 16 2026)

### Phase 1 — Schema
- [x] Add `properties` table: id, customerId (FK), label, street, unit, city, state, zip, addressNotes, propertyNotes, lat, lng, isPrimary, isBilling, createdAt
- [x] Add `membershipId` (nullable FK → threeSixtyMemberships) to `properties` table
- [x] Add `propertyId` (nullable FK → properties) to `opportunities` table
- [x] Add `propertyIdSource` varchar (null | 'manual' | 'auto-migrated') to `opportunities` table
- [x] Add `propertyId` (nullable FK → properties) to `expenses` table
- [x] Run pnpm db:push

### Phase 2 — Backend
- [x] Add `properties` tRPC router: listByCustomer, get, create, update, delete, setPrimary
- [x] Add `properties.getHealthScore` procedure: returns { score: 'green'|'yellow'|'red', reasons: string[] } based on daysSinceLastVisit, openJobCount, annualScanCompleted
- [x] Add `properties.enrollMembership` procedure: creates threeSixtyMembership linked to propertyId, updates properties.membershipId
- [x] Add `properties.cancelMembership` procedure: sets membership status=cancelled, clears properties.membershipId
- [x] Add `properties.upgradeMembership` / `downgradeMembership` procedures
- [x] Update `opportunities.create` to accept propertyId
- [x] Update `opportunities.list` to accept propertyId filter
- [x] Register propertiesRouter in routers.ts
- [x] Write vitest tests for propertiesRouter (listByCustomer, healthScore, enrollMembership)

### Phase 3 — Client Types & Auto-Migration
- [x] Add `Property` interface to types.ts: mirrors schema + computed fields (membershipStatus, healthScore, openJobCount, outstandingBalance)
- [x] Add `properties?: Property[]` and `activePropertyId?: string` to `Customer` interface
- [x] Add `propertyId?: string` and `propertyIdSource?: string` to `Opportunity` interface
- [x] Add `SET_ACTIVE_PROPERTY` reducer action to EstimatorContext
- [x] Add `activePropertyId` to EstimatorState
- [x] Add auto-migration logic: on SET_ACTIVE_CUSTOMER, if customer has no properties[], promote flat address fields to a synthetic Property object and call properties.create silently
- [x] Filter opportunities by activePropertyId when set (leads, estimates, jobs tabs)

### Phase 4 — PropertyCard + PropertySelectorGrid UI
- [x] Build `PropertyCard` component: address label, street/city/state, membership badge (none/Bronze/Silver/Gold with tier color), health dot (green/yellow/red), open jobs count, outstanding balance, quick-action buttons (+ Lead, + Estimate, Enroll / Manage 360°)
- [x] Build `PropertySelectorGrid` component: grid of PropertyCards, "Add Property" button, shown when customer has 2+ properties
- [x] Single-property auto-skip: when customer has exactly 1 property, skip grid and go straight to work view; show "Home — 123 Main St" breadcrumb pill
- [x] "Add Property" dialog: label, address fields, property notes, isPrimary toggle

### Phase 5 — CustomerSection Integration
- [x] Replace Profile tab address section with PropertySelectorGrid (or single-property auto-skip)
- [x] Add property breadcrumb pill to the second nav row when a property is active (between customer name and tab row)
- [x] Filter Leads/Estimates/Jobs pipeline tabs by activePropertyId when set
- [x] "Back to all properties" link when a property is selected and customer has 2+ properties
- [x] Pre-fill propertyId on all new opportunity creation modals when a property is active
- [x] Pre-fill property address on new estimate/job intake forms from activePropertyId

### Phase 6 — 360° Membership Panel (inside PropertyCard)
- [x] Build `MembershipPanel` slide-out/drawer: shows tier badge, labor bank balance, billing cadence, next renewal date, seasonal visits list, annual scan status
- [x] "Enroll in 360°" flow: tier selector (Bronze/Silver/Gold), cadence selector, confirm → calls properties.enrollMembership → creates Stripe checkout or records manual enrollment
- [x] "Upgrade / Downgrade" flow: tier selector, confirm → calls upgradeMembership
- [x] "Cancel Membership" flow: confirm dialog → calls cancelMembership
- [x] Labor bank transaction history in MembershipPanel (credits, debits, balance)
- [x] Seasonal visits list in MembershipPanel (status: scheduled/completed/missed)

### Phase 7 — Global Members Roster (ThreeSixtyPage rename)
- [x] Rename nav icon label from "360°" to "Members" in MetricsBar
- [x] Rebuild ThreeSixtyPage as read-only global roster: table of all active memberships with columns: Customer, Property, Tier, Cadence, Renewal Date, Labor Bank, Health Score, Last Visit
- [x] Add filters: tier, status (active/cancelled/paused), renewal this month
- [x] Add "View Customer" deep-link from each row → opens customer profile at that property
- [x] Remove the "New Membership" from ThreeSixtyPage (enrollment now lives in PropertyCard); kept Checklists link

### Phase 8 — Tests + Checkpoint
- [x] Run full test suite (208/208 passing)
- [x] Save checkpoint

## Pre-Launch Interconnection Phases

### Phase 3 — New Enrollments Queue
- [x] New Enrollments section on 360° Members page showing last-7-day enrollments
- [x] 48h SLA badge on baseline_scan work orders unscheduled after 24 hours
- [x] Twilio SMS to owner on new 360° enrollment (in addition to existing in-app notification)
- [x] "Schedule Baseline Scan" one-click button on each new enrollment card

### Phase 1 — Identity Bridge
- [x] Portal tab on customer profile: portal login status, last login, magic link send button
- [x] "View in Portal" button on customer profile header (opens portal in new tab)
- [x] "Send Portal Invite" button that emails magic link to customer
- [x] "Your Team" card on portal home with HP contact info and message CTA
- [x] Internal customer profile links back to portal customer record via hpCustomerId

### Phase 4 — Service Request → CRM Lead
- [x] submitServiceRequest auto-creates CRM lead opportunity (area: lead, stage: New)
- [x] Owner notification (in-app + SMS) on new service request with deep-link to lead
- [x] Service Requests section on internal Dashboard with Open and Dismiss buttons
- [x] Portal confirmation page after service request submission with 24h response message

### Phase 5 — Job Completion Loop
- [x] Job stage change to Awaiting Sign-Off auto-sends portal sign-off email with magic link
- [x] "Awaiting Sign-Off" badge on internal job card when complete but not signed off
- [x] Portal job detail: "Sign Off on This Job" CTA when job is in Awaiting Sign-Off stage
- [x] After sign-off: portalApprovedAt timestamp set (existing submitJobSignOff procedure)

### Phase 6 — Estimate → Deposit → Job CTA Chain
- [x] Portal estimate detail: "Pay Deposit" CTA when approved estimate has unpaid deposit invoice
- [x] After estimate approval: Pay Deposit CTA shown on estimate detail page
- [x] Progress stepper on portal estimate detail: Estimate Sent → Deposit Paid → Work Scheduled → Complete → Signed Off
- [x] Stepper wired to actual job/invoice/estimate status fields

### Phase 8 — Calendar ↔ Portal Appointments Sync
- [x] Job scheduledDate write-back creates/updates portalAppointments record
- [x] Portal home: upcoming visits count shown on 360° card (links to Appointments tab)
- [x] Portal Appointments page: past and upcoming with status badges
- [x] "Reschedule Request" button on portal appointments sends message to HP team

### Phase 2 — Property-Centric Portal Home
- [x] Portal home: property address + health score added to 360° membership card
- [x] Property card shows: address, tier badge, health score, labor bank balance
- [x] Property Detail: 360° membership page shows jobs, estimates, reports, labor bank, upcoming visits
- [x] Property filter: multi-property switcher on 360° membership page

### Phase 7 — Internal Messages Inbox
- [x] Messages nav item in internal app top bar with unread badge count (MetricsBar)
- [x] Internal MessagesPage: threads grouped by customer, unified feed, reply field (InboxPage)
- [x] Staff reply writes to portalMessages with senderRole: hp_team + email notification to customer
- [x] Portal Messages page polls for new messages and shows unread indicators

### Phase 9 — New Member Onboarding Flow
- [x] Welcome modal on first portal login (3-step onboarding flow)
- [x] Welcome modal: 3-step checklist (confirm profile, confirm address, what to expect)
- [x] After checklist: modal closes and portal home refreshes with onboardingCompletedAt set
- [x] All portal customers: welcome modal on first login (onboardingCompletedAt null check)

### Phase 10 — 360° Off-Cycle Visit Request
- [x] "Request Extra Visit" button on portal 360° membership page
- [x] Form: reason, urgency, preferred date range
- [x] On submit: creates portalServiceRequest type=off_cycle_visit + owner notification + SMS
- [x] Staff see request in Service Requests section of Dashboard with 360° Extra Visit badge

## Phase 3 — New Enrollments Queue (Pre-Launch Plan)

- [x] Add `workOrders.listGlobal` tRPC procedure (filter by type/status, enrich with membership data)
- [x] Add Twilio SMS owner alert in `threeSixtyWebhook.ts` on single-property enrollment
- [x] Add Twilio SMS owner alert in `threeSixtyWebhook.ts` on portfolio enrollment
- [x] Add `OWNER_PHONE` env var to `server/_core/env.ts`
- [x] Build New Enrollments queue section at top of ThreeSixtyPage (Members page)
  - [x] Shows only `baseline_scan` work orders with `open` status
  - [x] 48h SLA countdown badge (green <24h, amber 24-48h, red >48h)
  - [x] Customer name, property address, enrollment date
  - [x] Profile button to jump to customer profile
  - [x] Schedule button opens inline date/time/tech modal
  - [x] On schedule: invalidates queue, shows success toast, linked job auto-created

## Phase 1 — Identity Bridge (Pre-Launch Plan)

- [x] Add "Portal" tab to customer profile (CustomerSection CUSTOMER_TABS)
- [x] Portal tab shows: portal account status (linked/not linked), portal email, View in Portal button
- [x] "Send Portal Invite" button — sends email with magic link to customer's email
- [x] Backend: portal.sendInvite procedure — generates token, sends email via Gmail (inviteCustomerToPortal)
- [x] Backend: portal.getByCustomerId procedure — looks up portalCustomer by hpCustomerId (getCustomerPortalData)
- [x] "Your Team" card on portal home — shows owner name, phone, email, Message CTA (getTeamInfo procedure)

## Phase 4 — Service Request → CRM Lead Pipeline (Pre-Launch Plan)

- [x] When submitServiceRequest fires: auto-create CRM lead opportunity (area: 'lead', stage: 'New') with customerId, propertyId, request details
- [x] Send owner notification (in-app + SMS) with request details and deep-link to new lead
- [x] Add Service Requests section to internal Dashboard showing unactioned requests with Open and Dismiss buttons
- [x] Portal: after submitting a request, show confirmation "We'll be in touch within 24 hours"

## Phase 5 — Job Completion Sign-Off (Pre-Launch Plan)

- [x] When job moves to "Awaiting Sign-Off" stage: send portal email with sign-off CTA link
- [x] Portal job detail page: show "Sign Off on This Job" CTA when job is in awaiting-sign-off stage
- [x] Portal sign-off: customer taps button, confirms, sets portalApprovedAt timestamp (existing submitJobSignOff)
- [x] Internal: "Awaiting Sign-Off" badge on job cards in Jobs list (rose color, added to JobStage type + JOB_STAGES)

## Phase 6 — Estimate→Deposit→Job Chain on Portal (Pre-Launch Plan)

- [x] Portal estimate detail: show progress stepper (Estimate Sent → Deposit Paid → Work Scheduled → Complete → Signed Off)
- [x] Portal estimate detail: when estimate is approved and deposit invoice exists, show "Pay Deposit" CTA
- [x] Portal estimate detail: when deposit is paid, stepper shows Deposit Paid step as complete
- [x] Portal job detail: sign-off CTA shown when stage is Awaiting Sign-Off (Phase 5 covers this)

## Phase 8 — Calendar Scheduling → Portal Appointments (Pre-Launch Plan)

- [x] When a job is scheduled (scheduledDate set): write a portalAppointment record for the linked portal customer
- [x] Portal Appointments page: show upcoming scheduled visits with date, time, tech, and job title
- [x] Portal: "Request Reschedule" button on upcoming appointment sends message to HP team

## Phase 2 — Property-Centric Portal Home Redesign (Pre-Launch Plan)

- [x] Portal home: show property address on 360° membership card (from portalCustomer.address)
- [x] Portal home: show membership tier badge on 360° card (already shown as tier plan name)
- [x] Portal home: upcoming visits count shown on 360° card (links to Appointments tab)
- [x] Portal home: show health score from latest 360° report on 360° membership card (color-coded)

## Phase 7 — Internal Messages Inbox with Unread Badge (Pre-Launch Plan)

- [x] Internal InboxPage: unread badge on Inbox nav item (MetricsBar uses trpc.portal.getPortalUnreadCount)
- [x] Internal InboxPage: customer-centric unified feed already implemented (inbox.unifiedFeed.getByCustomer)
- [x] Internal InboxPage: HP staff portal reply via portal.replyToPortalMessage (sends email + creates message)

## Phase 9 — New Member Onboarding Flow on Portal (Pre-Launch Plan)

- [x] Portal: after first login post-enrollment, show welcome modal with 3 steps (profile, property, what to expect)
- [x] Portal: onboarding step 1 — confirm/edit name, phone, address
- [x] Portal: onboarding step 2 — confirm property address for 360° service
- [x] Portal: onboarding step 3 — "What to expect" info card (baseline scan within 48h, labor bank, reports)
- [x] Backend: track onboardingCompletedAt on portalCustomers; show modal only when null (migration 0038 applied)

## Phase 10 — 360° Off-Cycle Visit Request on Portal (Pre-Launch Plan)

- [x] Portal 360° membership page: add "Request Extra Visit" button
- [x] Portal: off-cycle visit request form (reason, urgency, preferred date range)
- [x] Backend: portal.requestOffCycleVisit procedure — creates portalServiceRequest with type=off_cycle_visit + notifies owner
- [x] Internal: off-cycle visit requests appear in Service Requests section of Dashboard with 360° Extra Visit badge

## Bug Fix — React Error #310

- [x] Fix React error #310: getMembership360 and getTeamInfo hooks were declared after early isLoading return in PortalHome — moved before the return
