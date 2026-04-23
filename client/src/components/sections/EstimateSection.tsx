// ============================================================
// EstimateSection — Customer-facing estimate output
// Design: HP branded header with real logo, full metadata,
//         trade cards with SOW bullets, T&C modal, e-signature.
// Logo CDN: https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg
// ============================================================

import { useMemo, useState, useCallback } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcCustomItem, calcTotals, fmtDollar, fmtPct, getMarginFlag } from '@/lib/calc';
import { ALL_PHASES } from '@/lib/phases';
import { LineItem, PhaseGroup, EstimatePhaseOverride, CustomLineItem } from '@/lib/types';
import {
  Copy, Printer, ChevronDown, ChevronUp, AlertTriangle,
  CheckCircle2, XCircle, Mail, Presentation, X, FileText, Send,
  Pencil, Sparkles, RotateCcw, Check, Plus, Trash2, Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import AddressMapPreview from '@/components/AddressMapPreview';
import SendEstimateDialog from '@/components/SendEstimateDialog';
import { trpc } from '@/lib/trpc';
import { getTaxRateForZip, CLARK_COUNTY_TAX_RATES } from '@/lib/taxRates';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';

const HP_COMPANY = {
  name: 'Handy Pioneers',
  address: '808 SE Chkalov Dr 3-433',
  city: 'Vancouver, WA 98683',
  phone: '(360) 544-9858',
  email: 'help@handypioneers.com',
  website: 'www.HandyPioneers.com',
  license: 'HANDYP*761NH',
};

// Full T&C text from HP legal document
const TC_SECTIONS = [
  {
    num: '1', title: 'Licensed and Insured Contractor',
    body: 'Handy Pioneers, LLC is a registered and bonded General Contractor in the State of Washington, operating under license number HANDYP*761NH. HP complies with RCW 18.27 and all applicable laws governing contractor practices in Washington State.',
  },
  {
    num: '2', title: 'Scope of Work',
    body: 'All work performed will be defined in a written estimate or contract. Modifications to the scope must be agreed upon in writing. Additional charges may apply for change orders, unforeseen conditions, or client-initiated revisions.',
  },
  {
    num: '3', title: 'Payment Terms',
    body: 'Payments are due per the estimate or invoice terms. Deposits may be required to initiate work. Late payments may incur a 1.5% monthly finance charge (18% APR) or the highest amount allowed by law. HP reserves the right to suspend services for non-payment. A 3% processing fee will be added to all payments made by credit card for clients who are not active 360° HomeCare Members.',
  },
  {
    num: '4', title: 'Scheduling and Delays',
    body: 'While HP strives to meet estimated timelines, delays due to weather, material shortages, subcontractor scheduling, or other unforeseen events may occur. HP is not liable for such delays beyond its control.',
  },
  {
    num: '5', title: 'Workmanship Warranty',
    body: 'HP warrants labor for one (1) year from the date of project completion. Warranty excludes damage from misuse or abuse, wear and tear, alterations or repairs by others, and manufacturer defects (covered separately under product warranties).',
  },
  {
    num: '6', title: 'Right to Use Before/After Photos',
    body: 'Client agrees to allow Handy Pioneers, LLC to take and use photos or videos of the work area before, during, and after project completion for promotional purposes including website, social media, and marketing materials. No personal identifying information will be shared.',
  },
  {
    num: '7', title: 'Site Access and Utilities',
    body: 'Client must provide safe and timely access to the property and ensure availability of essential utilities (electricity, water, etc.). HP is not responsible for delays caused by lack of access or site readiness.',
  },
  {
    num: '8', title: 'Permits and Code Compliance',
    body: 'Client is responsible for securing required permits unless otherwise stated in writing. HP will comply with applicable codes but is not responsible for pre-existing violations or municipal inspection outcomes not under our control.',
  },
  {
    num: '9', title: 'Damage and Liability',
    body: 'HP maintains general liability and worker\'s compensation insurance. Claims for damage caused by our work must be reported in writing within 72 hours of discovery. HP is not responsible for existing conditions or issues concealed within walls, floors, or structures.',
  },
  {
    num: '10', title: 'Subcontracting',
    body: 'HP may delegate work to licensed and insured subcontractors where appropriate. Subcontracted work is held to the same quality and performance standards.',
  },
  {
    num: '11', title: 'Cancellations',
    body: 'Cancellations within 48 hours of the scheduled service may result in a charge of $150 or 20% of the project value, whichever is greater. This covers allocated labor and scheduling losses.',
  },
  {
    num: '12', title: 'Dispute Resolution',
    body: 'Any dispute arising out of or related to this Agreement will be resolved via binding arbitration in Clark County, WA, per the rules of the American Arbitration Association. Each party shall bear its own legal costs unless otherwise awarded.',
  },
  {
    num: '13', title: 'Limitation of Liability',
    body: 'To the extent allowed by law, HP\'s total liability is limited to the total amount paid for the specific project. HP is not responsible for indirect, incidental, or consequential damages.',
  },
  {
    num: '14', title: 'Governing Law',
    body: 'This Agreement shall be governed by the laws of the State of Washington, without regard to conflict of law principles.',
  },
  {
    num: '15', title: 'Entire Agreement',
    body: 'This document and the associated estimate represent the full understanding between the parties. Any changes must be made in writing and signed by both parties.',
  },
  {
    num: '16', title: 'Severability',
    body: 'If any part of this Agreement is deemed unenforceable, all other provisions remain in effect.',
  },
];

// ─── SOW bullet generator ─────────────────────────────────────
function buildSowBullets(phase: PhaseGroup, activeItems: LineItem[]): string[] {
  const bullets: string[] = [];
  for (const item of activeItems) {
    const tierData = item.hasTiers ? item.tiers[item.tier] : null;
    const tierName = tierData?.name ?? '';
    const qty = item.qty;
    const u = item.unitType;
    const qtyLabel = (n: number, unit: string): string => {
      const map: Record<string, string> = {
        lf: `${n} linear ft`, sqft: `${n} sq ft`, unit: `${n} unit${n !== 1 ? 's' : ''}`,
        hr: `${n} hr${n !== 1 ? 's' : ''}`, opening: `${n} opening${n !== 1 ? 's' : ''}`,
        load: `${n} load${n !== 1 ? 's' : ''}`, patch: `${n} patch${n !== 1 ? 'es' : ''}`,
        step: `${n} step${n !== 1 ? 's' : ''}`, closet: `${n} closet${n !== 1 ? 's' : ''}`,
        fixture: `${n} fixture${n !== 1 ? 's' : ''}`, circuit: `${n} circuit${n !== 1 ? 's' : ''}`,
        can: `${n} can${n !== 1 ? 's' : ''}`, door: `${n} door${n !== 1 ? 's' : ''}`,
        box: `${n} box${n !== 1 ? 'es' : ''}`, window: `${n} window${n !== 1 ? 's' : ''}`,
        fan: `${n} fan${n !== 1 ? 's' : ''}`, device: `${n} device${n !== 1 ? 's' : ''}`,
      };
      return map[unit] ?? `${n} ${unit}`;
    };
    let bullet = '';
    if (item.hasTiers && tierName) {
      bullet = `Supply and install ${qtyLabel(qty, u)} of ${tierName}`;
      if (item.wastePct > 0) bullet += ` (includes ${item.wastePct}% waste allowance)`;
    } else {
      bullet = `${item.name} — ${qtyLabel(qty, u)}`;
    }
    if (item.salesDesc) {
      const desc = item.salesDesc.replace(/\.$/, '');
      bullet += `. ${desc}.`;
    }
    if (item.hasPaintPrep && item.paintPrep !== 'none') {
      const prepLabel = item.paintPrep === 'caulk' ? 'caulk and touch-up' : 'full paint prep (caulk, prime, and paint)';
      bullet += ` Includes ${prepLabel}.`;
    }
    if (item.flagged && item.flagNote) bullet += ` (${item.flagNote})`;
    bullets.push(bullet);
  }
  if (bullets.length > 8) {
    const shown = bullets.slice(0, 7);
    shown.push(`Plus ${bullets.length - 7} additional items — see detailed breakdown below.`);
    return shown;
  }
  return bullets;
}

// ─── T&C Modal ────────────────────────────────────────────────
function TCModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <img src={HP_LOGO} alt="Handy Pioneers" className="h-10 w-10 object-contain rounded" />
            <div>
              <div className="font-bold text-foreground">Terms &amp; Conditions</div>
              <div className="text-xs text-muted-foreground">Handy Pioneers, LLC · WA License: {HP_COMPANY.license}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Effective date */}
        <div className="px-6 py-3 bg-slate-50 border-b border-border shrink-0">
          <p className="text-xs text-muted-foreground">
            Effective Date: 05/13/2025 · These Terms and Conditions govern all services provided by Handy Pioneers, LLC.
            By hiring HP for any work, you agree to the following.
          </p>
        </div>
        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {TC_SECTIONS.map(s => (
            <div key={s.num}>
              <div className="font-bold text-sm text-foreground mb-1">{s.num}. {s.title}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
            </div>
          ))}
          <div className="pt-2 border-t border-border text-xs text-muted-foreground">
            Have questions? Visit <a href="https://www.handypioneers.com" target="_blank" rel="noreferrer" className="text-primary underline">www.HandyPioneers.com</a> or call us at {HP_COMPANY.phone}.
          </div>
        </div>
        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Estimate Header ─────────────────────────────────────────
function EstimateHeader({ jobInfo, estimateNumber, today }: {
  jobInfo: ReturnType<typeof useEstimator>['state']['jobInfo'];
  estimateNumber: string;
  today: string;
}) {
  const fmtDate = (d: string) => {
    if (!d) return '—';
    try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };

  return (
    <div className="bg-white border-b border-border">
      {/* Top bar: logo + company info + estimate number */}
      <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-6 flex-wrap">
        {/* Left: logo + company contact */}
        <div className="flex items-start gap-4">
          <img src={HP_LOGO} alt="Handy Pioneers" className="h-16 w-16 object-contain rounded-lg shrink-0" />
          <div>
            <div className="font-black text-xl text-foreground tracking-tight leading-tight">{HP_COMPANY.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{HP_COMPANY.address}</div>
            <div className="text-xs text-muted-foreground">{HP_COMPANY.city}</div>
            <div className="text-xs text-muted-foreground mt-1">
              <a href={`tel:${HP_COMPANY.phone}`} className="hover:text-primary">{HP_COMPANY.phone}</a>
              {' · '}
              <a href={`mailto:${HP_COMPANY.email}`} className="hover:text-primary">{HP_COMPANY.email}</a>
            </div>
          </div>
        </div>
        {/* Right: estimate number + title */}
        <div className="text-right shrink-0">
          <div className="text-2xl font-black text-foreground tracking-tight">Estimate</div>
          <div className="text-sm font-bold text-primary mt-0.5">#{estimateNumber}</div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6 border-t border-border" />

      {/* Client block + metadata grid */}
      <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        {/* Left: Estimate For */}
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">Estimate For</div>
          {jobInfo.companyName && (
            <div className="font-bold text-foreground text-sm">{jobInfo.companyName}</div>
          )}
          {jobInfo.client && (
            <div className="font-semibold text-foreground text-sm">{jobInfo.client}</div>
          )}
          {jobInfo.address && (
            <div className="text-sm text-muted-foreground">
              {jobInfo.address}
            </div>
          )}
          {(jobInfo.city || jobInfo.state || jobInfo.zip) && (
            <div className="text-sm text-muted-foreground">
              {[jobInfo.city, jobInfo.state, jobInfo.zip].filter(Boolean).join(', ')}
            </div>
          )}
          {jobInfo.phone && (
            <div className="text-sm text-muted-foreground mt-0.5">{jobInfo.phone}</div>
          )}
          {jobInfo.email && (
            <div className="text-sm text-muted-foreground">{jobInfo.email}</div>
          )}
        </div>

        {/* Right: metadata */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-0.5">Created On</div>
            <div className="text-foreground font-medium">{fmtDate(jobInfo.date) || today}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-0.5">Expires On</div>
            <div className="text-foreground font-medium">{fmtDate(jobInfo.expiresDate)}</div>
          </div>
          {jobInfo.estimator && (
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-0.5">Prepared By</div>
              <div className="text-foreground font-medium">{jobInfo.estimator}</div>
            </div>
          )}
          {jobInfo.servicedDate && (
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-0.5">Serviced On</div>
              <div className="text-foreground font-medium">{fmtDate(jobInfo.servicedDate)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export default function EstimateSection() {
  const { state, setSummaryNotes, setClientNote, setSection, updateOpportunity, upsertPhaseOverride, removePhaseOverride, setGlobal, updateCustomItem } = useEstimator();
  const [showMatLabor, setShowMatLabor] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());
  const [showTC, setShowTC] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  // Inline editing state: which phase is in edit mode
  const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
  // Draft state for the phase currently being edited
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftBullets, setDraftBullets] = useState<string[]>([]);
  const [aiRewriting, setAiRewriting] = useState(false);

  const rewritePhaseMutation = trpc.estimate.rewritePhase.useMutation();
  const rewriteCustomItemMutation = trpc.estimate.rewriteCustomItem.useMutation();

  // Custom item inline editing state
  const [editingCustomItemId, setEditingCustomItemId] = useState<string | null>(null);
  const [draftCustomTitle, setDraftCustomTitle] = useState('');
  const [draftCustomDescription, setDraftCustomDescription] = useState('');
  const [aiRewritingCustom, setAiRewritingCustom] = useState(false);

  // Portal approval status — polls every 30s when estimate has been sent
  const portalApprovalQuery = trpc.portal.getPortalApprovalStatus.useQuery(
    { hpOpportunityId: state.activeOpportunityId ?? '' },
    {
      enabled: !!state.activeOpportunityId && !!(state.jobInfo as any).sentAt,
      refetchInterval: 30_000,
      staleTime: 20_000,
    }
  );
  const portalApproval = portalApprovalQuery.data;

  const startEdit = useCallback((phase: PhaseGroup, bullets: string[]) => {
    const override = state.phaseOverrides.find(o => o.phaseId === phase.id);
    setDraftTitle(override?.customTitle ?? phase.name);
    setDraftDescription(override?.customDescription ?? phase.description);
    setDraftBullets(override?.customBullets ?? [...bullets]);
    setEditingPhaseId(phase.id);
  }, [state.phaseOverrides]);

  const cancelEdit = useCallback(() => {
    setEditingPhaseId(null);
  }, []);

  const saveEdit = useCallback((phase: PhaseGroup, originalBullets: string[]) => {
    const isDefault =
      draftTitle === phase.name &&
      draftDescription === phase.description &&
      JSON.stringify(draftBullets) === JSON.stringify(originalBullets);
    if (isDefault) {
      removePhaseOverride(phase.id);
    } else {
      upsertPhaseOverride({
        phaseId: phase.id,
        customTitle: draftTitle,
        customDescription: draftDescription,
        customBullets: draftBullets,
      });
    }
    setEditingPhaseId(null);
    toast.success('Section updated');
  }, [draftTitle, draftDescription, draftBullets, upsertPhaseOverride, removePhaseOverride]);

  const handleAiRewrite = useCallback(async (phase: PhaseGroup) => {
    setAiRewriting(true);
    try {
      const result = await rewritePhaseMutation.mutateAsync({
        phaseName: draftTitle,
        phaseDescription: draftDescription,
        bullets: draftBullets,
        jobTitle: state.jobInfo.scope || state.jobInfo.jobNumber || 'Home Improvement Project',
        customerName: state.jobInfo.client || 'Valued Customer',
      });
      setDraftTitle(result.title);
      setDraftDescription(result.description);
      setDraftBullets(result.bullets);
      toast.success('AI rewrite complete');
    } catch {
      toast.error('AI rewrite failed — try again');
    } finally {
      setAiRewriting(false);
    }
  }, [draftTitle, draftDescription, draftBullets, state.jobInfo, rewritePhaseMutation]);

  const resetPhase = useCallback((phase: PhaseGroup) => {
    removePhaseOverride(phase.id);
    if (editingPhaseId === phase.id) setEditingPhaseId(null);
    toast.success('Section reset to original');
  }, [removePhaseOverride, editingPhaseId]);

  // ── Custom item inline editing ───────────────────────────────
  const startEditCustomItem = useCallback((ci: CustomLineItem) => {
    setDraftCustomTitle(ci.description);
    setDraftCustomDescription(ci.notes ?? '');
    setEditingCustomItemId(ci.id);
  }, []);

  const saveCustomItemEdit = useCallback((id: string) => {
    updateCustomItem(id, { description: draftCustomTitle, notes: draftCustomDescription });
    setEditingCustomItemId(null);
    toast.success('Custom item updated');
  }, [draftCustomTitle, draftCustomDescription, updateCustomItem]);

  const cancelCustomItemEdit = useCallback(() => {
    setEditingCustomItemId(null);
  }, []);

  const handleAiRewriteCustomItem = useCallback(async (id: string) => {
    setAiRewritingCustom(true);
    try {
      const result = await rewriteCustomItemMutation.mutateAsync({
        title: draftCustomTitle,
        description: draftCustomDescription,
        jobTitle: state.jobInfo.scope || state.jobInfo.jobNumber || 'Home Improvement Project',
        customerName: state.jobInfo.client || 'Valued Customer',
      });
      setDraftCustomTitle(result.title);
      setDraftCustomDescription(result.description);
      toast.success('AI rewrite complete');
    } catch {
      toast.error('AI rewrite failed — try again');
    } finally {
      setAiRewritingCustom(false);
    }
  }, [draftCustomTitle, draftCustomDescription, state.jobInfo, rewriteCustomItemMutation]);

  const { phaseResults, customResults, totals } = useMemo(() => {
    const phaseResults = state.phases.map(p => calcPhase(p, state.global));
    const customResults = state.customItems.map(ci => calcCustomItem(ci, state.global));
    const totals = calcTotals(phaseResults, customResults);
    return { phaseResults, customResults, totals };
  }, [state.phases, state.customItems, state.global]);

  const activePhaseData = useMemo(() => {
    return state.phases
      .map((phase, idx) => {
        const activeItems = phase.items.filter(i => i.enabled && i.qty > 0);
        if (activeItems.length === 0) return null;
        const result = phaseResults[idx];
        const bullets = buildSowBullets(phase, activeItems);
        return { phase, result, activeItems, bullets };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [state.phases, phaseResults]);

  const gmFlag = getMarginFlag(totals.totalGM, totals.totalHard);
  const minGM = totals.totalHard < 2000 ? 0.40 : 0.30;
  const isReady = gmFlag === 'ok' && totals.totalPrice > 0;

  // ── Tax calculations ─────────────────────────────────────────
  const taxEnabled = state.global.taxEnabled ?? false;
  const taxRateCode = state.global.taxRateCode ?? '0603';
  const customTaxPct = state.global.customTaxPct ?? 8.9;
  const taxRateInfo = useMemo(() => {
    if (!taxEnabled) return null;
    if (taxRateCode === 'none') return null;
    if (taxRateCode === 'custom') return { rate: customTaxPct / 100, label: `Custom (${customTaxPct}%)`, code: 'custom' };
    return CLARK_COUNTY_TAX_RATES.find(r => r.code === taxRateCode) ?? null;
  }, [taxEnabled, taxRateCode, customTaxPct]);
  const taxAmount = taxRateInfo ? totals.totalPrice * taxRateInfo.rate : 0;
  const grandTotal = totals.totalPrice + taxAmount;

  // Auto-populate tax code from job zip when tax is enabled
  const handleTaxToggle = useCallback((enabled: boolean) => {
    const updates: Partial<typeof state.global> = { taxEnabled: enabled };
    if (enabled && state.jobInfo.zip) {
      const zipInfo = getTaxRateForZip(state.jobInfo.zip);
      if (zipInfo) {
        updates.taxRateCode = zipInfo.code;
      }
    }
    setGlobal(updates);
  }, [state.jobInfo.zip, setGlobal]);

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const estimateNumber = state.jobInfo.jobNumber || `HP-${Date.now().toString().slice(-6)}`;

  // Deposit label from configured settings
  const depositLabel = state.depositType === 'pct'
    ? `${state.depositValue}% deposit required to schedule work; balance due upon project completion`
    : `$${state.depositValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} deposit required to schedule work; balance due upon project completion`;

  const togglePhase = (id: number) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const generatePlainText = (): string => {
    const ji = state.jobInfo;
    const lines: string[] = [
      'HANDY PIONEERS — PROJECT ESTIMATE',
      '808 SE Chkalov Dr 3-433, Vancouver, WA 98683',
      '(360) 544-9858 | help@handypioneers.com | www.HandyPioneers.com',
      `WA Contractor License: ${HP_COMPANY.license}`,
      '─────────────────────────────────────',
      `Estimate #: ${estimateNumber}`,
      '',
    ];
    if (ji.companyName || ji.client) {
      lines.push('ESTIMATE FOR');
      if (ji.companyName) lines.push(ji.companyName);
      if (ji.client) lines.push(ji.client);
      const addr = [ji.address, ji.city, ji.state, ji.zip].filter(Boolean).join(', ');
      if (addr) lines.push(addr);
      if (ji.phone) lines.push(ji.phone);
      if (ji.email) lines.push(ji.email);
      lines.push('');
    }
    const fmtD = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : '—';
    lines.push(`Created On: ${fmtD(ji.date)}`);
    if (ji.expiresDate) lines.push(`Expires On: ${fmtD(ji.expiresDate)}`);
    if (ji.estimator) lines.push(`Prepared By: ${ji.estimator}`);
    if (ji.servicedDate) lines.push(`Serviced On: ${fmtD(ji.servicedDate)}`);
    lines.push('');

    if (ji.scope) {
      lines.push('PROJECT OVERVIEW');
      lines.push('─────────────────────────────────────');
      lines.push(ji.scope);
      lines.push('');
    }

    lines.push('SCOPE OF WORK & INVESTMENT');
    lines.push('─────────────────────────────────────');
    for (const { phase, result, bullets } of activePhaseData) {
      lines.push('');
      lines.push(`${phase.icon}  ${phase.name.toUpperCase()}`);
      lines.push(phase.description);
      lines.push('');
      for (const b of bullets) lines.push(`  • ${b}`);
      lines.push('');
      lines.push(`  Investment: ${fmtDollar(result.price)}`);
    }
    if (customResults.length > 0) {
      lines.push('');
      lines.push('ADDITIONAL ITEMS');
      lines.push('─────────────────────────────────────');
      for (const cr of customResults) {
        const ci = state.customItems.find(c => c.id === cr.id)!;
        lines.push(`  • ${ci.description} — ${fmtDollar(cr.price)}`);
      }
    }
    lines.push('');
    lines.push('─────────────────────────────────────');
    if (taxRateInfo && taxAmount > 0) {
      lines.push(`Subtotal: ${fmtDollar(totals.totalPrice)}`);
      lines.push(`Sales Tax (${taxRateInfo.label}): ${fmtDollar(taxAmount)}`);
    }
    lines.push(`TOTAL INVESTMENT: ${fmtDollar(grandTotal)}`);
    lines.push('');
    lines.push('TERMS & CONDITIONS');
    lines.push('─────────────────────────────────────');
    lines.push(`• ${depositLabel}`);
    lines.push('• This estimate is valid for 30 days from the date above');
    lines.push('• All work guaranteed — 1-year workmanship warranty on labor');
    lines.push('• Any scope changes will be documented in a written change order');
    lines.push('• Handy Pioneers is fully licensed and insured in Washington State');
    lines.push(`• Full T&C: www.HandyPioneers.com`);
    if (state.clientNote) {
      lines.push('');
      lines.push('NOTE');
      lines.push(state.clientNote);
    }
    if (state.signature) {
      lines.push('');
      lines.push(`ACCEPTED BY: ${state.signedBy || ''}`);
      lines.push(`SIGNED: ${state.signedAt ? new Date(state.signedAt).toLocaleString() : ''}`);
    }
    lines.push('');
    lines.push('Handy Pioneers, LLC · Vancouver, WA · Licensed & Insured · HANDYP*761NH');
    return lines.join('\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatePlainText());
    toast.success('Estimate copied to clipboard');
  };

  // Deposit amount for dialog
  const depositAmount = state.depositType === 'pct'
    ? (totals.totalPrice * state.depositValue) / 100
    : state.depositValue;

  // Active customer for pre-filling email/phone
  const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-16">
      {showTC && <TCModal onClose={() => setShowTC(false)} />}
      {showSendDialog && (
        <SendEstimateDialog
          estimateNumber={estimateNumber}
          customerName={activeCustomer?.displayName || (activeCustomer ? `${activeCustomer.firstName} ${activeCustomer.lastName ?? ''}`.trim() : '') || state.jobInfo.client || 'Customer'}
          jobTitle={state.jobInfo.scope || state.jobInfo.jobNumber || 'Project Estimate'}
          totalPrice={totals.totalPrice}
          depositLabel={depositLabel}
          depositAmount={depositAmount}
          scopeSummary={state.jobInfo.scope}
          lineItemsText={generatePlainText()}
          lineItemsJson={JSON.stringify(
            activePhaseData.map(({ phase, result, activeItems, bullets }) => ({
              phaseName: phase.name,
              phaseDescription: (phase as any).description ?? '',
              items: activeItems.map((item, idx) => {
                const itemResult = result.items.find((r: any) => r.id === item.id);
                const price = itemResult?.price ?? 0;
                const unitPrice = item.qty > 0 ? price / item.qty : 0;
                return {
                  name: item.name,
                  scopeOfWork: bullets[idx] ?? '',
                  qty: item.qty,
                  unitType: item.unitType,
                  unitPrice: Math.round(unitPrice * 100) / 100,
                  amount: Math.round(price * 100) / 100,
                };
              }),
              phaseTotal: Math.round(result.price * 100) / 100,
            }))
          )}
          hpCustomerId={activeCustomer?.id}
          hpOpportunityId={state.activeOpportunityId ?? undefined}
          defaultEmail={activeCustomer?.email || state.jobInfo.email || ''}
          defaultPhone={activeCustomer?.mobilePhone || state.jobInfo.phone || ''}
          onClose={() => setShowSendDialog(false)}
          onSent={() => {
            if (state.activeOpportunityId) {
              updateOpportunity(state.activeOpportunityId, { sentAt: new Date().toISOString() });
            }
          }}
        />
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap no-print">
        <button onClick={handleCopy} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Copy className="w-4 h-4" />Copy
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted transition-colors">
          <Printer className="w-4 h-4" />Print
        </button>
        <button
          onClick={() => setShowSendDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
        >
          <Send className="w-4 h-4" />Send to Customer
        </button>
        <button onClick={() => setSection('present')} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors">
          <Presentation className="w-4 h-4" />Present
        </button>
        <button onClick={() => setShowMatLabor(v => !v)} className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted transition-colors">
          {showMatLabor ? 'Hide' : 'Show'} Mat/Labor Split
        </button>
      </div>

      {/* Portal approval status banner */}
      {portalApproval && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm no-print ${
          portalApproval.status === 'approved'
            ? 'bg-green-50 border-green-200 text-green-800'
            : portalApproval.status === 'declined'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          {portalApproval.status === 'approved' ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          ) : portalApproval.status === 'declined' ? (
            <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          ) : (
            <Mail className="w-5 h-5 text-amber-500 shrink-0" />
          )}
          <div className="flex-1">
            {portalApproval.status === 'approved' ? (
              <span>
                <strong>{portalApproval.signerName}</strong> approved this estimate in the portal
                {portalApproval.approvedAt && (
                  <span className="ml-1 text-green-600 font-normal">
                    on {new Date(portalApproval.approvedAt).toLocaleDateString()}
                  </span>
                )}
                . Opportunity marked <strong>Won</strong>.
              </span>
            ) : portalApproval.status === 'declined' ? (
              <span>Customer <strong>declined</strong> this estimate in the portal. Consider following up.</span>
            ) : (
              <span>Estimate sent to portal — awaiting customer approval.</span>
            )}
          </div>
        </div>
      )}

      {/* ─── ESTIMATE DOCUMENT ─────────────────────────────── */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden print-area">

        {/* Branded header */}
        <EstimateHeader jobInfo={state.jobInfo} estimateNumber={estimateNumber} today={today} />

        {/* Service address map preview — no-print */}
        {state.jobInfo.address && (
          <div className="px-6 py-4 border-b border-border no-print">
            <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">Service Location</div>
            <AddressMapPreview
              street={state.jobInfo.address}
              city={state.jobInfo.city}
              state={state.jobInfo.state}
              zip={state.jobInfo.zip}
              height="160px"
              showLink
            />
          </div>
        )}

        {/* Project overview */}
        {state.jobInfo.scope && (
          <div className="px-6 py-4 border-b border-border">
            <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">Project Overview</div>
            <p className="text-sm text-foreground leading-relaxed">{state.jobInfo.scope}</p>
          </div>
        )}

        {/* Trade sections */}
        <div className="divide-y divide-border">
          {activePhaseData.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">
              <div className="text-4xl mb-3">📋</div>
              <div className="font-semibold">No items entered yet</div>
              <div className="mt-1">Go to the Calculator tab and add quantities for each trade.</div>
            </div>
          ) : (
            activePhaseData.map(({ phase, result, activeItems, bullets }) => {
              const isExpanded = expandedPhases.has(phase.id);
              const override = state.phaseOverrides.find(o => o.phaseId === phase.id);
              const displayTitle = override?.customTitle ?? phase.name;
              const displayDescription = override?.customDescription ?? phase.description;
              const displayBullets = override?.customBullets ?? bullets;
              const isEditing = editingPhaseId === phase.id;
              const hasOverride = !!override;

              return (
                <div key={phase.id} className="px-6 py-5">
                  {/* View mode */}
                  {!isEditing ? (
                    <>
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg leading-none">{phase.icon}</span>
                            <h3 className="font-bold text-base text-foreground">{displayTitle}</h3>
                            {hasOverride && (
                              <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 no-print">Edited</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{displayDescription}</p>
                        </div>
                        <div className="flex items-start gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-lg font-black text-foreground mono">{fmtDollar(result.price)}</div>
                            {showMatLabor && (
                              <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
                                <div>Materials: {fmtDollar(result.matPrice)}</div>
                                <div>Labor: {fmtDollar(result.laborPrice)}</div>
                              </div>
                            )}
                          </div>
                          {/* Edit button */}
                          <button
                            onClick={() => startEdit(phase, bullets)}
                            title="Edit section"
                            className="no-print mt-0.5 p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <ul className="space-y-2 mt-3 mb-3">
                        {displayBullets.map((b, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="text-primary font-bold mt-0.5 shrink-0">•</span>
                            <span className="leading-relaxed">{b}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-center gap-3 no-print">
                        <button
                          onClick={() => togglePhase(phase.id)}
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isExpanded ? 'Hide' : 'Show'} line item detail
                        </button>
                        {hasOverride && (
                          <button
                            onClick={() => resetPhase(phase)}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-600 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />Reset to original
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    /* Edit mode */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{phase.icon}</span>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Editing section</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAiRewrite(phase)}
                            disabled={aiRewriting}
                            className="no-print flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-60 transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            {aiRewriting ? 'Rewriting…' : 'AI Rewrite'}
                          </button>
                          <button
                            onClick={() => saveEdit(phase, bullets)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />Cancel
                          </button>
                        </div>
                      </div>

                      {/* Title */}
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1 block">Section Title</label>
                        <input
                          type="text"
                          value={draftTitle}
                          onChange={e => setDraftTitle(e.target.value)}
                          className="w-full text-sm font-bold border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1 block">Section Description</label>
                        <textarea
                          value={draftDescription}
                          onChange={e => setDraftDescription(e.target.value)}
                          rows={2}
                          className="w-full text-xs border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                        />
                      </div>

                      {/* Bullets */}
                      <div>
                        <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1 block">Scope of Work Bullets</label>
                        <div className="space-y-2">
                          {draftBullets.map((b, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-primary font-bold mt-2.5 shrink-0">•</span>
                              <textarea
                                value={b}
                                onChange={e => {
                                  const next = [...draftBullets];
                                  next[i] = e.target.value;
                                  setDraftBullets(next);
                                }}
                                rows={2}
                                className="flex-1 text-sm border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                              />
                              <button
                                onClick={() => setDraftBullets(prev => prev.filter((_, j) => j !== i))}
                                className="mt-2 p-1.5 text-muted-foreground hover:text-red-600 transition-colors"
                                title="Remove bullet"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => setDraftBullets(prev => [...prev, ''])}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
                          >
                            <Plus className="w-3.5 h-3.5" />Add bullet
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Line item detail table (view mode only) */}
                  {!isEditing && (
                    <>
                      {isExpanded && (
                        <div className="mt-3 rounded-lg border border-border overflow-hidden text-xs">
                          <table className="w-full">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Item</th>
                                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Qty</th>
                                <th className="text-right px-3 py-2 font-semibold text-muted-foreground hidden sm:table-cell">Materials</th>
                                <th className="text-right px-3 py-2 font-semibold text-muted-foreground hidden sm:table-cell">Labor</th>
                                <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {activeItems.map(item => {
                                const tierData = item.hasTiers ? item.tiers[item.tier] : null;
                                const laborRate = item.laborRate || state.global.laborRate;
                                const matHard = item.hasTiers ? tierData!.rate * item.qty * (1 + item.wastePct / 100) : 0;
                                const laborHard = item.laborMode === 'hr'
                                  ? item.hrsPerUnit * item.qty * laborRate
                                  : item.flatRatePerUnit * item.qty;
                                const itemHard = matHard + laborHard;
                                const markup = item.markupPct ?? state.global.markupPct;
                                const itemPrice = itemHard * markup;
                                const matPrice = matHard * markup;
                                const laborPrice = laborHard * markup;
                                return (
                                  <tr key={item.id} className="hover:bg-muted/30">
                                    <td className="px-3 py-2">
                                      <div className="font-medium text-foreground">{item.shortName}</div>
                                      {tierData && <div className="text-muted-foreground text-[10px]">{tierData.name}</div>}
                                    </td>
                                    <td className="px-3 py-2 text-right text-muted-foreground">{item.qty} {item.unitType}</td>
                                    <td className="px-3 py-2 text-right hidden sm:table-cell">{item.hasTiers ? fmtDollar(matPrice) : '—'}</td>
                                    <td className="px-3 py-2 text-right hidden sm:table-cell">{fmtDollar(laborPrice)}</td>
                                    <td className="px-3 py-2 text-right font-semibold">{fmtDollar(itemPrice)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Custom Request Items — rich cards with inline editing + AI rewrite */}
        {customResults.length > 0 && (
          <div className="px-6 py-5 border-t border-border">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">⚙️</span>
              <h3 className="font-bold text-base text-foreground">Custom Requests</h3>
              <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded px-1.5 py-0.5 no-print">{customResults.length} item{customResults.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">
              {customResults.map(cr => {
                const ci = state.customItems.find(c => c.id === cr.id)!;
                const isEditing = editingCustomItemId === ci.id;
                const phaseName = ALL_PHASES.find(p => p.id === ci.phaseId)?.name;
                return (
                  <div key={cr.id} className="rounded-xl border border-border bg-muted/30 overflow-hidden">
                    {!isEditing ? (
                      /* View mode */
                      <div className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-bold text-sm text-foreground">{ci.description}</span>
                              {phaseName && <span className="text-[10px] text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5">{phaseName}</span>}
                            </div>
                            {ci.notes && <p className="text-xs text-muted-foreground leading-relaxed">{ci.notes}</p>}
                          </div>
                          <div className="flex items-start gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-base font-black text-foreground mono">{fmtDollar(cr.price)}</div>
                              <div className="text-[10px] text-muted-foreground">Cost: {fmtDollar(ci.matCostPerUnit)} · {Math.round((ci.markupPct ?? 0) * 100)}% margin</div>
                            </div>
                            <button
                              onClick={() => startEditCustomItem(ci)}
                              title="Edit item"
                              className="no-print mt-0.5 p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Edit mode */
                      <div className="px-4 py-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Editing custom request</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleAiRewriteCustomItem(ci.id)}
                              disabled={aiRewritingCustom}
                              className="no-print flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 disabled:opacity-60 transition-colors"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {aiRewritingCustom ? 'Rewriting…' : 'AI Rewrite'}
                            </button>
                            <button
                              onClick={() => saveCustomItemEdit(ci.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />Save
                            </button>
                            <button
                              onClick={cancelCustomItemEdit}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />Cancel
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1 block">Title (shown to customer)</label>
                          <input
                            type="text"
                            value={draftCustomTitle}
                            onChange={e => setDraftCustomTitle(e.target.value)}
                            className="w-full text-sm font-bold border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1 block">Description / Scope Note</label>
                          <textarea
                            value={draftCustomDescription}
                            onChange={e => setDraftCustomDescription(e.target.value)}
                            rows={3}
                            className="w-full text-xs border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                          />
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Sell price: <span className="font-bold text-foreground mono">{fmtDollar(cr.price)}</span> · Cost: {fmtDollar(ci.matCostPerUnit)} · {Math.round((ci.markupPct ?? 0) * 100)}% margin
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tax toggle — no-print controls, visible on estimate doc */}
        <div className="px-6 py-4 border-t border-slate-700 bg-slate-800 no-print">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="tax-toggle"
                checked={taxEnabled}
                onCheckedChange={handleTaxToggle}
              />
              <Label htmlFor="tax-toggle" className="text-sm text-slate-200 cursor-pointer flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" />
                Include Sales Tax
              </Label>
            </div>
            {taxEnabled && (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Select
                  value={taxRateCode}
                  onValueChange={v => setGlobal({ taxRateCode: v })}
                >
                  <SelectTrigger className="h-8 text-xs bg-slate-700 border-slate-600 text-slate-100 w-56">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLARK_COUNTY_TAX_RATES.map(r => (
                      <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {taxRateCode === 'custom' && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" min={0} max={30} step={0.1}
                      value={customTaxPct}
                      onChange={e => setGlobal({ customTaxPct: Number(e.target.value) })}
                      className="h-8 w-20 text-xs bg-slate-700 border-slate-600 text-slate-100"
                    />
                    <span className="text-xs text-slate-400">%</span>
                  </div>
                )}
                {state.jobInfo.zip && getTaxRateForZip(state.jobInfo.zip) && (
                  <button
                    onClick={() => {
                      const info = getTaxRateForZip(state.jobInfo.zip);
                      if (info) setGlobal({ taxRateCode: info.code });
                    }}
                    className="text-xs text-slate-400 hover:text-slate-200 underline whitespace-nowrap"
                  >
                    Auto-fill from ZIP {state.jobInfo.zip}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Total investment */}
        <div className="px-6 py-5 bg-slate-900 text-white">
          <div className="flex items-center justify-between">
            <div>
              {taxRateInfo ? (
                <>
                  <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-1">Subtotal</div>
                  <div className="text-xl font-bold mono text-slate-300 mb-2">{fmtDollar(totals.totalPrice)}</div>
                  <div className="text-xs text-slate-400 mb-2">
                    Sales Tax ({taxRateInfo.label}): {fmtDollar(taxAmount)}
                  </div>
                  <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-1">Total Investment</div>
                  <div className="text-3xl font-black mono">{fmtDollar(grandTotal)}</div>
                </>
              ) : (
                <>
                  <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-1">Total Investment</div>
                  <div className="text-3xl font-black mono">{fmtDollar(totals.totalPrice)}</div>
                </>
              )}
              {showMatLabor && totals.totalHard > 0 && (
                <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                  <div>Materials: {fmtDollar(activePhaseData.reduce((s, d) => s + d.result.matPrice, 0))}</div>
                  <div>Labor: {fmtDollar(activePhaseData.reduce((s, d) => s + d.result.laborPrice, 0))}</div>
                </div>
              )}
            </div>
            <div className="text-right text-xs text-slate-400 space-y-1">
              <div>{activePhaseData.length} trade{activePhaseData.length !== 1 ? 's' : ''} included</div>
              {customResults.length > 0 && <div>+ {customResults.length} custom item{customResults.length !== 1 ? 's' : ''}</div>}
              {taxRateInfo && <div className="text-emerald-400 font-semibold">Tax incl.</div>}
            </div>
          </div>
        </div>

        {/* Terms — abbreviated with T&C link */}
        <div className="px-6 py-5 border-t border-border bg-slate-50">
          <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-3">Terms &amp; Conditions</div>
          <ul className="space-y-1.5 text-sm text-foreground mb-3">
            <li className="flex items-start gap-2"><span className="text-primary shrink-0 font-bold">•</span>{depositLabel}</li>
            <li className="flex items-start gap-2"><span className="text-primary shrink-0 font-bold">•</span>This estimate is valid for 30 days from the date above</li>
            <li className="flex items-start gap-2"><span className="text-primary shrink-0 font-bold">•</span>All work is guaranteed — 1-year workmanship warranty on labor</li>
            <li className="flex items-start gap-2"><span className="text-primary shrink-0 font-bold">•</span>Any changes to scope will be documented in a written change order before work proceeds</li>
            <li className="flex items-start gap-2"><span className="text-primary shrink-0 font-bold">•</span>Handy Pioneers is fully licensed and insured in the State of Washington (License: {HP_COMPANY.license})</li>
          </ul>
          <button
            onClick={() => setShowTC(true)}
            className="no-print flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            View Full Terms &amp; Conditions
          </button>
        </div>

        {/* Note for client */}
        <div className="px-6 py-4 border-t border-border">
          <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">Note for Client</div>
          <textarea
            value={state.clientNote}
            onChange={e => setClientNote(e.target.value)}
            placeholder="Add a personalized note — e.g. 'Thank you for the opportunity to work on your home. We look forward to making your vision a reality!'"
            className="w-full text-sm border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground placeholder:text-muted-foreground"
            rows={3}
          />
        </div>

        {/* Internal notes */}
        <div className="px-6 py-4 border-t border-border no-print">
          <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">Internal Notes (not shown to client)</div>
          <textarea
            value={state.summaryNotes}
            onChange={e => setSummaryNotes(e.target.value)}
            placeholder="Scope exclusions, sub notes, material lead times, etc."
            className="w-full text-sm border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground placeholder:text-muted-foreground"
            rows={2}
          />
        </div>

        {/* Signature block (if signed) */}
        {state.signature && (
          <div className="px-6 py-5 border-t border-border bg-emerald-50">
            <div className="text-xs uppercase tracking-widest font-bold text-emerald-800 mb-3">Client Acceptance</div>
            <div className="flex items-start gap-6">
              <div className="flex-1">
                <div className="border border-emerald-200 rounded-lg p-2 bg-white inline-block">
                  <img src={state.signature} alt="Client signature" className="max-h-16 object-contain" />
                </div>
                <div className="text-xs text-emerald-700 mt-1 font-semibold">{state.signedBy}</div>
                <div className="text-xs text-muted-foreground">{state.signedAt ? new Date(state.signedAt).toLocaleString() : ''}</div>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Accepted — {fmtDollar(totals.totalPrice)}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <img src={HP_LOGO} alt="Handy Pioneers" className="h-8 w-8 object-contain rounded" />
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Handy Pioneers, LLC</span>
              {' · '}Vancouver, WA · Licensed &amp; Insured
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            <a href="tel:(360)544-9858" className="hover:text-primary">(360) 544-9858</a>
            {' · '}
            <a href="mailto:help@handypioneers.com" className="hover:text-primary">help@handypioneers.com</a>
          </div>
        </div>
      </div>

    </div>
  );
}
