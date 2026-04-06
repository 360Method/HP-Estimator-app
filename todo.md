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

- [ ] Final invoice auto-generation on job completion (Archive Job)
- [x] Invoice PDF export / print (InvoicePrintView with print-only isolation)
- [ ] Send invoice to customer via email
- [ ] Stripe webhook → update invoice status in DB (currently client-side only)
- [ ] PayPal JS SDK integration (replace redirect flow with in-page approval)
- [ ] Deposit % configurable per-job (currently defaults to 50%)
- [ ] Tax rate per-customer or per-region
- [ ] Communication tab (SMS/email log)
- [ ] Attachments tab (photo uploads)
- [ ] Reporting / analytics page
- [ ] Marketing tab
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
- [ ] Add "Schedule" date fields to JobDetailsSection (service date, estimated duration)
- [ ] Auto-create schedule event when job is created or estimate is scheduled

## Schedule Tab — Future Improvements

- [ ] Add assignee and status filters to SchedulePage filter bar
- [ ] Upgrade drag-reschedule to support time-slot precision in week/day views
- [ ] Add event resize support (drag end time to adjust duration)
- [ ] Add recurrence support in EventFormModal (daily/weekly/biweekly/monthly)
- [ ] Add "Schedule" date fields to JobDetailsSection (service date, estimated duration)
- [ ] Auto-create schedule event when job is created or estimate is scheduled

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
