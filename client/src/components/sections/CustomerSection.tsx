// CustomerSection — HouseCall Pro-style Customer Profile
// Design: HP Industrial — dark slate, amber accents, DM Sans
//
// Layout:
//   Header: Customer name, Call button, Add Card button, Lifetime Value badge
//   Top nav tabs: Overview | Properties | Opportunities | Membership | Billing | Portal
//   Profile tab:
//     Left sidebar (1/3): Summary, Contact Info, Payment Method,
//                         Communication Prefs, Tags, Lead Source
//     Right main (2/3): Addresses, Private Notes, Activity Feed
//   Leads/Estimates/Jobs tabs: Pipeline tracker with Convert/Archive lifecycle buttons
// ============================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ConvertToEstimateModal, ConvertToJobModal } from '@/components/ConversionModal';
import NewLeadModal from '@/components/intakes/NewLeadModal';
import NewEstimateModal from '@/components/intakes/NewEstimateModal';
import NewJobModal from '@/components/intakes/NewJobModal';
import { trpc } from '@/lib/trpc';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  JOB_TYPES, LEAD_STAGES, ESTIMATE_STAGES, JOB_STAGES,
  PipelineArea, OpportunityStage, LeadStage, EstimateStage, JobStage,
  CustomerProfileTab, LeadSource, LeadNote, JobAttachment, Opportunity,
} from '@/lib/types';
import {
  User, MapPin, Phone, Mail, Calendar, Briefcase, Hash, Building2,
  Plus, Trash2, ChevronDown, ChevronUp, DollarSign, Tag, ArrowRight,
  CreditCard, Bell, MessageSquare, AtSign, Star, Paperclip, FileText,
  Activity, Send, CheckCircle2, XCircle, Clock, PhoneCall, Wallet,
  ExternalLink, Edit3, Save, X, AlertCircle, TrendingUp, Archive,
  RefreshCw, FolderOpen, Download, Wrench, Trophy, FileUp, Camera, CalendarPlus,
  GitMerge, Search, Receipt, ShieldCheck, ChevronRight, Volume2, Voicemail,
  Inbox, ArrowUpRight, ArrowDownLeft, StickyNote,
} from 'lucide-react';
import PropertySelectorGrid from '@/components/PropertySelectorGrid';
import { Badge } from '@/components/ui/badge';
import PipelineBoard from '@/components/PipelineBoard';
import AddressAutocomplete, { ParsedAddress } from '@/components/AddressAutocomplete';
import AddressMapPreview from '@/components/AddressMapPreview';
import InvoiceSection from '@/components/sections/InvoiceSection';
import CustomerExpensesTab from '@/components/CustomerExpensesTab';
import VoiceCallPanel from '@/components/VoiceCallPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import CustomerActivityFeed from '@/components/CustomerActivityFeed';
import ManualMergeFlow from '@/components/ManualMergeFlow';
import { useInboxSSE } from '@/hooks/useInboxSSE';
import DuplicateSuggestionBanner from '@/components/DuplicateSuggestionBanner';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import CustomerMembershipPanel from '@/components/CustomerMembershipPanel';
import ConciergeBrief from '@/components/ConciergeBrief';
import BaselineWalkthroughPanel from '@/components/BaselineWalkthroughPanel';
import { getOpportunityHeat, getWorkflowStep } from '@/components/OpportunityWorkflowPanel';
import {
  THREE_SIXTY_METHOD_PHASES,
  THREE_SIXTY_OPERATOR_LADDER,
  VANCOUVER_PNW_SEASONAL_FOCUS,
  deriveThreeSixtyPropertyBoard,
  deriveThreeSixtyMembershipEnginePlan,
  deriveThreeSixtyOperatingStatus,
  inferOpportunityThreeSixtyStep,
  getCustomerFacingStepAction,
  getThreeSixtyRoleResponsibility,
  type ThreeSixtyOperatorRole,
  type ThreeSixtyPhaseId,
} from '@/lib/threeSixtyMethod';
import {
  bucketRoadmapItems,
  buildRoadmapItemsFromOpportunities,
  formatInvestmentRange,
  roadmapSummary,
  type RoadmapItem,
} from '@/lib/roadmap';
import { stageColor, fmtDollar, fmtDate, fmtRelative } from '@/components/clients/formatters';
import Toggle from '@/components/clients/Toggle';
import ActivityIcon from '@/components/clients/ActivityIcon';
import AddOpportunityForm from '@/components/clients/AddOpportunityForm';
import OpportunityCard from '@/components/clients/OpportunityCard';
import ProfileTab from '@/components/clients/ProfileTab';
import CommunicationTab from '@/components/clients/CommunicationTab';
import CustomerAttachmentsTab from '@/components/clients/CustomerAttachmentsTab';
import CustomerPortalTab from '@/components/clients/CustomerPortalTab';
import ClientUmbrellaContext, { type ClientUmbrellaValue } from '@/components/clients/ClientUmbrellaContext';
import {
  PipelineTab,
  CustomerActionQueuePanel,
  CustomerOpportunityCommandCard,
  CustomerThreeSixtyStatusPanel,
  PropertyThreeSixtyWorkspace,
  roleForOpportunity,
} from '@/components/clients/ClientPanels';
import CustomerOverviewTab from '@/pages/clients/tabs/CustomerOverviewTab';
import CustomerOpportunitiesTab from '@/pages/clients/tabs/CustomerOpportunitiesTab';
import CustomerScheduleTab from '@/pages/clients/tabs/CustomerScheduleTab';
import CustomerRoadmapTab from '@/pages/clients/tabs/CustomerRoadmapTab';
import CustomerWorkflowTab from '@/pages/clients/tabs/CustomerWorkflowTab';
import CustomerMembershipTab from '@/pages/clients/tabs/CustomerMembershipTab';
import CustomerDocumentsTab from '@/pages/clients/tabs/CustomerDocumentsTab';
import CustomerBillingTab from '@/pages/clients/tabs/CustomerBillingTab';
import CustomerHistoryTab from '@/pages/clients/tabs/CustomerHistoryTab';

// ─── Constants ────────────────────────────────────────────────
const LEAD_SOURCES: LeadSource[] = [
  'Google', 'Referral', 'Facebook', 'Instagram', 'Nextdoor',
  'Yelp', 'Direct Mail', 'Repeat Customer', 'Other',
];

const CUSTOMER_OPERATING_TABS: { key: CustomerProfileTab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <User size={13} /> },
  { key: 'properties', label: 'Properties', icon: <Building2 size={13} /> },
  { key: 'opportunities', label: 'Opportunities', icon: <GitMerge size={13} /> },
  { key: 'schedule', label: 'Schedule', icon: <Calendar size={13} /> },
  { key: 'roadmap', label: 'Roadmap', icon: <TrendingUp size={13} /> },
  { key: 'membership', label: 'Membership', icon: <RefreshCw size={13} /> },
  { key: 'billing', label: 'Billing', icon: <Wallet size={13} /> },
  { key: 'portal', label: 'Portal', icon: <ExternalLink size={13} /> },
];

const LEGACY_CUSTOMER_TAB_REDIRECTS: Partial<Record<CustomerProfileTab, CustomerProfileTab>> = {
  profile: 'overview',
  leads: 'opportunities',
  estimates: 'opportunities',
  jobs: 'opportunities',
  workflow: 'opportunities',
  membership360: 'membership',
  invoices: 'billing',
  expenses: 'billing',
  communication: 'overview',
  documents: 'overview',
  attachments: 'overview',
  history: 'overview',
  notes: 'overview',
};

// ─── Pipeline Area Panel ─────────────────────────────────────────
function PipelineAreaPanel({
  area, stages, opportunities, onAdd, onUpdate, onRemove,
  onConvertToEstimate, onConvertToJob, onArchive, onOpen,
}: {
  area: PipelineArea;
  stages: OpportunityStage[];
  opportunities: {
    id: string; area: PipelineArea; stage: OpportunityStage; title: string; value: number;
    notes: string; createdAt: string; updatedAt: string; archived: boolean;
    sourceLeadId?: string; sourceEstimateId?: string;
    convertedToEstimateAt?: string; convertedToJobAt?: string;
  }[];
  onAdd: (title: string, stage: OpportunityStage, value: number, notes: string) => void;
  onUpdate: (id: string, payload: Partial<{ stage: OpportunityStage; title: string; value: number; notes: string }>) => void;
  onRemove: (id: string) => void;
  onConvertToEstimate?: (id: string, title: string, value: number, transferNotes?: LeadNote[], transferAttachments?: JobAttachment[]) => void;
  onConvertToJob?: (id: string, title: string, value: number) => void;
  onArchive?: (id: string, value: number) => void;
  onOpen?: (id: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const activeOpps = opportunities.filter(o => !o.archived);
  const archivedOpps = opportunities.filter(o => o.archived);

  const byStage: Record<string, typeof activeOpps> = {};
  for (const s of stages) byStage[s] = [];
  for (const opp of activeOpps) {
    if (byStage[opp.stage]) byStage[opp.stage].push(opp);
    else byStage[stages[0]].push(opp);
  }
  const totalValue = activeOpps.reduce((s, o) => s + o.value, 0);
  const activeStages = stages.filter(s => byStage[s].length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{activeOpps.length}</strong> active</span>
          {archivedOpps.length > 0 && (
            <span className="text-emerald-700"><strong>{archivedOpps.length}</strong> archived</span>
          )}
          {totalValue > 0 && (
            <span className="flex items-center gap-1">
              <DollarSign size={13} />
              <strong className="text-foreground">{fmtDollar(totalValue)}</strong> pipeline
            </span>
          )}
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          <Plus size={13} /> Add
        </button>
      </div>
      {showAdd && (
        <div className="mb-4">
          <AddOpportunityForm area={area}
            onAdd={(title, stage, value, notes) => { onAdd(title, stage, value, notes); setShowAdd(false); }}
            onCancel={() => setShowAdd(false)} />
        </div>
      )}
      {activeOpps.length === 0 && archivedOpps.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm border-2 border-dashed border-border rounded-xl">
          No {area === 'lead' ? 'leads' : area === 'estimate' ? 'estimates' : 'jobs'} yet. Click "Add" to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {activeStages.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeStages.map(stage => (
                <div key={stage} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stageColor(stage)}`}>
                      {stage}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {byStage[stage].length} · {fmtDollar(byStage[stage].reduce((s, o) => s + o.value, 0))}
                    </span>
                  </div>
                  {byStage[stage].map(opp => (
                    <OpportunityCard
                      key={opp.id}
                      opp={opp}
                      stages={stages}
                      area={area}
                      onUpdate={onUpdate}
                      onRemove={onRemove}
                      onConvertToEstimate={onConvertToEstimate}
                      onConvertToJob={onConvertToJob}
                      onArchive={onArchive}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Archived section */}
          {archivedOpps.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowArchived(s => !s)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <Archive size={12} />
                {showArchived ? 'Hide' : 'Show'} {archivedOpps.length} archived {area === 'job' ? 'job' : area}(s)
                {!showArchived && (
                  <span className="text-emerald-700 font-semibold">
                    · {fmtDollar(archivedOpps.reduce((s, o) => s + o.value, 0))} earned
                  </span>
                )}
              </button>
              {showArchived && (
                <div className="space-y-2 pl-2 border-l-2 border-emerald-200">
                  {archivedOpps.map(opp => (
                    <OpportunityCard
                      key={opp.id}
                      opp={opp}
                      stages={stages}
                      area={area}
                      onUpdate={onUpdate}
                      onRemove={onRemove}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              View all {stages.length} stages
            </summary>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {stages.map(stage => (
                <div key={stage} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border">
                  <span className="text-xs text-foreground truncate">{stage}</span>
                  <span className="text-xs font-semibold text-muted-foreground ml-2 shrink-0">{byStage[stage]?.length ?? 0}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── Stub Merge Dialog ────────────────────────────────────────────────────────────────
interface StubMergeDialogProps {
  stubId: string;
  customers: any[];
  onClose: () => void;
  onMerge: (targetId: string) => void;
  isPending: boolean;
}
function StubMergeDialog({ stubId, customers, onClose, onMerge, isPending }: StubMergeDialogProps) {
  const [query, setQuery] = useState('');
  const realCustomers = customers.filter(c =>
    c.id !== stubId &&
    !(c as any).mergedIntoId &&
    c.leadSource !== 'inbound_call'
  );
  const filtered = realCustomers.filter(c => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (c.displayName ?? '').toLowerCase().includes(q) ||
      (c.firstName ?? '').toLowerCase().includes(q) ||
      (c.lastName ?? '').toLowerCase().includes(q) ||
      (c.mobilePhone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  }).slice(0, 40);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-semibold text-foreground">Merge into existing customer</p>
            <p className="text-xs text-muted-foreground mt-0.5">All calls and messages will move to the selected profile.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b border-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, phone, or email…"
              className="field-input w-full pl-8"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-border">
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">No matching customers found</div>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => onMerge(c.id)}
              disabled={isPending}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User size={14} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.displayName || c.company || 'Unknown'}
                </p>
                <p className="text-xs text-muted-foreground truncate">{c.mobilePhone || c.email || ''}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border">
          <button onClick={onClose} className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main CustomerSection ────────────────────────────────────────────────────────────────
export default function CustomerSection() {
  const {
    state, setJobInfo, setCustomerProfile, addActivityEvent, setCustomerTab,
    addOpportunity, updateOpportunity, removeOpportunity, setPipelineArea,
    convertLeadToEstimate, convertEstimateToJob, archiveJob,
    setActiveOpportunity, setSection, setInboxCustomer, setInboxConversation,
    addCustomerAddress, updateCustomerAddress, removeCustomerAddress, setPrimaryAddress, setBillingAddress,
    updateCustomer: updateCustomerLocal,
    removeCustomer,
    mergeCustomerOpportunities,
  } = useEstimator();
  const { jobInfo, customerProfile, activityFeed, activeCustomerTab, opportunities, activePipelineArea, activeCustomerId, customers } = state;
  const activeCustomer = customers.find(c => c.id === activeCustomerId);
  const [location, navigate] = useLocation();

  const [newTag, setNewTag] = useState('');
  const [editingContact, setEditingContact] = useState(false);
  // Intake modal state — opened from PipelineTab Add button
  const [intakeModal, setIntakeModal] = useState<'lead' | 'estimate' | 'job' | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState<{ area: 'lead' | 'estimate' | 'job'; existing: string } | null>(null);
  // Local draft for contact info — prevents global dispatch on every keystroke
  const [contactDraft, setContactDraft] = useState<{
    client: string; companyName: string; phone: string; email: string;
    additionalPhones: { label: string; number: string }[];
    additionalEmails: { label: string; address: string }[];
  }>({ client: '', companyName: '', phone: '', email: '', additionalPhones: [], additionalEmails: [] });
  // Sync draft from global state when entering edit mode
  useEffect(() => {
    if (editingContact) {
      const safeParseArr = (v: unknown) => { try { const r = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(r) ? r : []; } catch { return []; } };
      setContactDraft({
        client: jobInfo.client, companyName: jobInfo.companyName, phone: jobInfo.phone, email: jobInfo.email,
        additionalPhones: safeParseArr((activeCustomer as any)?.additionalPhones),
        additionalEmails: safeParseArr((activeCustomer as any)?.additionalEmails),
      });
    }
  }, [editingContact]); // eslint-disable-line react-hooks/exhaustive-deps
  // Local draft for Job Details text fields — flush to global onBlur to avoid keystroke dispatches
  const [jobDetailsDraft, setJobDetailsDraft] = useState({ estimator: '', jobNumber: '', scope: '' });
  // Sync job details draft whenever the active opportunity changes or jobInfo changes externally
  const prevOpportunityId = useRef(state.activeOpportunityId);
  useEffect(() => {
    if (state.activeOpportunityId !== prevOpportunityId.current || !editingContact) {
      prevOpportunityId.current = state.activeOpportunityId;
      setJobDetailsDraft({ estimator: jobInfo.estimator, jobNumber: jobInfo.jobNumber, scope: jobInfo.scope });
    }
  }, [state.activeOpportunityId, jobInfo.estimator, jobInfo.jobNumber, jobInfo.scope, editingContact]); // eslint-disable-line react-hooks/exhaustive-deps
  const [newNote, setNewNote] = useState('');
  // Multi-address state
  const [addingAddress, setAddingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addrForm, setAddrForm] = useState({ label: 'Home', street: '', unit: '', city: 'Vancouver', state: 'WA', zip: '', lat: undefined as number | undefined, lng: undefined as number | undefined, propertyNotes: '' });
  const [addrLatLng, setAddrLatLng] = useState<{ lat?: number; lng?: number }>({}); // for map preview in form
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedPropertyPhase, setSelectedPropertyPhase] = useState<ThreeSixtyPhaseId>('aware');
  // Merge dialog state
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  // Stub merge dialog state (for unknown-caller auto-created customers)
  const [showStubMergeDialog, setShowStubMergeDialog] = useState(false);
  // Quick-action bar state
  const [showCallPanel, setShowCallPanel] = useState(false);
  const [quickAction, setQuickAction] = useState<'sms' | 'email' | 'note' | null>(null);
  const [quickActionBody, setQuickActionBody] = useState('');
  const [quickActionSubject, setQuickActionSubject] = useState('');
  const [quickActionSending, setQuickActionSending] = useState(false);
  const mergeStubMutation = trpc.customers.mergeStub.useMutation({
    onSuccess: (_data, vars) => {
      removeCustomer(vars.stubId);
      setShowStubMergeDialog(false);
      toast.success('Caller linked to customer profile');
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Derived ──
  // Prefer the customer record's name fields so DB-synced customers always show
  // the correct name, even when jobInfo.client hasn't been populated yet.
  const customerFullName = activeCustomer
    ? ([activeCustomer.firstName, activeCustomer.lastName].filter(Boolean).join(' ') ||
       activeCustomer.displayName ||
       activeCustomer.company ||
       '')
    : '';
  const displayName = customerFullName || jobInfo.client || 'New Customer';
  const currentCustomerTab = LEGACY_CUSTOMER_TAB_REDIRECTS[activeCustomerTab] ?? activeCustomerTab;
  useEffect(() => {
    const redirected = LEGACY_CUSTOMER_TAB_REDIRECTS[activeCustomerTab];
    if (redirected) setCustomerTab(redirected);
  }, [activeCustomerTab, setCustomerTab]);
  const areaMap: Record<CustomerProfileTab, PipelineArea | null> = {
    overview: null, opportunities: null, schedule: null, roadmap: null, workflow: null, membership: null, documents: null, billing: null, history: null,
    profile: null, properties: null, leads: 'lead', estimates: 'estimate', jobs: 'job',
    invoices: null, expenses: null, communication: null, attachments: null, notes: null, portal: null,
    membership360: null,
  };

  const handleTabClick = (tab: CustomerProfileTab) => {
    const nextTab = LEGACY_CUSTOMER_TAB_REDIRECTS[tab] ?? tab;
    setCustomerTab(nextTab);
    const area = areaMap[nextTab];
    if (area) setPipelineArea(area);
    // When viewed through the deep-linkable client route, keep the tab in the URL
    // so a refresh / back-button lands on the same tab. The inline "/" flow is
    // left untouched (no navigation there).
    if (location.startsWith('/admin/clients/') && activeCustomerId) {
      navigate(`/admin/clients/${activeCustomerId}/${nextTab}`);
    }
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t) return;
    if (customerProfile.tags.includes(t)) { toast.error('Tag already added'); return; }
    setCustomerProfile({ tags: [...customerProfile.tags, t] });
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    setCustomerProfile({ tags: customerProfile.tags.filter(t => t !== tag) });
  };

  // ── 360° latest scan (for health score badge in header) ──
  const { data: latestScan } = trpc.threeSixty.scansLatest.getLatestByCustomer.useQuery(
    { customerId: activeCustomerId! },
    { enabled: !!activeCustomerId }
  );

  // ── Unified feed (server-backed, replaces local activityFeed) ────────────
  const utils = trpc.useUtils();
  const { data: unifiedFeedData, isLoading: feedLoading } = trpc.inbox.unifiedFeed.getByCustomer.useQuery(
    { customerId: activeCustomerId! },
    { enabled: !!activeCustomerId, staleTime: 30_000 }
  );
  const unifiedFeed = unifiedFeedData?.feed ?? [];
  const feedConversationId = unifiedFeedData?.conversationId ?? null;
  const feedContactPhone = unifiedFeedData?.contactPhone ?? null;
  const feedContactEmail = unifiedFeedData?.contactEmail ?? null;
  // Unread count for the badge in the profile header
  const unreadBadgeCount = unifiedFeedData?.unreadCount ?? 0;
  const { data: customerContext, isLoading: customerContextLoading } = trpc.customers.getFullContext.useQuery(
    { id: activeCustomerId! },
    { enabled: !!activeCustomerId, staleTime: 30_000 }
  );
  const launchGaps = (customerContext?.opportunitySummaries ?? []).filter((summary: any) =>
    summary.opportunity.area !== 'lead' &&
    !summary.portalEstimate &&
    summary.portalInvoices.length === 0 &&
    summary.messages.length === 0
  );

  // Auto-refresh unified feed on SSE new_message events
  useInboxSSE({
    onNewMessage: () => {
      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
    },
    onPortalMessage: () => {
      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
    },
  });

  // ── Quick-action mutations ────────────────────────────────────────────────
  const findOrCreateConvMutation = trpc.inbox.conversations.findOrCreateByCustomer.useMutation();
  const sendMessageMutation = trpc.inbox.messages.send.useMutation({
    onSuccess: () => {
      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
      setQuickAction(null);
      setQuickActionBody('');
      setQuickActionSubject('');
      setQuickActionSending(false);
      toast.success('Message sent');
    },
    onError: (err) => { setQuickActionSending(false); toast.error(err.message); },
  });
  const sendSmsMutation = trpc.inbox.twilio.sendSms.useMutation({
    onSuccess: () => {
      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
      setQuickAction(null);
      setQuickActionBody('');
      setQuickActionSending(false);
      toast.success('SMS sent');
    },
    onError: (err) => { setQuickActionSending(false); toast.error(err.message); },
  });
  const sendEmailMutation = trpc.gmail.sendEmail.useMutation({
    onSuccess: () => {
      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
      setQuickAction(null);
      setQuickActionBody('');
      setQuickActionSubject('');
      setQuickActionSending(false);
      toast.success('Email sent');
    },
    onError: (err) => { setQuickActionSending(false); toast.error(err.message); },
  });

  const handleQuickSend = async () => {
    if (!quickAction || !quickActionBody.trim()) return;
    if (!activeCustomerId) { toast.error('No active customer'); return; }
    setQuickActionSending(true);
    try {
      // Ensure we have a conversation to post into
      const phone = activeCustomer?.mobilePhone ?? jobInfo.phone;
      const email = activeCustomer?.email ?? jobInfo.email;
      const name = customerFullName || jobInfo.client;
      let convId = feedConversationId;
      if (!convId) {
        const result = await findOrCreateConvMutation.mutateAsync({
          customerId: activeCustomerId,
          phone: phone || undefined,
          email: email || undefined,
          name: name || undefined,
          channel: quickAction === 'email' ? 'email' : quickAction === 'sms' ? 'sms' : 'note',
        });
        convId = result.conversationId;
      }
      if (!convId) { toast.error('Could not find or create conversation'); setQuickActionSending(false); return; }

      if (quickAction === 'sms') {
        if (!phone) { toast.error('No phone number on file'); setQuickActionSending(false); return; }
        await sendSmsMutation.mutateAsync({ conversationId: convId, to: phone, body: quickActionBody.trim() });
      } else if (quickAction === 'email') {
        if (!email) { toast.error('No email on file'); setQuickActionSending(false); return; }
        await sendEmailMutation.mutateAsync({ conversationId: convId, to: email, subject: quickActionSubject.trim() || `Message from Handy Pioneers`, body: quickActionBody.trim() });
      } else if (quickAction === 'note') {
        await sendMessageMutation.mutateAsync({ conversationId: convId, channel: 'note', body: quickActionBody.trim(), isInternal: true });
      }
    } catch {
      setQuickActionSending(false);
    }
  };

  // isSilentSaveRef: true = auto-save (no toast), false = manual save (shows toast)
  const isSilentSaveRef = useRef(false);
  const syncToDbMutation = trpc.customers.update.useMutation({
    onSuccess: (updated) => {
      if (updated && activeCustomerId) {
        updateCustomerLocal(activeCustomerId, {
          firstName: updated.firstName,
          lastName: updated.lastName,
          displayName: updated.displayName,
          company: updated.company,
          mobilePhone: updated.mobilePhone,
          homePhone: updated.homePhone,
          workPhone: updated.workPhone,
          email: updated.email,
          street: updated.street,
          unit: updated.unit,
          city: updated.city,
          state: updated.state,
          zip: updated.zip,
          tags: updated.tags ? JSON.parse(updated.tags as unknown as string) : [],
          leadSource: (updated.leadSource ?? '') as any,
          customerNotes: updated.customerNotes ?? '',
          sendNotifications: updated.sendNotifications,
          sendMarketingOptIn: updated.sendMarketingOptIn,
        });
      }
      if (!isSilentSaveRef.current) toast.success('Customer saved');
      isSilentSaveRef.current = false;
    },
    onError: (err) => { isSilentSaveRef.current = false; toast.error(`Save failed: ${err.message}`); },
  });
  const handleSyncToDb = () => {
    if (!activeCustomerId || !activeCustomer) { toast.error('No active customer'); return; }
    isSilentSaveRef.current = false;
    syncToDbMutation.mutate({
      id: activeCustomerId,
      firstName: activeCustomer.firstName || jobInfo.client.split(' ')[0] || '',
      lastName: activeCustomer.lastName || jobInfo.client.split(' ').slice(1).join(' ') || '',
      displayName: activeCustomer.displayName || jobInfo.client || '',
      company: activeCustomer.company || jobInfo.companyName || '',
      mobilePhone: activeCustomer.mobilePhone || jobInfo.phone || '',
      email: activeCustomer.email || jobInfo.email || '',
      street: activeCustomer.street || jobInfo.address || '',
      city: activeCustomer.city || jobInfo.city || '',
      state: activeCustomer.state || jobInfo.state || '',
      zip: activeCustomer.zip || jobInfo.zip || '',
      tags: activeCustomer.tags ?? customerProfile.tags ?? [],
      leadSource: (activeCustomer.leadSource || customerProfile.leadSource || '') as any,
      customerNotes: activeCustomer.customerNotes || '',
      sendNotifications: activeCustomer.sendNotifications ?? customerProfile.notificationsEnabled,
      sendMarketingOptIn: activeCustomer.sendMarketingOptIn ?? customerProfile.emailMarketingConsent,
    });
  };

  // ── Auto-save profile changes to DB (debounced 1.5s) ─────────────────────
  // Watches: tags, leadSource, customerNotes, sendNotifications, sendMarketingOptIn, defaultTaxCode
  // These are the fields that setCustomerProfile updates but don't have their own save button.
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeCustomerId || !activeCustomer) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      isSilentSaveRef.current = true;
      syncToDbMutation.mutate({
        id: activeCustomerId,
        firstName: activeCustomer.firstName || jobInfo.client.split(' ')[0] || '',
        lastName: activeCustomer.lastName || jobInfo.client.split(' ').slice(1).join(' ') || '',
        displayName: activeCustomer.displayName || jobInfo.client || '',
        company: activeCustomer.company || jobInfo.companyName || '',
        mobilePhone: activeCustomer.mobilePhone || jobInfo.phone || '',
        email: activeCustomer.email || jobInfo.email || '',
        street: activeCustomer.street || jobInfo.address || '',
        city: activeCustomer.city || jobInfo.city || '',
        state: activeCustomer.state || jobInfo.state || '',
        zip: activeCustomer.zip || jobInfo.zip || '',
        tags: activeCustomer.tags ?? customerProfile.tags ?? [],
        leadSource: (activeCustomer.leadSource || customerProfile.leadSource || '') as any,
        customerNotes: activeCustomer.customerNotes || customerProfile.privateNotes || '',
        sendNotifications: activeCustomer.sendNotifications ?? customerProfile.notificationsEnabled,
        sendMarketingOptIn: activeCustomer.sendMarketingOptIn ?? customerProfile.emailMarketingConsent,
        defaultTaxCode: customerProfile.defaultTaxCode,
      });
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeCustomerId,
    activeCustomer?.tags,
    activeCustomer?.leadSource,
    activeCustomer?.customerNotes,
    activeCustomer?.sendNotifications,
    activeCustomer?.sendMarketingOptIn,
    customerProfile.tags,
    customerProfile.leadSource,
    customerProfile.privateNotes,
    customerProfile.notificationsEnabled,
    customerProfile.emailMarketingConsent,
    customerProfile.defaultTaxCode,
  ]);
  // ── Address DB mutations ──────────────────────────────────────────────────
  const addAddressMutation = trpc.customers.addAddress.useMutation({
    onError: (err) => toast.error(`Failed to add address: ${err.message}`),
  });
  const updateAddressMutation = trpc.customers.updateAddress.useMutation({
    onError: (err) => toast.error(`Failed to update address: ${err.message}`),
  });
  const removeAddressMutation = trpc.customers.removeAddress.useMutation({
    onError: (err) => toast.error(`Failed to remove address: ${err.message}`),
  });
  const setPrimaryAddressMutation = trpc.customers.setPrimaryAddress.useMutation({
    onError: (err) => toast.error(`Failed to set primary: ${err.message}`),
  });
  const setBillingAddressMutation = trpc.customers.setBillingAddress.useMutation({
    onError: (err) => toast.error(`Failed to set billing: ${err.message}`),
  });
  const createOpportunityMutation = trpc.opportunities.create.useMutation({
    onError: (err) => console.warn('[CustomerSection] DB opportunity create failed (local state preserved):', err.message),
  });

  // Pull fresh opportunities for the active customer on every profile open and
  // merge into local state. The session-level MERGE_DB_CUSTOMERS sync only
  // runs once at login; without this refresh, leads created elsewhere (e.g. on
  // a public booking form) never appear in this profile and the count stays
  // at zero (Marcin's "0 leads despite leads existing" bug, 2026-04-28).
  const liveOppsQuery = trpc.opportunities.list.useQuery(
    { customerId: activeCustomerId ?? '', archived: false, limit: 500 },
    { enabled: !!activeCustomerId, staleTime: 15_000 },
  );
  useEffect(() => {
    if (!activeCustomerId || !liveOppsQuery.data) return;
    const fresh = (liveOppsQuery.data as any[]).map((o) => ({
      id: o.id,
      area: (o.area ?? 'lead') as Opportunity['area'],
      stage: (o.stage ?? 'New Lead') as Opportunity['stage'],
      title: o.title ?? '',
      value: o.value ?? 0,
      jobNumber: o.jobNumber ?? undefined,
      createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : (o.createdAt ?? new Date().toISOString()),
      updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : (o.updatedAt ?? new Date().toISOString()),
      notes: o.notes ?? '',
      archived: !!o.archived,
      archivedAt: o.archivedAt ?? undefined,
      sourceLeadId: o.sourceLeadId ?? undefined,
      sourceEstimateId: o.sourceEstimateId ?? undefined,
      convertedToEstimateAt: o.convertedToEstimateAt ?? undefined,
      convertedToJobAt: o.convertedToJobAt ?? undefined,
      sentAt: o.sentAt ?? undefined,
      wonAt: o.wonAt ?? undefined,
      portalApprovedAt: o.portalApprovedAt ?? undefined,
    })) as Opportunity[];
    mergeCustomerOpportunities(activeCustomerId, fresh);
  }, [activeCustomerId, liveOppsQuery.data, mergeCustomerOpportunities]);

  // Wrapped address helpers that update both context and DB
  const handleAddAddress = (customerId: string, addr: Parameters<typeof addCustomerAddress>[1]) => {
    addCustomerAddress(customerId, addr);
    addAddressMutation.mutate({
      customerId,
      label: addr.label,
      street: addr.street,
      unit: addr.unit ?? '',
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      isPrimary: addr.isPrimary ?? false,
      isBilling: (addr as any).isBilling ?? false,
      propertyNotes: (addr as any).propertyNotes ?? '',
    });
  };
  const handleUpdateAddress = (customerId: string, addrId: string, patch: Parameters<typeof updateCustomerAddress>[2]) => {
    updateCustomerAddress(customerId, addrId, patch);
    updateAddressMutation.mutate({ id: addrId, ...patch } as any);
  };
  const handleRemoveAddress = (customerId: string, addrId: string) => {
    removeCustomerAddress(customerId, addrId);
    removeAddressMutation.mutate({ id: addrId });
  };
  const handleSetPrimary = (customerId: string, addrId: string) => {
    setPrimaryAddress(customerId, addrId);
    setPrimaryAddressMutation.mutate({ customerId, addressId: addrId });
  };
  const handleSetBilling = (customerId: string, addrId: string) => {
    setBillingAddress(customerId, addrId);
    setBillingAddressMutation.mutate({ customerId, addressId: addrId });
  };

  const inviteToPortalMutation = trpc.portal.inviteCustomerToPortal.useMutation({
    onSuccess: () => {
      setCustomerProfile({ portalInviteSent: true, portalInvitedAt: new Date().toISOString() });
      addActivityEvent({ type: 'note_added', title: 'Portal invite sent', description: `Invite sent to ${jobInfo.email}` });
      toast.success('Portal invite sent! Customer will receive a login email.');
    },
    onError: (err) => {
      toast.error(`Failed to send invite: ${err.message}`);
    },
  });

  const sendPortalInvite = () => {
    if (!jobInfo.email) { toast.error('Add an email address first'); return; }
    if (!jobInfo.client) { toast.error('Add a customer name first'); return; }
    inviteToPortalMutation.mutate({
      customerEmail: jobInfo.email,
      customerName: jobInfo.client,
      customerPhone: jobInfo.phone || undefined,
      hpCustomerId: activeCustomerId || undefined,
      origin: window.location.origin,
    });
  };

  const logCall = () => {
    if (!jobInfo.phone) { toast.error('Add a phone number first'); return; }
    addActivityEvent({ type: 'call_logged', title: 'Call logged', description: `Called ${jobInfo.client || 'customer'} at ${jobInfo.phone}` });
    toast.success('Call logged');
  };

  const addNote = () => {
    const n = newNote.trim();
    if (!n) return;
    addActivityEvent({ type: 'note_added', title: 'Note added', description: n });
    setNewNote('');
    toast.success('Note added to activity feed');
  };

  // ── Profile tab content ──

  // ── Pipeline tab content ──
  // Build prefill object from the active customer for intake modals
  const intakePrefill = activeCustomer ? {
    id: activeCustomer.id,
    displayName: customerFullName || activeCustomer.displayName,
    phone: activeCustomer.mobilePhone || activeCustomer.homePhone || activeCustomer.workPhone,
    email: activeCustomer.email,
    address: activeCustomer.street,
    city: activeCustomer.city,
    state: activeCustomer.state,
    zip: activeCustomer.zip,
  } : undefined;


  const activeOpps = opportunities.filter(o => !o.archived);
  const propertyRecords = (() => {
    const properties = (activeCustomer as any)?.properties ?? [];
    if (properties.length > 0) return properties;
    const addresses = (activeCustomer as any)?.addresses ?? [];
    if (addresses.length > 0) return addresses;
    if (activeCustomer?.street || jobInfo.address) {
      return [{
        id: 'primary-property',
        label: 'Primary Home',
        street: activeCustomer?.street || jobInfo.address || '',
        unit: activeCustomer?.unit || '',
        city: activeCustomer?.city || jobInfo.city || '',
        state: activeCustomer?.state || jobInfo.state || '',
        zip: activeCustomer?.zip || jobInfo.zip || '',
        isPrimary: true,
        propertyNotes: activeCustomer?.addressNotes || '',
      }];
    }
    return [];
  })();
  const activeProperty = propertyRecords.find((property: any) => property.id === selectedPropertyId)
    ?? propertyRecords.find((property: any) => property.isPrimary)
    ?? propertyRecords[0]
    ?? null;
  const propertyBoard = deriveThreeSixtyPropertyBoard({
    propertyId: activeProperty?.id ?? null,
    propertyLabel: activeProperty?.label ?? 'Primary property',
    opportunities: activeOpps,
  });
  const threeSixtyStatus = deriveThreeSixtyOperatingStatus({
    memberships: customerContext?.memberships,
    workOrders: customerContext?.workOrders,
    opportunities: activeOpps,
    latestScan,
  });
  const membershipEnginePlan = deriveThreeSixtyMembershipEnginePlan(threeSixtyStatus);
  const hotOpps = activeOpps.filter(o => getOpportunityHeat(o.area, o.stage, o.value, o.updatedAt).level === 'hot');
  const leadOpps = activeOpps.filter(o => o.area === 'lead');
  const estimateOpps = activeOpps.filter(o => o.area === 'estimate');
  const jobOpps = activeOpps.filter(o => o.area === 'job');



  const PlaceholderTab = ({ label }: { label: string }) => (
    <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
      <div className="text-lg font-semibold mb-2">{label}</div>
      <div className="text-sm">This section is coming soon.</div>
    </div>
  );

  // (CommunicationTab and CustomerAttachmentsTab are defined as top-level components below CustomerSection)

  const umbrella: ClientUmbrellaValue = {
    jobInfo, customerProfile, activeCustomer, activeCustomerId,
    activeOpportunityId: state.activeOpportunityId,
    opportunities, customerContext, customerContextLoading, launchGaps,
    contactDraft, setContactDraft, editingContact, setEditingContact,
    jobDetailsDraft, setJobDetailsDraft, newTag, setNewTag,
    addingAddress, setAddingAddress, editingAddressId, setEditingAddressId,
    addrForm, setAddrForm, addrLatLng, setAddrLatLng,
    setQuickAction, setShowCallPanel,
    setJobInfo, setCustomerProfile, setActiveOpportunity, setSection,
    addTag, removeTag, sendPortalInvite,
    handleAddAddress, handleUpdateAddress, handleRemoveAddress, handleSetPrimary, handleSetBilling,
    syncToDbMutation, inviteToPortalMutation,
    activeCustomerTab, areaMap, displayName, customerFullName,
    activeOpps, activeProperty, propertyBoard, threeSixtyStatus, membershipEnginePlan,
    selectedPropertyPhase, setSelectedPropertyPhase,
    addOpportunity, updateOpportunity, removeOpportunity,
    convertLeadToEstimate, convertEstimateToJob, archiveJob,
    createOpportunityMutation, setIntakeModal, setShowDuplicateWarning, handleTabClick,
    hotOpps, leadOpps, estimateOpps, jobOpps, newNote, setNewNote, addNote,
  };

  return (
    <ClientUmbrellaContext.Provider value={umbrella}>
    <>
    <div className="space-y-0">

      {/* ── Customer Header ── */}
      <div className="bg-white border-b border-border px-4 py-4">
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <div className="text-xs text-muted-foreground mb-1">
            Customers / <span className="text-foreground">{displayName}</span>
          </div>
          {/* Name + actions */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{displayName}</h1>
              {/* Unread badge */}
              {unreadBadgeCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none" title={`${unreadBadgeCount} unread message${unreadBadgeCount > 1 ? 's' : ''}`}>
                  {unreadBadgeCount > 99 ? '99+' : unreadBadgeCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* 360° Health Score badge */}
              {latestScan && latestScan.healthScore !== null && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{
                    background: (latestScan.healthScore ?? 0) >= 75 ? '#f0fdf4' : (latestScan.healthScore ?? 0) >= 50 ? '#fffbeb' : '#fef2f2',
                    borderColor: (latestScan.healthScore ?? 0) >= 75 ? '#bbf7d0' : (latestScan.healthScore ?? 0) >= 50 ? '#fde68a' : '#fecaca',
                    color: (latestScan.healthScore ?? 0) >= 75 ? '#166534' : (latestScan.healthScore ?? 0) >= 50 ? '#92400e' : '#991b1b',
                  }}
                  title={`360° Home Health — Last scan: ${latestScan.scanDate ? new Date(latestScan.scanDate).toLocaleDateString() : 'N/A'}`}
                >
                  <Star size={12} />
                  <span>360° {latestScan.healthScore}/100</span>
                </div>
              )}
              {/* Lifetime value badge */}
              {customerProfile.lifetimeValue > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800">
                  <TrendingUp size={13} />
                  <span className="hidden sm:inline">LTV:</span>
                  {fmtDollar(customerProfile.lifetimeValue)}
                </div>
              )}
              {/* Payment method indicator */}
              {customerProfile.paymentMethodOnFile ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
                  <CreditCard size={13} />
                  <span className="hidden sm:inline">Card on file</span>
                </div>
              ) : (
                <button
                  onClick={() => {
                    const last4 = prompt('Enter last 4 digits of card:') ?? '';
                    if (last4) {
                      setCustomerProfile({ paymentMethodOnFile: true, paymentMethodLast4: last4.slice(-4) });
                      toast.success('Payment method saved');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <CreditCard size={13} />
                  <span className="hidden sm:inline">Add card</span>
                </button>
              )}
              {/* Quick-action buttons */}
              <button
                onClick={() => { setQuickAction(q => q === 'sms' ? null : 'sms'); setShowCallPanel(false); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  quickAction === 'sms' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                }`}
                title="Send SMS"
              >
                <MessageSquare size={13} />
                <span className="hidden sm:inline">SMS</span>
              </button>
              <button
                onClick={() => { setQuickAction(q => q === 'email' ? null : 'email'); setShowCallPanel(false); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  quickAction === 'email' ? 'bg-sky-600 text-white border-sky-600' : 'border-border text-muted-foreground hover:border-sky-500 hover:text-sky-600'
                }`}
                title="Send Email"
              >
                <Mail size={13} />
                <span className="hidden sm:inline">Email</span>
              </button>
              <button
                onClick={() => { setQuickAction(q => q === 'note' ? null : 'note'); setShowCallPanel(false); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  quickAction === 'note' ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-muted-foreground hover:border-amber-500 hover:text-amber-600'
                }`}
                title="Add internal note"
              >
                <StickyNote size={13} />
                <span className="hidden sm:inline">Note</span>
              </button>
              {/* Call button — opens in-app VoiceCallPanel */}
              <button
                onClick={() => { setShowCallPanel(v => !v); setQuickAction(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  showCallPanel ? 'bg-emerald-600 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
                title="In-app call"
              >
                <PhoneCall size={13} />
                <span className="hidden sm:inline">Call</span>
              </button>
              {/* Merge button */}
              {activeCustomerId && (
                <button
                  onClick={() => setShowMergeDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  title="Merge this customer with another"
                >
                  <GitMerge size={13} />
                  <span className="hidden sm:inline">Merge</span>
                </button>
              )}
              {/* Sync to DB button */}
              {activeCustomerId && (
                <button
                  onClick={handleSyncToDb}
                  disabled={syncToDbMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                  title="Save current customer data to the database"
                >
                  <Save size={13} />
                  <span className="hidden sm:inline">{syncToDbMutation.isPending ? 'Saving…' : 'Save'}</span>
                </button>
              )}
            </div>
          </div>
          {/* Sub-info */}
          {(() => {
            const addrs: any[] = (activeCustomer as any)?.addresses ?? [];
            const billingAddr = addrs.find(a => a.isBilling) ?? addrs.find(a => a.isPrimary) ?? addrs[0];
            const addrStr = billingAddr ? [billingAddr.street, billingAddr.city].filter(Boolean).join(', ') : (jobInfo.address ? `${jobInfo.address}${jobInfo.city ? `, ${jobInfo.city}` : ''}` : null);
            return (
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                {jobInfo.companyName && <span className="flex items-center gap-1"><Building2 size={11} />{jobInfo.companyName}</span>}
                {jobInfo.phone && <span className="flex items-center gap-1"><Phone size={11} />{jobInfo.phone}</span>}
                {jobInfo.email && <span className="flex items-center gap-1"><Mail size={11} />{jobInfo.email}</span>}
                {addrStr && (
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />{addrStr}
                    {billingAddr?.isBilling && <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-500/10 text-blue-600">Billing</span>}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Inline Quick-Action Compose Panel ── */}
      {(quickAction || showCallPanel) && (
        <div className="bg-muted/30 border-b border-border px-4 py-3">
          <div className="max-w-6xl mx-auto">
            {showCallPanel && (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <PhoneCall size={12} /> In-Browser Call — {customerFullName || jobInfo.client}
                  </span>
                  <button onClick={() => setShowCallPanel(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                </div>
                <div className="p-4">
                  <VoiceCallPanel
                    toNumber={activeCustomer?.mobilePhone ?? jobInfo.phone}
                    toName={customerFullName || jobInfo.client}
                    onCallEnd={() => {
                      setShowCallPanel(false);
                      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
                    }}
                  />
                </div>
              </div>
            )}
            {quickAction && (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    {quickAction === 'sms' && <><MessageSquare size={12} /> New SMS to {activeCustomer?.mobilePhone || jobInfo.phone || 'customer'}</>}
                    {quickAction === 'email' && <><Mail size={12} /> New Email to {activeCustomer?.email || jobInfo.email || 'customer'}</>}
                    {quickAction === 'note' && <><StickyNote size={12} /> Add Internal Note</>}
                  </span>
                  <button onClick={() => { setQuickAction(null); setQuickActionBody(''); setQuickActionSubject(''); }} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                </div>
                <div className="p-4 space-y-2">
                  {quickAction === 'email' && (
                    <input
                      type="text"
                      value={quickActionSubject}
                      onChange={e => setQuickActionSubject(e.target.value)}
                      placeholder="Subject…"
                      className="field-input w-full text-sm"
                    />
                  )}
                  <textarea
                    value={quickActionBody}
                    onChange={e => setQuickActionBody(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleQuickSend(); }}
                    placeholder={
                      quickAction === 'sms' ? 'Type your SMS message… (Ctrl+Enter to send)' :
                      quickAction === 'email' ? 'Type your email body… (Ctrl+Enter to send)' :
                      'Add an internal note… (Ctrl+Enter to save)'
                    }
                    rows={3}
                    className="field-input w-full resize-none text-sm"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {quickAction === 'note' ? 'Internal only — not visible to customer' : 'Ctrl+Enter to send'}
                    </span>
                    <button
                      onClick={handleQuickSend}
                      disabled={quickActionSending || !quickActionBody.trim()}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {quickActionSending ? 'Sending…' : quickAction === 'note' ? 'Save Note' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stub Merge Banner ── */}
      {(activeCustomer?.leadSource as string) === 'inbound_call' && !activeCustomer?.firstName && !activeCustomer?.email && activeCustomerId && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <PhoneCall size={14} className="shrink-0 text-amber-600" />
            <span><strong>Unknown caller</strong> — identify this caller and merge their history into the correct customer profile.</span>
          </div>
          <button
            onClick={() => setShowStubMergeDialog(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors"
          >
            <GitMerge size={12} />
            Merge into customer
          </button>
        </div>
      )}

      {/* ── Tab Nav ── */}
      <div className="bg-white border-b border-border sticky top-[var(--header-h,112px)] z-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex overflow-x-auto scrollbar-hide -mb-px gap-0">
            {CUSTOMER_OPERATING_TABS.map(tab => {
              const count = tab.key === 'opportunities' ? opportunities.filter(o => !o.archived).length
                : tab.key === 'workflow' ? opportunities.filter(o => getOpportunityHeat(o.area, o.stage, o.value, o.updatedAt).level === 'hot' && !o.archived).length
                : 0;
              return (
                <button
                  key={tab.key}
                  data-tab={tab.key}
                  onClick={() => handleTabClick(tab.key)}
                  className={`shrink-0 flex items-center gap-1 px-3 sm:px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    currentCustomerTab === tab.key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  <span className="hidden sm:inline-flex">{tab.icon}</span>
                  {tab.label}
                  {count > 0 && (
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                      currentCustomerTab === tab.key ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {currentCustomerTab === 'overview' && <CustomerOverviewTab />}
        {currentCustomerTab === 'opportunities' && <CustomerOpportunitiesTab />}
        {currentCustomerTab === 'schedule' && <CustomerScheduleTab />}
        {currentCustomerTab === 'roadmap' && <CustomerRoadmapTab />}
        {currentCustomerTab === 'workflow' && <CustomerWorkflowTab />}
        {currentCustomerTab === 'membership' && <CustomerMembershipTab />}
        {currentCustomerTab === 'documents' && <CustomerDocumentsTab />}
        {currentCustomerTab === 'billing' && <CustomerBillingTab />}
        {currentCustomerTab === 'history' && <CustomerHistoryTab />}
        {currentCustomerTab === activeCustomerTab && activeCustomerTab === 'profile' && activeCustomer && (
          <ConciergeBrief customer={activeCustomer} opportunities={opportunities} />
        )}
        {currentCustomerTab === activeCustomerTab && activeCustomerTab === 'profile' && <ProfileTab />}
        {currentCustomerTab === activeCustomerTab && activeCustomerTab === 'properties' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Properties</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Each property can have its own 360° membership, jobs, invoices, and expenses.
                </p>
              </div>
            </div>
            <PropertySelectorGrid
              customerId={activeCustomerId ?? ''}
              activePropertyId={activeProperty?.id ?? null}
              onSelectProperty={(prop) => {
                setSelectedPropertyId(prop.id);
                setSelectedPropertyPhase('aware');
                toast.success(`Viewing ${prop.label} - ${prop.street || prop.city || 'property'}`);
              }}
              customerAddress={{
                street: activeCustomer?.street ?? (jobInfo as any).street ?? '',
                unit: activeCustomer?.unit ?? (jobInfo as any).unit ?? '',
                city: activeCustomer?.city ?? jobInfo.city ?? '',
                state: activeCustomer?.state ?? jobInfo.state ?? '',
                zip: activeCustomer?.zip ?? jobInfo.zip ?? '',
                addressNotes: activeCustomer?.addressNotes,
              }}
            />
            <PropertyThreeSixtyWorkspace />
          </div>
        )}
        {currentCustomerTab === activeCustomerTab && (activeCustomerTab === 'leads' || activeCustomerTab === 'estimates' || activeCustomerTab === 'jobs') && <PipelineTab />}
        {currentCustomerTab === activeCustomerTab && activeCustomerTab === 'invoices' && <InvoiceSection />}
        {currentCustomerTab === activeCustomerTab && activeCustomerTab === 'expenses' && (
          <CustomerExpensesTab
            customerId={activeCustomerId ?? ''}
            opportunityOptions={opportunities
              .filter(o => o.area === 'job' && !o.archived)
              .map(o => ({ id: o.id, title: o.title || o.coNumber || o.id }))}
          />
        )}
        {activeCustomerTab === 'communication' && (
          <CommunicationTab
            customerId={activeCustomerId ?? ''}
            customerPhone={activeCustomer?.mobilePhone ?? jobInfo.phone}
            customerEmail={activeCustomer?.email ?? jobInfo.email}
            customerName={activeCustomer?.displayName ?? jobInfo.client}
            onOpenInbox={() => { setInboxCustomer(activeCustomerId); setSection('inbox' as any); }}
            onOpenInboxWithConversation={(conversationId, channel) => {
              setInboxConversation(conversationId, channel);
              setInboxCustomer(activeCustomerId);
              setSection('inbox' as any);
            }}
            onOpenInboxPortal={() => {
              setInboxCustomer(activeCustomerId);
              setSection('inbox' as any);
            }}
          />
        )}
        {currentCustomerTab === activeCustomerTab && activeCustomerTab === 'attachments' && (
          <CustomerAttachmentsTab customerId={activeCustomerId ?? ''} />
        )}
        {activeCustomerTab === 'portal' && (
          <CustomerPortalTab customerId={activeCustomerId ?? ''} />
        )}
        {currentCustomerTab === activeCustomerTab && activeCustomerTab === 'membership360' && (
          <CustomerMembershipPanel customerId={activeCustomerId ?? ''} />
        )}
        {(activeCustomerTab as any) === 'attachments_LEGACY_UNUSED' && (
          <div className="space-y-4">
            {/* Signed Estimate Copies */}
            {(() => {
              const signedEstimates = opportunities.filter(
                o => o.area === 'estimate' && (o.wonAt || o.signedEstimateDataUrl)
              );
              if (signedEstimates.length === 0) {
                return (
                  <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                    <Paperclip className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <div className="text-base font-semibold mb-1">No Attachments Yet</div>
                    <div className="text-sm">Signed estimate copies will appear here once an estimate is approved.</div>
                  </div>
                );
              }
              return (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Signed Estimates</h3>
                  {signedEstimates.map(est => (
                    <div key={est.id} className="rounded-xl border bg-card p-4 flex items-start gap-4">
                      {/* Thumbnail or icon */}
                      <div className="w-12 h-14 rounded border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {est.signedEstimateDataUrl ? (
                          <img src={est.signedEstimateDataUrl} alt="Signed estimate" className="w-full h-full object-cover" />
                        ) : (
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{est.signedEstimateFilename ?? `Estimate-${est.id}-Signed.pdf`}</span>
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs">Approved</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Signed {est.wonAt ? new Date(est.wonAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Contract value: {est.value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}
                        </p>
                      </div>
                      {est.signedEstimateDataUrl && (
                        <button
                          type="button"
                          className="shrink-0 text-xs text-primary hover:underline flex items-center gap-1"
                          onClick={async () => {
                            try {
                              const { jsPDF } = await import('jspdf');
                              const img = new Image();
                              img.src = est.signedEstimateDataUrl!;
                              await new Promise<void>((res, rej) => {
                                img.onload = () => res();
                                img.onerror = rej;
                              });
                              const imgW = img.naturalWidth || 1240;
                              const imgH = img.naturalHeight || 1754;
                              // Fit image to A4 page (210 x 297 mm)
                              const pageW = 210;
                              const pageH = 297;
                              const ratio = Math.min(pageW / imgW, pageH / imgH);
                              const drawW = imgW * ratio;
                              const drawH = imgH * ratio;
                              const offsetX = (pageW - drawW) / 2;
                              const offsetY = (pageH - drawH) / 2;
                              const orientation = drawH > drawW ? 'portrait' : 'landscape';
                              const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
                              pdf.addImage(est.signedEstimateDataUrl!, 'PNG', offsetX, offsetY, drawW, drawH);
                              const base = (est.signedEstimateFilename ?? `Estimate-${est.id}-Signed`).replace(/\.png$/i, '');
                              pdf.save(base + '.pdf');
                            } catch (err) {
                              console.error('PDF generation failed', err);
                              toast.error('Could not generate PDF');
                            }
                          }}
                        >
                          <Download className="w-3.5 h-3.5" /> Download PDF
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
        {currentCustomerTab === activeCustomerTab && activeCustomerTab === 'notes' && (
          <div className="card-section">
            <div className="card-section-header">
              <Edit3 size={15} />
              <span>Notes</span>
            </div>
            <div className="card-section-body space-y-3">
              <div className="flex gap-2">
                <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNote()}
                  placeholder="Add a note..." className="field-input flex-1" />
                <button onClick={addNote} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
                  Add
                </button>
              </div>
              <textarea value={customerProfile.privateNotes} onChange={e => setCustomerProfile({ privateNotes: e.target.value })}
                placeholder="Private notes about this customer..." rows={6} className="field-input w-full resize-none" />
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ── Intake modals opened from customer profile Add button ── */}
    {intakeModal === 'lead' && intakePrefill && (
      <NewLeadModal
        onClose={() => setIntakeModal(null)}
        prefill={intakePrefill}
        onSaved={(oppId) => { setIntakeModal(null); setActiveOpportunity(oppId); setSection('opp-details'); }}
      />
    )}
    {intakeModal === 'estimate' && intakePrefill && (
      <NewEstimateModal
        onClose={() => setIntakeModal(null)}
        prefill={intakePrefill}
        onSaved={(oppId) => { setIntakeModal(null); setActiveOpportunity(oppId); setSection('opp-details'); }}
      />
    )}
    {intakeModal === 'job' && intakePrefill && (
      <NewJobModal
        onClose={() => setIntakeModal(null)}
        prefill={intakePrefill}
        onSaved={(oppId) => { setIntakeModal(null); setActiveOpportunity(oppId); setSection('opp-details'); }}
      />
    )}

    {/* Manual Merge Dialog — two-step: pick customer, then compare & confirm */}
    {showMergeDialog && activeCustomer && (
      <ManualMergeFlow
        currentCustomer={activeCustomer}
        allCustomers={customers.filter(c => c.id !== activeCustomerId && !(c as any).mergedIntoId)}
        onClose={() => setShowMergeDialog(false)}
        onMerged={(sourceId, targetId) => {
          removeCustomer(sourceId);
          setShowMergeDialog(false);
        }}
      />
    )}

    {/* Stub Merge Dialog — pick a real customer to absorb this unknown-caller stub */}
    {showStubMergeDialog && activeCustomerId && (
      <StubMergeDialog
        stubId={activeCustomerId}
        customers={customers}
        onClose={() => setShowStubMergeDialog(false)}
        onMerge={(targetId) => mergeStubMutation.mutate({ stubId: activeCustomerId, targetId })}
        isPending={mergeStubMutation.isPending}
      />
    )}

    {/* Duplicate opportunity warning */}
    {showDuplicateWarning && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-background border border-border rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <span className="text-amber-600 text-lg">⚠</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">Existing {showDuplicateWarning.area} found</p>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">&ldquo;{showDuplicateWarning.existing}&rdquo;</span> is already open for this customer. Create another anyway?
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowDuplicateWarning(null)}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const area = showDuplicateWarning.area;
                setShowDuplicateWarning(null);
                setIntakeModal(area);
              }}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Create Anyway
            </button>
          </div>
        </div>
      </div>
    )}
    </>
    </ClientUmbrellaContext.Provider>
  );
}

// ─── Top-level tab components (must NOT be defined inside CustomerSection) ────
// These use hooks (useQuery, useMutation, useRef) so React requires them to be
// stable function references — i.e., defined at module scope, not inside a render.

// ─────────────────────────────────────────────────────────────────────────────
// CommunicationTab — unified comms hub for the customer profile.
//
// Replaces the old launcher view (2026-04-27) per Marcin's spec: one
// chronological timeline of every channel — inbound + outbound email, SMS,
// calls, voicemails, internal notes, portal chat — fed by
// `inbox.unifiedFeed.getByCustomer`. Sticky bottom action bar opens inline
// composers for Email / SMS / Note; Call is a click-to-dial via the existing
// VoiceCallPanel.
//
// Outbound email goes through Resend (sent FROM help@handypioneers.com so
// replies route to our monitored inbox). Inbound email is captured by the
// Gmail OAuth poller and lands in the same conversation, so both directions
// surface in this timeline.
// ─────────────────────────────────────────────────────────────────────────────

