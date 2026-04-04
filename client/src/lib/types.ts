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
  // Account metadata
  createdAt: string;            // ISO date
  lifetimeValue: number;        // total $ of approved jobs
  outstandingBalance: number;
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

export type AppSection = 'customer' | 'sales' | 'calculator' | 'estimate' | 'present' | 'customers';

// ── Customer Record (multi-customer list) ─────────────────
export type CustomerType = 'homeowner' | 'business';

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
  // Address
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  addressNotes: string;
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

export interface Opportunity {
  id: string;
  area: PipelineArea;
  stage: OpportunityStage;
  title: string;          // short description of the opportunity
  value: number;          // estimated dollar value
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
