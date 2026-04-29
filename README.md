# Handy Pioneers — Field Estimator

> **Internal field operations platform for Handy Pioneers.** Covers the full job lifecycle from first contact to final payment, with a branded client portal at `client.handypioneers.com` and a pro-side app at `pro.handypioneers.com`.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Key Features](#key-features)
5. [Database Schema](#database-schema)
6. [Environment Variables](#environment-variables)
7. [Getting Started](#getting-started)
8. [Available Scripts](#available-scripts)
9. [Testing](#testing)
10. [Deployment](#deployment)

---

## Overview

The HP Field Estimator is a full-stack web application built on React 19 + Express 4 + tRPC 11. It replaces disconnected spreadsheets and third-party tools with a single workspace that handles:

- **CRM** — customer profiles, address book, communication history
- **Pipeline** — leads → estimates → jobs → invoices with Kanban and table views
- **Estimating** — multi-phase calculator with Good/Better/Best material tiers, Portland-area labor rates, GM enforcement (≥ 30 %), and PDF/print output
- **Scheduling** — month/week/day/agenda calendar with drag-to-reschedule
- **Payments** — Stripe and PayPal in-page checkout, manual payment recording, tax support
- **Inbox** — unified SMS (Twilio), Gmail, and client-portal messaging hub
- **Client Portal** — branded self-service portal where customers view estimates and invoices, pay online, book new work, and message the HP team
- **Online Booking** — public-facing request form with zip-code service-area check; new requests auto-create leads in the pipeline
- **Reporting & Marketing** — revenue charts, pipeline funnel, and outreach tools

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, shadcn/ui |
| API | tRPC 11 (type-safe end-to-end, no REST boilerplate) |
| Backend | Express 4, Node.js, TypeScript |
| Database | MySQL / TiDB via Drizzle ORM |
| Auth | Email + bcrypt (pro side) · Magic-link email (client portal) |
| Payments | Stripe (card), PayPal (JS SDK) |
| Messaging | Twilio (SMS/Voice), Gmail API |
| File Storage | S3-compatible object storage |
| Maps | Google Maps JavaScript API (proxied, no key required) |
| Testing | Vitest (86 tests) |

---

## Project Structure

```
hp-field-estimator/
├── client/
│   ├── src/
│   │   ├── components/          # Shared UI (DashboardLayout, InvoiceSection, PipelineBoard, PortalThreadPanel, …)
│   │   │   └── sections/        # Feature sections rendered inside Home.tsx (CustomerSection, CalculatorSection, …)
│   │   ├── contexts/            # EstimatorContext (global app state + reducer)
│   │   ├── hooks/               # useAuth, useInboxSSE, …
│   │   ├── lib/                 # trpc.ts client, calc.ts, types.ts, phases.ts
│   │   └── pages/
│   │       ├── portal/          # Client-portal pages (PortalHome, PortalEstimates, PortalMessages, PortalRequest, …)
│   │       ├── book/            # Public online booking flow
│   │       ├── settings/        # App settings pages
│   │       ├── EstimatorDashboard.tsx
│   │       ├── InboxPage.tsx
│   │       ├── PipelinePage.tsx
│   │       ├── SchedulePage.tsx
│   │       └── ReportingPage.tsx
├── drizzle/
│   ├── schema.ts                # Single source of truth for all DB tables
│   ├── relations.ts
│   └── migrations/              # Auto-generated SQL migrations
├── server/
│   ├── _core/                   # Framework plumbing (OAuth, tRPC context, LLM, maps, storage, …)
│   ├── routers/                 # tRPC routers split by domain
│   │   ├── customers.ts
│   │   ├── opportunities.ts
│   │   ├── estimate.ts
│   │   ├── portal.ts            # All client-portal procedures (magic-link, estimates, invoices, messages, service requests)
│   │   ├── inbox.ts
│   │   ├── booking.ts
│   │   ├── payments.ts
│   │   ├── reporting.ts
│   │   └── …
│   ├── db.ts                    # Query helpers (CRM side)
│   ├── portalDb.ts              # Query helpers (portal side)
│   └── routers.ts               # Root router — merges all sub-routers
├── shared/
│   ├── const.ts
│   └── types.ts
└── vitest.config.ts
```

---

## Key Features

### Pro App (`pro.handypioneers.com`)

**Customer CRM** — full profile with tabs for Profile, Leads, Estimates, Jobs, Invoices, Communication, Attachments, Notes, and Portal. Inline editing, address autocomplete, map preview, lifetime-value badge.

**Pipeline** — Kanban board (drag-and-drop with touch support) and table view across all stages: Lead → Estimate → Job → Invoiced → Won/Lost. Stage transitions trigger automatic invoice and schedule-event generation.

**Field Estimator** — multi-phase calculator enforcing a minimum 30 % gross margin (40 % on jobs under $2,000 hard cost). Material catalog with Good/Better/Best tiers, dimension options, and Portland-metro labor rates. Customer-facing presentation mode with column-visibility controls and adopt-signature (type-to-sign) support.

**Scheduling** — month/week/day/agenda views, color-coded by event type, drag-to-reschedule, recurrence support, and auto-generated events when estimates or jobs are created.

**Inbox** — unified hub for SMS (Twilio), Gmail threads, call logs, and client-portal messages. Mobile-first three-panel layout (home → list → thread). Portal filter shows all customer portal conversations with HP-team reply capability.

**Payments** — Stripe card element and PayPal in-page approval. Deposit (configurable %) and balance invoices auto-generated on estimate approval. Stripe webhook updates invoice status. Clark County WA tax rates built in.

**Reporting** — revenue overview, pipeline funnel, collection rate, and activity feed.

### Client Portal (`client.handypioneers.com`)

Customers access the portal via a magic-link email (no password required). Once authenticated they can:

- View their profile and edit contact details
- Browse all estimates with status badges and approve/decline
- View invoices, check balance due, and pay online (Stripe/PayPal)
- Download signed documents and attachments
- Send messages to the HP team (visible in the pro-side inbox)
- Submit a service request / booking (creates a lead in the pipeline)
- View upcoming appointments and job history

### Online Booking (`/book`)

Public-facing multi-step form: zip-code service-area check → request details + photos → contact info → confirmation. New submissions auto-create a customer record and a lead in the pipeline with a new-lead notification badge.

---

## Database Schema

The Drizzle schema (`drizzle/schema.ts`) defines the following primary tables:

| Table | Purpose |
|---|---|
| `users` | Pro-side authenticated users (HP staff) |
| `customers` | CRM customer records |
| `customerAddresses` | Multiple addresses per customer |
| `opportunities` | Leads, estimates, and jobs (polymorphic via `area` field) |
| `snapshotOpportunities` | Persisted estimate/job snapshots (phases, line items, totals) |
| `snapshotInvoices` | Invoice records linked to jobs |
| `portalCustomers` | Portal account per customer (email + HP customer link) |
| `portalSessions` | Magic-link session tokens |
| `portalEstimates` | Estimates pushed to the portal |
| `portalInvoices` | Invoices pushed to the portal |
| `portalMessages` | Bidirectional customer ↔ HP team messages |
| `portalServiceRequests` | Booking requests submitted via the portal |
| `portalAppointments` | Appointments visible in the portal |
| `portalGallery` | Project photos shared with the customer |
| `portalReferrals` | Referral tracking |
| `conversations` | SMS/email conversation threads |
| `messages` | Individual messages within a conversation |
| `callLogs` | Twilio call records |
| `onlineRequests` | Public booking form submissions |
| `serviceZipCodes` | Service-area zip-code allowlist |
| `adminAllowlist` | Allowed admin email addresses |

---

## Environment Variables

All secrets are injected by Railway at runtime. The following variables are available in server code via `server/_core/env.ts`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Session cookie signing |
| `STRIPE_SECRET_KEY` | Stripe server-side key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe client-side key |
| `PAYPAL_CLIENT_ID` / `PAYPAL_SECRET` | PayPal REST credentials |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio SMS/Voice |
| `TWILIO_PHONE_NUMBER` | Outbound Twilio number |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` | Gmail OAuth |
| `BUILT_IN_FORGE_API_KEY` / `BUILT_IN_FORGE_API_URL` | Optional upstream for LLM / maps / notifications proxy (legacy; services degrade gracefully if unset) |

Do not commit `.env` files. Manage secrets through the Railway project settings panel. See `.env.example` for the full list.

---

## Getting Started

**Prerequisites:** Node.js ≥ 22, pnpm ≥ 9, a running MySQL/TiDB instance, and the environment variables listed above.

```bash
# 1. Clone the repository
git clone <repo-url>
cd hp-field-estimator

# 2. Install dependencies
pnpm install

# 3. Push the database schema
pnpm db:push

# 4. Start the development server
pnpm dev
```

The app starts on `http://localhost:3000`. Vite proxies all `/api` requests to the Express server running on the same port.

---

## Available Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start Express + Vite in watch mode |
| `pnpm build` | Production build (Vite + esbuild) |
| `pnpm start` | Run the production build |
| `pnpm test` | Run all Vitest tests |
| `pnpm db:push` | Generate and apply Drizzle migrations |
| `pnpm format` | Prettier format |
| `pnpm check` | TypeScript type-check |

---

## Testing

Tests live alongside server code in `server/*.test.ts`. Run the full suite with:

```bash
pnpm test
```

The suite currently covers authentication, payments (Stripe/PayPal), Gmail credentials, Twilio API keys, portal procedures, estimator calculation logic, and schedule reducer actions (86 tests across 14 files).

When adding new features, add a corresponding test file following the pattern in `server/auth.logout.test.ts`.

---

## Deployment

This project is hosted on Railway with automatic CI/CD. Pushing to `main` triggers a new build and deploy.

The app is served at:

- **Pro app:** `pro.handypioneers.com`
- **Client portal:** `client.handypioneers.com`

SSL, CDN, and environment injection are handled by Railway. Manage env vars from the Railway project dashboard.

---

*Internal use only — Handy Pioneers LLC*
