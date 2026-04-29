/**
 * VisionBanner — operator-facing reminder of the company mission.
 *
 * Sits at the top of the admin home (and only admin home) until the
 * operator dismisses it for the session. Quiet, refined, no buttons.
 *
 * Why: Marcin's directive — every internal touchpoint should reflect
 * the same Ritz-Carlton standard the customers experience. The operator
 * is the steward; this banner reminds them what they are stewarding.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { brandMission } from '@/lib/brand';

const SESSION_KEY = 'hp_vision_banner_dismissed';

export default function VisionBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // ignore storage errors
    }
    setDismissed(true);
  };

  return (
    <div className="hp-vision-banner px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
          <span className="hp-eyebrow">Our Standard</span>
          <p className="hp-serif text-base sm:text-lg" style={{ color: 'var(--hp-ink)' }}>
            {brandMission.oneLiner}{' '}
            <span className="text-[var(--hp-slate)] font-normal">{brandMission.context}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss vision banner"
          className="shrink-0 p-2 rounded-full text-[var(--hp-mist)] hover:text-[var(--hp-ink)] hover:bg-[var(--hp-cream-soft)] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
