import { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, ChevronRight, CreditCard, FileText, Home, ShieldCheck, Wrench } from 'lucide-react';
import {
  THREE_SIXTY_METHOD_PHASES,
  deriveThreeSixtyMembershipEnginePlan,
  deriveThreeSixtyOperatingStatus,
  getCustomerFacingStepAction,
  inferOpportunityThreeSixtyStep,
  type ThreeSixtyPhaseId,
} from '@/lib/threeSixtyMethod';

type PortalEstimate = {
  id: number | string;
  status: string;
  title?: string | null;
  totalAmount?: number;
  hpOpportunityId?: string | null;
};

type PortalInvoice = {
  id: number | string;
  status: string;
  invoiceNumber?: string | null;
  amountDue?: number | null;
  amountPaid?: number | null;
};

type PortalAppointment = {
  id: number | string;
  status: string;
  title?: string | null;
  scheduledAt: number | Date;
};

interface PortalProperty360PlanProps {
  propertyLabel?: string | null;
  propertyAddress?: string | null;
  membershipData?: any;
  estimates: PortalEstimate[];
  invoices: PortalInvoice[];
  appointments: PortalAppointment[];
  activeJobs: PortalEstimate[];
  onNavigate: (path: string) => void;
}

function fmtMoney(cents = 0) {
  return `$${(cents / 100).toFixed(0)}`;
}

function statusClass(status: 'complete' | 'current' | 'upcoming') {
  if (status === 'complete') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'current') return 'border-[#c8922a] bg-[#fff8e6] text-[#6d4d0f]';
  return 'border-gray-200 bg-white text-gray-500';
}

export default function PortalProperty360Plan({
  propertyLabel,
  propertyAddress,
  membershipData,
  estimates,
  invoices,
  appointments,
  activeJobs,
  onNavigate,
}: PortalProperty360PlanProps) {
  const status = deriveThreeSixtyOperatingStatus({ membershipData });
  const engine = deriveThreeSixtyMembershipEnginePlan(status);
  const [activePhase, setActivePhase] = useState<ThreeSixtyPhaseId>(status.currentPhase);
  const openInvoice = invoices.find(invoice => invoice.status !== 'paid');
  const pendingEstimate = estimates.find(estimate => estimate.status === 'sent' || estimate.status === 'viewed');
  const nextAppointment = appointments
    .filter(appt => appt.status === 'scheduled' && new Date(appt.scheduledAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

  const phase = THREE_SIXTY_METHOD_PHASES.find(item => item.id === activePhase) ?? THREE_SIXTY_METHOD_PHASES[0];
  const actionCountByStep = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const estimate of estimates) {
      const step = inferOpportunityThreeSixtyStep({
        area: estimate.hpOpportunityId ? 'job' : 'estimate',
        stage: estimate.status === 'approved' ? 'Approved' : 'Sent',
        title: estimate.title ?? '',
      });
      counts[step.key] = (counts[step.key] ?? 0) + 1;
    }
    if (nextAppointment) counts.schedule = (counts.schedule ?? 0) + 1;
    if (activeJobs.length > 0) counts.execute = (counts.execute ?? 0) + activeJobs.length;
    if (openInvoice) counts.track = (counts.track ?? 0) + 1;
    return counts;
  }, [activeJobs.length, estimates, nextAppointment, openInvoice]);

  const primaryAction = (() => {
    if (openInvoice) {
      const balance = (openInvoice.amountDue ?? 0) - (openInvoice.amountPaid ?? 0);
      return {
        icon: CreditCard,
        label: 'Payment ready',
        title: `Review ${openInvoice.invoiceNumber ?? 'your invoice'}`,
        body: `Balance due: ${fmtMoney(balance)}.`,
        button: 'Review invoice',
        path: `/portal/invoices/${openInvoice.id}`,
      };
    }
    if (pendingEstimate) {
      return {
        icon: FileText,
        label: 'Approval needed',
        title: pendingEstimate.title ?? 'Your estimate is ready',
        body: 'Review the scope, ask a question, or approve when you are ready.',
        button: 'View estimate',
        path: `/portal/estimates/${pendingEstimate.id}`,
      };
    }
    if (nextAppointment) {
      return {
        icon: Calendar,
        label: 'Upcoming visit',
        title: nextAppointment.title ?? 'Your visit is scheduled',
        body: 'View details or message us if the appointment needs to change.',
        button: 'View appointment',
        path: '/portal/appointments',
      };
    }
    if (activeJobs[0]?.hpOpportunityId) {
      return {
        icon: Wrench,
        label: 'Work in progress',
        title: activeJobs[0].title ?? 'Your job is in motion',
        body: 'Track updates, completion notes, and documents here.',
        button: 'View job',
        path: `/portal/job/${activeJobs[0].hpOpportunityId}`,
      };
    }
    return {
      icon: ShieldCheck,
      label: engine.current.label,
      title: status.currentStep.customerLabel,
      body: status.nextCustomerAction,
      button: 'Open home care',
      path: '/portal/360-membership',
    };
  })();
  const PrimaryIcon = primaryAction.icon;

  return (
    <section className="rounded-2xl border border-[#d9c28b] bg-white shadow-sm overflow-hidden">
      <div className="bg-[#1a2e1a] px-4 py-5 text-white sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#e2b96a]">
            <Home className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#e2b96a]">My Property Plan</p>
            <h2 className="mt-1 text-xl font-bold leading-tight">{propertyLabel || 'Primary home'}</h2>
            {propertyAddress && <p className="mt-1 truncate text-sm text-white/70">{propertyAddress}</p>}
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-white/10 p-3">
          <div className="flex items-start gap-3">
            <PrimaryIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#e2b96a]" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#e2b96a]">{primaryAction.label}</p>
              <p className="mt-1 text-sm font-semibold">{primaryAction.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/75">{primaryAction.body}</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate(primaryAction.path)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#c8922a] px-3 py-2.5 text-sm font-bold text-white"
          >
            {primaryAction.button}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2">
          {THREE_SIXTY_METHOD_PHASES.map(item => {
            const isActive = item.id === activePhase;
            return (
              <button
                key={item.id}
                onClick={() => setActivePhase(item.id)}
                className={`rounded-xl border px-2 py-3 text-left transition-colors ${
                  isActive ? 'border-[#c8922a] bg-[#fff8e6]' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <p className={`text-sm font-bold ${isActive ? 'text-[#1a2e1a]' : 'text-gray-700'}`}>{item.name}</p>
                <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-gray-500">{item.promise}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-2">
          {phase.steps.map(step => {
            const stepStatus = step.number < status.currentStep.number ? 'complete' : step.number === status.currentStep.number ? 'current' : 'upcoming';
            const count = actionCountByStep[step.key] ?? 0;
            return (
              <div key={step.key} className={`rounded-xl border p-3 ${statusClass(stepStatus)}`}>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black">
                    {stepStatus === 'complete' ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : step.number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold">{step.customerLabel}</p>
                        <p className="mt-0.5 text-xs leading-relaxed opacity-80">{getCustomerFacingStepAction(step)}</p>
                      </div>
                      {count > 0 && (
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold">
                          {count}
                        </span>
                      )}
                    </div>
                    {step.key === 'prioritize' && (
                      <button
                        onClick={() => onNavigate('/portal/roadmap')}
                        className="mt-3 inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#1a2e1a] px-3 py-2 text-xs font-bold text-white"
                      >
                        View 360 Roadmap
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-2 py-3 text-center">
            <p className="text-base font-black text-[#1a2e1a]">{status.healthScore ?? '--'}</p>
            <p className="text-[10px] text-gray-500">Home score</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-2 py-3 text-center">
            <p className="text-base font-black text-[#1a2e1a]">{fmtMoney(status.laborBankBalanceCents)}</p>
            <p className="text-[10px] text-gray-500">Labor bank</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-2 py-3 text-center">
            <p className="text-base font-black text-[#1a2e1a]">{status.seasonalVisits.filter(visit => visit.status === 'due' || visit.status === 'scheduled').length}</p>
            <p className="text-[10px] text-gray-500">Visits</p>
          </div>
        </div>

        {phase.id === 'advance' && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-800">Property Value Intelligence</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
              This is a maintenance and property history summary. It is not financial, appraisal, tax, legal, or real estate advice.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
