// ============================================================
// OpportunityDetailsTab — first tab inside any lead/estimate/job
// Shows: contact info, address, opportunity name/description,
// and the lineage chain (Lead → Estimate → Job) with clickable
// links. Approved estimates open in read-only mode.
// ============================================================

import { useEstimator } from '@/contexts/EstimatorContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  User, Phone, Mail, MapPin, FileText, Briefcase,
  Star, ChevronRight, Lock, ExternalLink, Calendar, DollarSign, ArrowLeft,
} from 'lucide-react';
import type { Opportunity } from '@/lib/types';
import LeadNurturingPanel from '@/components/sections/LeadNurturingPanel';
import EstimateDetailsPanel from '@/components/sections/EstimateDetailsPanel';

// ── Helpers ──────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDollar(n?: number) {
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function areaLabel(area: string) {
  if (area === 'lead') return 'Lead';
  if (area === 'estimate') return 'Estimate';
  if (area === 'job') return 'Job';
  return area;
}

function areaIcon(area: string) {
  if (area === 'lead') return <Star className="w-4 h-4" />;
  if (area === 'estimate') return <FileText className="w-4 h-4" />;
  if (area === 'job') return <Briefcase className="w-4 h-4" />;
  return null;
}

function displayId(opp: Opportunity) {
  if (opp.jobNumber) return opp.jobNumber;
  // Fall back to first 8 chars of the UUID
  return `#${opp.id.slice(0, 8).toUpperCase()}`;
}

// ── Lineage node ─────────────────────────────────────────────

interface LineageNodeProps {
  opp: Opportunity;
  isCurrent: boolean;
  isReadOnly: boolean;
  onClick: () => void;
}

function LineageNode({ opp, isCurrent, isReadOnly, onClick }: LineageNodeProps) {
  const label = areaLabel(opp.area);
  const id = displayId(opp);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
        isCurrent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border bg-card hover:bg-muted/50 cursor-pointer'
      }`}
      onClick={isCurrent ? undefined : onClick}
    >
      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
        isCurrent ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
      }`}>
        {areaIcon(opp.area)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="text-xs font-mono text-muted-foreground">{id}</span>
          {isReadOnly && (
            <Badge variant="secondary" className="text-[10px] gap-1 px-1.5 py-0">
              <Lock className="w-2.5 h-2.5" /> Approved — Read Only
            </Badge>
          )}
          {isCurrent && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
              Current
            </Badge>
          )}
        </div>
        <div className="text-sm font-medium text-foreground truncate mt-0.5">{opp.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {fmtDate(opp.createdAt)} · {fmtDollar(opp.value)}
          {opp.wonAt && <span className="ml-2 text-emerald-600 font-medium">✓ Approved {fmtDate(opp.wonAt)}</span>}
        </div>
      </div>
      {!isCurrent && (
        <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function OpportunityDetailsTab() {
  const { state, setActiveOpportunity, setSection, navigateToTopLevel } = useEstimator();

  const activeOpp = state.opportunities.find(o => o.id === state.activeOpportunityId);
  if (!activeOpp) return null;

  // Build lineage chain: lead → estimate → job
  const chain: Opportunity[] = [];

  // Walk backwards to find the root lead
  const findLead = (opp: Opportunity): Opportunity | undefined => {
    if (opp.sourceLeadId) {
      return state.opportunities.find(o => o.id === opp.sourceLeadId);
    }
    return undefined;
  };

  const findEstimate = (opp: Opportunity): Opportunity | undefined => {
    if (opp.sourceEstimateId) {
      return state.opportunities.find(o => o.id === opp.sourceEstimateId);
    }
    return undefined;
  };

  // Build chain based on current area
  if (activeOpp.area === 'lead') {
    chain.push(activeOpp);
  } else if (activeOpp.area === 'estimate') {
    const lead = findLead(activeOpp);
    if (lead) chain.push(lead);
    chain.push(activeOpp);
  } else if (activeOpp.area === 'job') {
    const estimate = findEstimate(activeOpp);
    if (estimate) {
      const lead = findLead(estimate);
      if (lead) chain.push(lead);
      chain.push(estimate);
    } else if (activeOpp.sourceLeadId) {
      const lead = findLead(activeOpp);
      if (lead) chain.push(lead);
    }
    chain.push(activeOpp);
  }

  // Navigate to an ancestor opportunity
  const openAncestor = (opp: Opportunity) => {
    if (opp.id === activeOpp.id) return;
    // Switch to the ancestor — SET_ACTIVE_OPPORTUNITY saves current snapshot and restores theirs
    setActiveOpportunity(opp.id);
    // Default to details tab for the ancestor
    setSection('opp-details');
  };

  // Contact info: prefer live customer record (always up-to-date),
  // fall back to clientSnapshot (frozen at conversion), then jobInfo.
  const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);
  const snap = activeOpp.clientSnapshot;
  const contact = {
    name: activeCustomer
      ? [activeCustomer.firstName, activeCustomer.lastName].filter(Boolean).join(' ') || activeCustomer.displayName || '—'
      : snap?.client || state.jobInfo.client || '—',
    company: activeCustomer?.company || snap?.companyName || state.jobInfo.companyName || '',
    phone: activeCustomer?.mobilePhone || activeCustomer?.homePhone || activeCustomer?.workPhone || snap?.phone || state.jobInfo.phone || '—',
    email: activeCustomer?.email || snap?.email || state.jobInfo.email || '—',
    address: activeCustomer?.street || snap?.address || state.jobInfo.address || '',
    city: activeCustomer?.city || snap?.city || state.jobInfo.city || '',
    stateAbbr: activeCustomer?.state || snap?.state || state.jobInfo.state || '',
    zip: activeCustomer?.zip || snap?.zip || state.jobInfo.zip || '',
    scope: snap?.scope || state.jobInfo.scope || '',
    jobType: snap?.jobType || state.jobInfo.jobType || '',
  };

  const fullAddress = [contact.address, contact.city, contact.stateAbbr, contact.zip]
    .filter(Boolean).join(', ');

  const isApproved = !!activeOpp.wonAt;

  // Back-to-customer: navigate to the customer profile if we know the active customer
  const handleBackToCustomer = () => {
    if (state.activeCustomerId) {
      setActiveOpportunity(null);
      setSection('customer');
    } else {
      navigateToTopLevel('customers');
    }
  };

  const backLabel = activeCustomer
    ? ([activeCustomer.firstName, activeCustomer.lastName].filter(Boolean).join(' ') || activeCustomer.displayName || activeCustomer.company || 'Customer')
    : 'Customer';

  return (
    <div className="container py-6 max-w-3xl space-y-6">

      {/* Back-to-customer breadcrumb */}
      {(state.activeCustomerId || activeCustomer) && (
        <button
          onClick={handleBackToCustomer}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors -mt-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to <span className="font-medium text-foreground">{backLabel}</span></span>
        </button>
      )}

      {/* Approved / locked banner */}
      {isApproved && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3">
          <Lock className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              Approved Estimate — Read Only
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              This estimate was signed on {fmtDate(activeOpp.wonAt)}. Any changes must be done as a change order on the associated job.
            </p>
          </div>
        </div>
      )}

      {/* Opportunity header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="capitalize text-xs gap-1">
                  {areaIcon(activeOpp.area)}
                  {areaLabel(activeOpp.area)}
                </Badge>
                {activeOpp.jobNumber && (
                  <span className="text-xs font-mono text-muted-foreground">{activeOpp.jobNumber}</span>
                )}
                <Badge
                  variant="secondary"
                  className="text-xs"
                >
                  {activeOpp.stage}
                </Badge>
              </div>
              <CardTitle className="text-xl leading-tight">{activeOpp.title}</CardTitle>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-2xl font-bold text-primary">{fmtDollar(activeOpp.value)}</div>
              <div className="text-xs text-muted-foreground">Estimated value</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <span>Created {fmtDate(activeOpp.createdAt)}</span>
            </div>
            {activeOpp.scheduledDate && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span>Scheduled {fmtDate(activeOpp.scheduledDate)}</span>
              </div>
            )}
            {activeOpp.wonAt && (
              <div className="flex items-center gap-2 text-emerald-600">
                <DollarSign className="w-3.5 h-3.5" />
                <span>Won {fmtDate(activeOpp.wonAt)}</span>
              </div>
            )}
          </div>

          {(activeOpp.notes || contact.scope) && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Description / Scope</p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {activeOpp.notes || contact.scope}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Contact info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" /> Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="font-medium">{contact.name}</div>
                  {contact.company && <div className="text-xs text-muted-foreground">{contact.company}</div>}
                </div>
              </div>
              {contact.phone !== '—' && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <a href={`tel:${contact.phone}`} className="text-primary hover:underline">{contact.phone}</a>
                </div>
              )}
              {contact.email !== '—' && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">{contact.email}</a>
                </div>
              )}
            </div>
            {fullAddress && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <div>{contact.address}</div>
                  {(contact.city || contact.stateAbbr || contact.zip) && (
                    <div className="text-muted-foreground">{[contact.city, contact.stateAbbr, contact.zip].filter(Boolean).join(', ')}</div>
                  )}
                </div>
              </div>
            )}
          </div>
          {contact.jobType && (
            <>
              <Separator />
              <div className="text-sm">
                <span className="text-muted-foreground">Job type: </span>
                <span className="font-medium">{contact.jobType}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Lead nurturing workspace — only shown for leads */}
      {activeOpp.area === 'lead' && <LeadNurturingPanel />}

      {/* Estimate / job details panel — stage switcher, notes, attachments, contact */}
      {(activeOpp.area === 'estimate' || activeOpp.area === 'job') && <EstimateDetailsPanel />}

      {/* Lineage chain */}
      {chain.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ChevronRight className="w-4 h-4" /> Opportunity Journey
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click any ancestor to open it as a reference. Approved estimates are read-only.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {chain.map((opp, i) => {
              const isCurrent = opp.id === activeOpp.id;
              const isReadOnly = opp.area === 'estimate' && !!opp.wonAt && !isCurrent;
              return (
                <div key={opp.id} className="space-y-2">
                  <LineageNode
                    opp={opp}
                    isCurrent={isCurrent}
                    isReadOnly={isReadOnly}
                    onClick={() => openAncestor(opp)}
                  />
                  {i < chain.length - 1 && (
                    <div className="flex items-center justify-center">
                      <ChevronRight className="w-4 h-4 text-muted-foreground rotate-90" />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Convert to Estimate modal */}
      {showConvertModal && activeOpp.area === 'lead' && (
        <ConvertToEstimateModal
          lead={activeOpp}
          onConfirm={(title, value, transferNotes, transferAttachments) => {
            convertLeadToEstimate(activeOpp.id, title, value, transferNotes, transferAttachments);
            setShowConvertModal(false);
          }}
          onClose={() => setShowConvertModal(false)}
        />
      )}

    </div>
  );
}
