import { Calendar, CheckCircle2, ChevronRight, CreditCard, FileText, MessageSquare, RefreshCw, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  deriveThreeSixtyMembershipEnginePlan,
  deriveThreeSixtyOperatingStatus,
} from '@/lib/threeSixtyMethod';

type Estimate = {
  id: number | string;
  status: string;
  title?: string | null;
  totalAmount?: number;
  hpOpportunityId?: string | null;
};

type Invoice = {
  id: number | string;
  status: string;
  invoiceNumber?: string | null;
  amountDue?: number | null;
  amountPaid?: number | null;
  dueDate?: number | Date | null;
};

type Appointment = {
  id: number | string;
  status: string;
  title?: string | null;
  scheduledAt: number | Date;
};

interface PortalWhatsNextProps {
  estimates: Estimate[];
  invoices: Invoice[];
  appointments: Appointment[];
  activeJobs: Estimate[];
  membershipData?: any;
  onNavigate: (path: string) => void;
}

function fmtMoney(cents = 0) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(value: number | Date) {
  return new Date(value).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function PortalWhatsNext({
  estimates,
  invoices,
  appointments,
  activeJobs,
  membershipData,
  onNavigate,
}: PortalWhatsNextProps) {
  const pendingEstimate = estimates.find(est => est.status === 'sent' || est.status === 'viewed');
  const openInvoice = invoices.find(inv => inv.status !== 'paid');
  const nextAppointment = appointments
    .filter(appt => appt.status === 'scheduled' && new Date(appt.scheduledAt).getTime() >= Date.now())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];
  const activeJob = activeJobs[0];
  const membershipStatus = membershipData ? deriveThreeSixtyOperatingStatus({ membershipData }) : null;
  const membershipPlan = membershipStatus ? deriveThreeSixtyMembershipEnginePlan(membershipStatus) : null;

  const priority = (() => {
    if (openInvoice) {
      const balance = (openInvoice.amountDue ?? 0) - (openInvoice.amountPaid ?? 0);
      return {
        icon: CreditCard,
        eyebrow: 'Payment ready',
        title: 'An invoice is ready for review.',
        body: `${openInvoice.invoiceNumber ?? 'Your invoice'} has a balance of ${fmtMoney(balance)}. You can review and pay securely here.`,
        button: 'Review invoice',
        path: `/portal/invoices/${openInvoice.id}`,
      };
    }
    if (pendingEstimate) {
      return {
        icon: FileText,
        eyebrow: 'Decision step',
        title: 'Your estimate is ready.',
        body: `${pendingEstimate.title ?? 'Your project estimate'} is waiting for your review. Approve it, ask a question, or message us for guidance.`,
        button: 'View estimate',
        path: `/portal/estimates/${pendingEstimate.id}`,
      };
    }
    if (nextAppointment) {
      return {
        icon: Calendar,
        eyebrow: 'Upcoming visit',
        title: `We will see you ${fmtDate(nextAppointment.scheduledAt)}.`,
        body: `${nextAppointment.title ?? 'Your appointment'} is scheduled. You can check details or message us if anything changes.`,
        button: 'View appointment',
        path: '/portal/appointments',
      };
    }
    if (activeJob?.hpOpportunityId) {
      return {
        icon: Wrench,
        eyebrow: 'Project underway',
        title: 'Your job is in motion.',
        body: `${activeJob.title ?? 'Your project'} is being managed by the Handy Pioneers team. Updates and documents live here.`,
        button: 'View job',
        path: `/portal/job/${activeJob.hpOpportunityId}`,
      };
    }
    if (membershipData) {
      return {
        icon: RefreshCw,
        eyebrow: membershipPlan?.current.label ?? 'Home care plan',
        title: 'Your 360 Home Method plan is active.',
        body: membershipPlan
          ? `${membershipPlan.current.customerAction} You have ${fmtMoney(membershipData.laborBankBalance ?? 0)} in labor bank value available for this home.`
          : `You have ${fmtMoney(membershipData.laborBankBalance ?? 0)} in labor bank value and seasonal care available for this home.`,
        button: 'Open home care plan',
        path: '/portal/360-membership',
      };
    }
    return {
      icon: RefreshCw,
      eyebrow: 'Protect your home',
      title: 'Make home care easier with the 360 Home Method.',
      body: 'Seasonal visits, labor bank value, member discounts, and home health reports keep small issues from becoming expensive surprises.',
      button: 'See home care plan',
      path: '/portal/360-membership',
    };
  })();

  const Icon = priority.icon;

  return (
    <div className="rounded-xl border border-[#d9c28b] bg-[#fffaf0] p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1a2e1a] text-[#e2b96a]">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a6a1f]">{priority.eyebrow}</p>
            <h2 className="mt-1 text-lg font-bold text-[#1a2e1a]">{priority.title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-600">{priority.body}</p>
          </div>
        </div>
        <Button
          className="bg-[#1a2e1a] text-white hover:bg-[#2d4a2d] sm:shrink-0"
          onClick={() => onNavigate(priority.path)}
        >
          {priority.button}
          <ChevronRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
      {membershipPlan && (
        <div className="mt-4 rounded-lg border border-[#d9c28b]/70 bg-white px-3 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8a6a1f]">360 Method status</p>
              <p className="mt-1 text-sm font-semibold text-[#1a2e1a]">{membershipPlan.current.label}</p>
              <p className="mt-0.5 text-xs text-gray-600">{membershipPlan.current.customerAction}</p>
            </div>
            {membershipPlan.next && (
              <div className="rounded-md bg-[#f9f2df] px-3 py-2 text-xs text-[#1a2e1a]">
                Next: <span className="font-semibold">{membershipPlan.next.label}</span>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button onClick={() => onNavigate('/portal/messages')} className="flex items-center justify-center gap-1.5 rounded-lg border border-[#d9c28b]/70 bg-white px-3 py-2 text-xs font-semibold text-[#1a2e1a] hover:bg-[#f9f2df]">
          <MessageSquare className="h-3.5 w-3.5" />
          Message us
        </button>
        <button onClick={() => onNavigate('/portal/request')} className="flex items-center justify-center gap-1.5 rounded-lg border border-[#d9c28b]/70 bg-white px-3 py-2 text-xs font-semibold text-[#1a2e1a] hover:bg-[#f9f2df]">
          <Wrench className="h-3.5 w-3.5" />
          Request work
        </button>
        <button onClick={() => onNavigate('/portal/360-membership')} className="flex items-center justify-center gap-1.5 rounded-lg border border-[#d9c28b]/70 bg-white px-3 py-2 text-xs font-semibold text-[#1a2e1a] hover:bg-[#f9f2df]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Home care
        </button>
      </div>
    </div>
  );
}
