// Activity-event icon — extracted verbatim from CustomerSection.tsx (Phase D).
import { type ReactNode } from 'react';
import {
  FileText, Send, CheckCircle2, Briefcase, Edit3, PhoneCall, DollarSign,
  ArrowRight, Activity,
} from 'lucide-react';

export default function ActivityIcon({ type }: { type: string }) {
  const map: Record<string, ReactNode> = {
    estimate_created: <FileText size={13} className="text-blue-600" />,
    estimate_sent: <Send size={13} className="text-sky-600" />,
    estimate_approved: <CheckCircle2 size={13} className="text-emerald-600" />,
    job_created: <Briefcase size={13} className="text-violet-600" />,
    note_added: <Edit3 size={13} className="text-amber-600" />,
    call_logged: <PhoneCall size={13} className="text-teal-600" />,
    payment_received: <DollarSign size={13} className="text-emerald-600" />,
    stage_changed: <ArrowRight size={13} className="text-gray-500" />,
  };
  return (
    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
      {map[type] ?? <Activity size={13} className="text-muted-foreground" />}
    </div>
  );
}
