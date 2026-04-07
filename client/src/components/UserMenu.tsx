// ============================================================
// UserMenu — Avatar dropdown for the header
// Items: My Account, My Tasks, Help, Keyboard Shortcuts, Sign Out
// ============================================================

import { useEffect, useRef } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  User, CheckSquare, HelpCircle, Keyboard, LogOut,
  Settings, ChevronRight,
} from 'lucide-react';

export type UserMenuAction =
  | 'my-account'
  | 'my-tasks'
  | 'help'
  | 'keyboard-shortcuts'
  | 'settings'
  | 'sign-out';

interface Props {
  onSelect: (action: UserMenuAction) => void;
  onClose: () => void;
}

const TEAM_COLORS = [
  '#e07b39', '#3b82f6', '#10b981', '#8b5cf6',
  '#ef4444', '#f59e0b', '#06b6d4', '#ec4899',
];

export default function UserMenu({ onSelect, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { state } = useEstimator();
  const profile = state.userProfile;

  const initials = [profile.firstName[0], profile.lastName[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase() || 'HP';

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute top-full right-0 mt-1.5 w-64 rounded-xl shadow-2xl z-[200]
                 bg-popover border border-border overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 80px)' }}
    >
      {/* Profile header */}
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={initials}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: profile.teamColor }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {profile.firstName} {profile.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{profile.role}</p>
            <p className="text-[11px] text-muted-foreground truncate">{profile.email}</p>
          </div>
        </div>
      </div>

      {/* Menu items */}
      <div className="py-1">
        <MenuItem icon={User} label="My Account" action="my-account" onSelect={onSelect} onClose={onClose} />
        <MenuItem icon={CheckSquare} label="My Tasks" action="my-tasks" onSelect={onSelect} onClose={onClose} />
        <div className="my-1 border-t border-border/60" />
        <MenuItem icon={Settings} label="Settings" action="settings" onSelect={onSelect} onClose={onClose} />
        <MenuItem icon={HelpCircle} label="Help & Support" action="help" onSelect={onSelect} onClose={onClose} />
        <MenuItem icon={Keyboard} label="Keyboard Shortcuts" action="keyboard-shortcuts" onSelect={onSelect} onClose={onClose} />
        <div className="my-1 border-t border-border/60" />
        <button
          onClick={() => { onSelect('sign-out'); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400
                     hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left"
        >
          <LogOut size={15} className="flex-shrink-0" />
          Sign Out
        </button>
      </div>

      {/* Color swatches preview */}
      <div className="px-4 py-2.5 border-t border-border/60 bg-muted/20">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Team Color</p>
        <div className="flex gap-1.5">
          {TEAM_COLORS.map(color => (
            <div
              key={color}
              className="w-5 h-5 rounded-full cursor-pointer ring-2 ring-transparent hover:ring-foreground/30 transition-all"
              style={{
                backgroundColor: color,
                outline: profile.teamColor === color ? `2px solid ${color}` : 'none',
                outlineOffset: '2px',
              }}
              title={color}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon, label, action, onSelect, onClose,
}: {
  icon: React.ElementType;
  label: string;
  action: UserMenuAction;
  onSelect: (a: UserMenuAction) => void;
  onClose: () => void;
}) {
  return (
    <button
      onClick={() => { onSelect(action); onClose(); }}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-foreground
                 hover:bg-muted/60 transition-colors text-left group"
    >
      <Icon size={15} className="text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />
      <span className="flex-1">{label}</span>
      <ChevronRight size={12} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    </button>
  );
}
