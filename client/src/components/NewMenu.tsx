// ============================================================
// NewMenu — "New" button dropdown
// Design: Dark charcoal popover (matching the reference image)
//         with 7 items: Job, Recurring Job, Estimate, Event,
//         Customer, Intake, Lead. Closes on outside click or
//         item selection.
// ============================================================

import { useEffect, useRef } from 'react';
import {
  Briefcase, RefreshCw, FileText, Calendar,
  UserPlus, ClipboardList, Star,
} from 'lucide-react';

export type NewMenuAction =
  | 'job'
  | 'recurring-job'
  | 'estimate'
  | 'event'
  | 'customer'
  | 'intake'
  | 'lead';

interface Props {
  onSelect: (action: NewMenuAction) => void;
  onClose: () => void;
}

const MENU_ITEMS: { action: NewMenuAction; icon: React.ElementType; label: string }[] = [
  { action: 'job',           icon: Briefcase,     label: 'Job'           },
  { action: 'recurring-job', icon: RefreshCw,     label: 'Recurring Job' },
  { action: 'estimate',      icon: FileText,      label: 'Estimate'      },
  { action: 'event',         icon: Calendar,      label: 'Event'         },
  { action: 'customer',      icon: UserPlus,      label: 'Customer'      },
  { action: 'intake',        icon: ClipboardList, label: 'Intake'        },
  { action: 'lead',          icon: Star,          label: 'Lead'          },
];

export default function NewMenu({ onSelect, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Use capture so it fires before other handlers
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute top-full left-0 mt-1.5 w-48 rounded-xl overflow-hidden shadow-2xl z-50
                 bg-[#1e2028] border border-white/10"
      style={{ minWidth: '160px' }}
    >
      {MENU_ITEMS.map(({ action, icon: Icon, label }) => (
        <button
          key={action}
          onClick={() => { onSelect(action); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-white/90
                     hover:bg-white/10 hover:text-white transition-colors text-left"
        >
          <Icon size={15} className="text-white/50 shrink-0" />
          {label}
        </button>
      ))}
    </div>
  );
}
