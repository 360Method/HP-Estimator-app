import { useState } from 'react';
import { Bell, Save } from 'lucide-react';
import { toast } from 'sonner';

interface NotifRow {
  id: string;
  label: string;
  description: string;
  email: boolean;
  sms: boolean;
  inApp: boolean;
}

const DEFAULT_NOTIFS: NotifRow[] = [
  { id: 'new-lead',        label: 'New lead received',           description: 'When a new lead is created',                   email: true,  sms: true,  inApp: true  },
  { id: 'lead-assigned',   label: 'Lead assigned to you',        description: 'When a lead is assigned to your account',      email: true,  sms: false, inApp: true  },
  { id: 'estimate-sent',   label: 'Estimate sent',               description: 'When an estimate is sent to a customer',       email: true,  sms: false, inApp: true  },
  { id: 'estimate-viewed', label: 'Estimate viewed',             description: 'When a customer opens your estimate',          email: false, sms: false, inApp: true  },
  { id: 'estimate-signed', label: 'Estimate signed / approved',  description: 'When a customer approves an estimate',         email: true,  sms: true,  inApp: true  },
  { id: 'job-created',     label: 'Job created',                 description: 'When a new job is created',                    email: true,  sms: false, inApp: true  },
  { id: 'job-scheduled',   label: 'Job scheduled',               description: 'When a job is added to the schedule',          email: true,  sms: true,  inApp: true  },
  { id: 'job-completed',   label: 'Job completed',               description: 'When a job is marked as completed',            email: true,  sms: false, inApp: true  },
  { id: 'invoice-sent',    label: 'Invoice sent',                description: 'When an invoice is sent to a customer',        email: true,  sms: false, inApp: true  },
  { id: 'invoice-paid',    label: 'Invoice paid',                description: 'When a payment is received',                   email: true,  sms: true,  inApp: true  },
  { id: 'task-due',        label: 'Task due soon',               description: 'When a job task is due within 24 hours',       email: false, sms: false, inApp: true  },
  { id: 'review-received', label: 'Customer review received',    description: 'When a customer leaves a review',              email: true,  sms: false, inApp: true  },
];

export default function NotificationsSettings() {
  const [notifs, setNotifs] = useState<NotifRow[]>(DEFAULT_NOTIFS);

  const toggle = (id: string, channel: 'email' | 'sms' | 'inApp') => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, [channel]: !n[channel] } : n));
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted border border-border'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Notifications</h2>

      <section className="card-section">
        <div className="card-section-header">
          <Bell size={13} />
          <span className="text-xs font-bold uppercase tracking-wider">Notification Preferences</span>
        </div>
        <div className="card-section-body">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 pb-2 border-b border-border mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Event</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-10 text-center">Email</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-10 text-center">SMS</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-10 text-center">In-App</span>
          </div>
          <div className="divide-y divide-border/60">
            {notifs.map(n => (
              <div key={n.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{n.label}</p>
                  <p className="text-xs text-muted-foreground">{n.description}</p>
                </div>
                <div className="w-10 flex justify-center"><Toggle checked={n.email} onChange={() => toggle(n.id, 'email')} /></div>
                <div className="w-10 flex justify-center"><Toggle checked={n.sms} onChange={() => toggle(n.id, 'sms')} /></div>
                <div className="w-10 flex justify-center"><Toggle checked={n.inApp} onChange={() => toggle(n.id, 'inApp')} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <button
        onClick={() => toast.success('Notification preferences saved')}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
      >
        <Save size={14} /> Save Preferences
      </button>
    </div>
  );
}
