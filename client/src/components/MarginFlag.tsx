// ============================================================
// MarginFlag — Inline margin status badge
// ============================================================

import { getMarginFlag, getMarginLabel } from '@/lib/calc';

interface MarginFlagProps {
  gm: number;
  hardCost: number;
  price: number;
  size?: 'sm' | 'md';
}

export default function MarginFlag({ gm, hardCost, price, size = 'md' }: MarginFlagProps) {
  const flag = getMarginFlag(gm, hardCost);
  const label = getMarginLabel(gm, hardCost, price);

  const styles = {
    ok:    'flag-ok',
    warn:  'flag-warn',
    bad:   'flag-bad',
    empty: 'flag-empty',
  };

  const icons = {
    ok:    '✓',
    warn:  '⚠',
    bad:   '✕',
    empty: '○',
  };

  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs';
  const padding = size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${textSize} ${padding} ${styles[flag]}`}>
      <span className="font-bold">{icons[flag]}</span>
      {label}
    </span>
  );
}
