// ============================================================
// HP Field Estimator v3 — Type Definitions
// ============================================================

export type UnitType =
  | 'lf'        // linear feet
  | 'sqft'      // square feet
  | 'unit'      // per unit / each
  | 'hr'        // hours
  | 'opening'   // door/window openings
  | 'load'      // dumpster loads
  | 'patch'     // drywall patches
  | 'step'      // stair steps
  | 'closet'    // closet systems
  | 'fixture'   // plumbing/electrical fixtures
  | 'circuit'   // electrical circuits
  | 'can'       // recessed lights
  | 'door'      // doors
  | 'box'       // cabinet boxes
  | 'window'    // windows
  | 'fan'       // fans
  | 'device';   // electrical devices

export type Tier = 'good' | 'better' | 'best';
export type LaborMode = 'hr' | 'flat';
export type PaintPrep = 'none' | 'caulk' | 'full';

export interface TierData {
  rate: number;   // $/unit hard cost
  name: string;   // material name shown to customer
  desc: string;   // short description
  photo?: string; // CDN URL for visual sales card
  specs?: string; // e.g. "4mm wear layer · waterproof core"
}

// A selectable dimension/size option for a line item
export interface DimensionOption {
  label: string;   // e.g. "3x6 Subway", "12x24", "2.25\" plank"
  value: string;   // machine key, e.g. "3x6", "12x24"
  // Optional rate multiplier relative to base tier rate (1.0 = same)
  rateMultiplier?: number;
  // Optional absolute rate override (overrides tier rate entirely)
  rateOverride?: number;
  // Optional note shown in UI
  note?: string;
}

export interface LineItem {
  id: string;
  name: string;
  shortName: string;       // for SOW bullets
  unitType: UnitType;
  qty: number;
  wastePct: number;
  hasTiers: boolean;       // false = labor-only items
  tier: Tier;
  tiers: { good: TierData; better: TierData; best: TierData };
  laborMode: LaborMode;
  laborRate: number;
  hrsPerUnit: number;      // when laborMode = 'hr'
  flatRatePerUnit: number; // when laborMode = 'flat'
  hasPaintPrep: boolean;
  paintPrep: PaintPrep;
  paintRate: number;
  flagged: boolean;        // requires licensed sub — excluded from GM calc
  flagNote: string;        // e.g. "Licensed plumber required"
  enabled: boolean;
  notes: string;
  salesDesc: string;       // customer-facing description
  sowTemplate: string;     // template for SOW bullet
  salesSelected: boolean;  // tier chosen in Sales View
  // v3: per-item markup override (null = use global)
  markupPct: number | null;
  // v4: dimension/size options
  dimensionOptions?: DimensionOption[];  // available sizes/dimensions
  selectedDimension?: string;            // currently selected dimension value
}

// AI cost analysis result for custom items
export interface AiCostAnalysis {
  loading: boolean;
  lowEstimate: number;
  highEstimate: number;
  notes: string;
  timestamp: number;
}

// Custom line item added by estimator outside normal scope
export interface CustomLineItem {
  id: string;
  phaseId: number;
  description: string;     // customer-facing description
  unitType: UnitType;
  qty: number;
  matCostPerUnit: number;  // hard cost $/unit
  laborHrsPerUnit: number;
  laborRate: number;
  notes: string;
  // v3: per-item markup override (null = use global)
  markupPct: number | null;
  // v3: AI analysis result
  aiAnalysis?: AiCostAnalysis;
}

// Editable estimate line item override (for Estimate stage customization)
export interface EstimateLineOverride {
  itemId: string;          // matches LineItem.id or CustomLineItem.id
  customDescription?: string;  // override the auto-generated SOW line
  priceOverride?: number;      // override the calculated price
  hidden: boolean;             // hide from customer estimate
}

export interface PhaseGroup {
  id: number;
  name: string;
  icon: string;
  description: string;   // customer-facing phase description for estimate
  items: LineItem[];
}

// ── Customer Profile (extended) ──────────────────────────
export type LeadSource =
  | 'Google'
  | 'Referral'
  | 'Facebook'
  | 'Instagram'
  | 'Nextdoor'
  | 'Yelp'
  | 'Direct Mail'
  | 'Repeat Customer'
  | 'Other';

export interface CustomerProfile {
  // Communication preferences
  notificationsEnabled: boolean;
  smsConsent: boolean;          // text message consent
  smsMarketingConsent: boolean; // text message marketing
  emailMarketingConsent: boolean;
  // Payment
  paymentMethodOnFile: boolean;
  paymentMethodLast4: string;   // last 4 digits if card on file
  // Tags
  tags: string[];               // e.g. ['VIP', 'Repeat', 'Commercial']
  // Lead source
  leadSource: LeadSource | '';
  // Portal
  portalInviteSent: boolean;
  portalInvitedAt: string | null;
  // Private notes
  privateNotes: string;
  // Tax
  defaultTaxCode?: string;   // e.g. '0603' for Vancouver WA 8.9%
  // Account metadata
  createdAt: string;            // ISO date
  lifetimeValue: number;        // total $ of approved jobs
  outstandingBalance: number;
}

// ── Job Task ────────────────────────────────────────────────
export type JobTaskPriority = 'low' | 'normal' | 'high';

export interface JobTask {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string;   // ISO
  assignedTo?: string;
  dueDate?: string;       // ISO date
  priority: JobTaskPriority;
  createdAt: string;      // ISO
}

// ── Job Attachment ───────────────────────────────────────────
export interface JobAttachment {
  id: string;
  name: string;           // display filename
  url: string;            // S3 CDN URL
  mimeType: string;
  size: number;           // bytes
  uploadedAt: string;     // ISO
  uploadedBy?: string;
}

export interface ActivityEvent {
  id: string;
  type: 'estimate_created' | 'estimate_sent' | 'estimate_approved' | 'job_created' | 'note_added' | 'call_logged' | 'payment_received' | 'stage_changed';
  title: string;
  description: string;
  timestamp: string;  // ISO
  linkedId?: string;  // estimate/job ID
}

export type CustomerProfileTab = 'profile' | 'leads' | 'estimates' | 'jobs' | 'invoices' | 'communication' | 'attachments' | 'notes';

export interface JobInfo {
  client: string;
  companyName: string;   // customer company name (optional)
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  date: string;          // estimate created date
  expiresDate: string;   // estimate expiry date
  servicedDate: string;  // scheduled service date
  jobType: string;
  estimator: string;     // comma-separated technician names
  jobNumber: string;
  scope: string;
}

export interface GlobalSettings {
  markupPct: number;
  laborRate: number;
  paintRate: number;
}

export type AppSection = 'customer' | 'sales' | 'calculator' | 'estimate' | 'present' | 'customers' | 'jobs' | 'job-details' | 'pipeline' | 'invoice' | 'dashboard' | 'schedule' | 'inbox' | 'reporting' | 'marketing';

// ── Schedule / Calendar Types ──────────────────────────────────

export type ScheduleEventType = 'estimate' | 'job' | 'recurring' | 'task' | 'follow_up';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;           // every N frequency units
  endDate?: string;           // ISO — stop recurring after this date
  occurrences?: number;       // or stop after N occurrences
  daysOfWeek?: number[];      // 0=Sun … 6=Sat, for weekly
}

export interface ScheduleEvent {
  id: string;
  type: ScheduleEventType;
  title: string;
  start: string;              // ISO datetime
  end: string;                // ISO datetime
  allDay?: boolean;
  // Links
  opportunityId?: string;     // linked opportunity
  customerId?: string;        // linked customer
  // People
  assignedTo: string[];       // crew member names
  // Content
  notes: string;
  color?: string;             // hex override
  // Recurrence
  recurrence?: RecurrenceRule;
  parentEventId?: string;     // if this is a recurring instance
  // Status
  completed: boolean;
  completedAt?: string;       // ISO
  // Metadata
  createdAt: string;          // ISO
  updatedAt: string;          // ISO
}

// ── Invoice / Payment Types ──────────────────────────────────

export type InvoiceType = 'deposit' | 'final';
export type InvoiceStatus = 'draft' | 'sent' | 'due' | 'paid' | 'void' | 'partial' | 'pending_signoff';
export type PaymentMethod = 'stripe' | 'paypal' | 'cash' | 'check' | 'zelle' | 'venmo' | 'other';

export interface PaymentRecord {
  id: string;
  method: PaymentMethod;
  amount: number;
  paidAt: string;          // ISO
  reference: string;       // Stripe PaymentIntent ID, PayPal order ID, or manual note
  note: string;
}

export interface Invoice {
  id: string;
  type: InvoiceType;
  status: InvoiceStatus;
  invoiceNumber: string;   // e.g. "INV-2024-001"
  // Linked entities
  customerId: string;
  opportunityId: string;   // the job opportunity
  sourceEstimateId?: string; // the approved estimate that triggered this
  // Amounts
  subtotal: number;        // pre-tax
  taxRate: number;         // e.g. 0.085 for 8.5%
  taxAmount: number;
  total: number;           // subtotal + taxAmount
  depositPercent?: number; // e.g. 50 for 50% deposit
  // Dates
  issuedAt: string;        // ISO
  dueDate: string;         // ISO
  paidAt?: string;         // ISO, set when fully paid
  serviceDate?: string;    // ISO, date work was performed
  // Payments
  payments: PaymentRecord[];
  amountPaid: number;      // sum of payments
  balance: number;         // total - amountPaid
  // Content
  lineItems: InvoiceLineItem[];
  notes: string;           // customer-visible notes
  internalNotes: string;   // internal only
  paymentTerms?: string;   // e.g. 'Upon receipt', 'Net 30'
  taxLabel?: string;       // e.g. 'Vancouver (8.9%)'
  // Stripe / PayPal
  stripePaymentIntentId?: string;
  stripeClientSecret?: string;
  paypalOrderId?: string;
  // Job completion sign-off
  completionSignature?: string;   // base64 PNG of customer e-signature
  completionSignedBy?: string;    // name of signer
  completionSignedAt?: string;    // ISO timestamp
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
  notes?: string;          // additional description/scope text
}

// ── Customer Record (multi-customer list) ─────────────────
export type CustomerType = 'homeowner' | 'business';

export interface CustomerAddress {
  id: string;
  label: string;          // e.g. 'Home', 'Rental Property', 'Office'
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  isPrimary: boolean;
  lat?: number;
  lng?: number;
}

export interface Customer {
  id: string;
  // Contact
  firstName: string;
  lastName: string;
  displayName: string;        // shown on invoices
  company: string;
  mobilePhone: string;
  homePhone: string;
  workPhone: string;
  email: string;
  role: string;               // e.g. Property Manager
  customerType: CustomerType;
  doNotService: boolean;
  // Address (legacy flat fields — kept for backward compat)
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  addressNotes: string;
  // Multi-address list (primary address mirrors street/city/state/zip)
  addresses?: CustomerAddress[];
  // Notes
  customerNotes: string;
  billsTo: string;            // billing contact name
  tags: string[];
  leadSource: LeadSource | '';
  referredBy: string;
  // Preferences
  sendNotifications: boolean;
  sendMarketingOptIn: boolean;
  // Metadata
  createdAt: string;          // ISO
  lifetimeValue: number;
  outstandingBalance: number;
  // Linked profile data (populated when customer is opened)
  profile?: CustomerProfile;
  activityFeed?: ActivityEvent[];
  opportunities?: Opportunity[];
  invoices?: Invoice[];
  // Customer-level file attachments (photos, contracts, etc.)
  attachments?: JobAttachment[];
  // Default tax code for this customer (e.g. '0603' for Vancouver WA 8.9%)
  defaultTaxCode?: string;
}

export interface EstimatorState {
  activeSection: AppSection;
  jobInfo: JobInfo;
  global: GlobalSettings;
  phases: PhaseGroup[];
  customItems: CustomLineItem[];
  fieldNotes: string;
  summaryNotes: string;
  estimatorNotes: string;
  // v3 additions
  clientNote: string;                          // client-facing note on estimate
  estimateOverrides: EstimateLineOverride[];   // per-item estimate customizations
  signature: string | null;                    // base64 PNG of e-signature
  signedAt: string | null;                     // ISO timestamp of signature
  signedBy: string | null;                     // name of signer
  // CRM pipeline
  opportunities: Opportunity[];
  activePipelineArea: PipelineArea;
  // Customer profile
  customerProfile: CustomerProfile;
  activityFeed: ActivityEvent[];
  activeCustomerTab: CustomerProfileTab;
  // Active opportunity (null = viewing customer profile; set = inside estimate builder)
  activeOpportunityId: string | null;
  // Multi-customer list
  customers: Customer[];
  activeCustomerId: string | null;  // which customer is currently open
  // Invoices (working set for active customer)
  invoices: Invoice[];
  // Invoice counter for sequential numbering
  invoiceCounter: number;
  // Schedule events (global across all customers)
  scheduleEvents: ScheduleEvent[];
  scheduleCounter: number;
  // Deposit configuration
  depositType: 'pct' | 'flat';  // 'pct' = percentage of total, 'flat' = fixed dollar amount
  depositValue: number;          // percent (0-100) when pct, dollar amount when flat
  // Schedule deep-link: when set, SchedulePage pre-filters to this opportunityId
  scheduleFilterJobId: string | null;
  // Current user profile (persisted locally)
  userProfile: UserProfile;
  // Custom roles & permissions
  customRoles: CustomRole[];
}

// ── Custom Roles & Permissions ─────────────────────────────
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'manage';
export type PermissionModule =
  | 'customers' | 'leads' | 'estimates' | 'jobs' | 'invoices'
  | 'pipeline' | 'schedule' | 'reports' | 'marketing'
  | 'settings' | 'team' | 'priceBook';

export type RolePermissions = Partial<Record<PermissionModule, Partial<Record<PermissionAction, boolean>>>>;

export interface CustomRole {
  id: string;
  name: string;
  description: string;
  color: string;          // hex color for role badge
  isSystem: boolean;      // true = cannot be deleted or permission-edited
  permissions: RolePermissions;
}

// ── User Profile ────────────────────────────────────────────
export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  teamColor: string;   // hex color for avatar background
  avatarUrl: string | null;
  role: string;        // e.g. 'Owner', 'Estimator', 'Field Tech'
  bio: string;
}

// ── CRM Pipeline Types ──────────────────────────────────────

export type PipelineArea = 'lead' | 'estimate' | 'job';

export type LeadStage =
  | 'New Lead'
  | 'Return Call Needed'
  | 'First Contact'
  | 'Second Contact'
  | 'Third Contact'
  | 'On Hold'
  | 'Won'
  | 'Lost';

export type EstimateStage =
  | 'Unscheduled'
  | 'Scheduled'
  | 'Return Call Needed'
  | 'In Progress'
  | 'Completed'
  | 'Draft'
  | 'Ready to Send'
  | 'Created on Job'
  | 'Sent'
  | 'Verbal Acceptance'
  | 'Approved'
  | 'Rejected'
  | 'On Hold';

export type JobStage =
  | 'New Job'
  | 'Deposit Needed'
  | 'Deposit Collected'
  | 'Need to Order Materials'
  | 'Waiting on Materials'
  | 'Materials Received'
  | 'Unscheduled'
  | 'Scheduled'
  | 'In Progress'
  | 'Completed'
  | 'Invoice Sent'
  | 'Invoice Paid';

export type OpportunityStage = LeadStage | EstimateStage | JobStage;

// Per-opportunity snapshot of all calculator/estimate data
export interface EstimateSnapshot {
  jobInfo: JobInfo;
  global: GlobalSettings;
  phases: PhaseGroup[];
  customItems: CustomLineItem[];
  fieldNotes: string;
  summaryNotes: string;
  estimatorNotes: string;
  clientNote: string;
  estimateOverrides: EstimateLineOverride[];
  signature: string | null;
  signedAt: string | null;
  signedBy: string | null;
  depositType: 'pct' | 'flat';
  depositValue: number;
}

export interface Opportunity {
  id: string;
  area: PipelineArea;
  stage: OpportunityStage;
  title: string;          // short description of the opportunity
  value: number;          // estimated dollar value
  jobNumber?: string;     // e.g. "JOB-2026-001", set when converted to a job
  createdAt: string;      // ISO date string
  updatedAt: string;
  notes: string;
  // Lifecycle tracking
  sourceLeadId?: string;    // ID of the lead this was converted from
  sourceEstimateId?: string; // ID of the estimate this job was converted from
  convertedToEstimateAt?: string;  // ISO timestamp
  convertedToJobAt?: string;       // ISO timestamp
  archived: boolean;               // moved to archive after Invoice Paid
  archivedAt?: string;             // ISO timestamp
  // Approval / Won tracking
  wonAt?: string;                  // ISO timestamp when estimate was signed/approved
  signedEstimateDataUrl?: string;  // base64 PNG snapshot of the signed estimate document
  signedEstimateFilename?: string; // e.g. "Estimate-HP-2026-042-Signed-2026-04-06.png"
  // Schedule fields
  scheduledDate?: string;          // ISO — start of scheduled window
  scheduledEndDate?: string;       // ISO — end of scheduled window
  scheduledDuration?: number;      // minutes
  assignedTo?: string;             // comma-separated crew names
  scheduleNotes?: string;
  // SOW document generated on estimate approval
  sowDocument?: string;          // full plain-text SOW generated from approved estimate
  sowGeneratedAt?: string;       // ISO timestamp
  // Job completion sign-off
  completionSignature?: string;  // base64 PNG of customer e-signature on job completion
  completionSignedBy?: string;   // name of signer
  completionSignedAt?: string;   // ISO timestamp
  // Signed estimate attached to job
  jobSignedEstimateDataUrl?: string;   // copy of signed estimate on the job record
  jobSignedEstimateFilename?: string;
  // Per-opportunity calculator/estimate data snapshot
  estimateSnapshot?: EstimateSnapshot;
  // Job tasks checklist
  tasks?: JobTask[];
  // Job attachments
  attachments?: JobAttachment[];
  // Per-job activity feed
  jobActivity?: ActivityEvent[];
  // Snapshot of customer info at time of conversion
  clientSnapshot?: {
    client: string;
    companyName: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    jobType: string;
    scope: string;
  };
}

export const LEAD_STAGES: LeadStage[] = [
  'New Lead', 'Return Call Needed', 'First Contact', 'Second Contact',
  'Third Contact', 'On Hold', 'Won', 'Lost',
];

export const ESTIMATE_STAGES: EstimateStage[] = [
  'Unscheduled', 'Scheduled', 'Return Call Needed', 'In Progress',
  'Completed', 'Draft', 'Ready to Send', 'Created on Job',
  'Sent', 'Verbal Acceptance', 'Approved', 'Rejected', 'On Hold',
];

export const JOB_STAGES: JobStage[] = [
  'New Job', 'Deposit Needed', 'Deposit Collected', 'Need to Order Materials',
  'Waiting on Materials', 'Materials Received', 'Unscheduled', 'Scheduled',
  'In Progress', 'Completed', 'Invoice Sent', 'Invoice Paid',
];

export const JOB_TYPES = [
  'Full residential remodel',
  'Kitchen remodel',
  'Bathroom remodel',
  'Interior remodel',
  'Exterior project',
  'Interior + Exterior',
  'Trim / finish carpentry only',
  'Flooring only',
  'Painting only',
  'Punch list / misc',
];

export const UNIT_LABELS: Record<UnitType, string> = {
  lf: 'lf',
  sqft: 'sq ft',
  unit: 'unit',
  hr: 'hr',
  opening: 'opening',
  load: 'load',
  patch: 'patch',
  step: 'step',
  closet: 'closet',
  fixture: 'fixture',
  circuit: 'circuit',
  can: 'can',
  door: 'door',
  box: 'box',
  window: 'window',
  fan: 'fan',
  device: 'device',
};
