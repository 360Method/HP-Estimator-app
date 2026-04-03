// ============================================================
// MetricsBar — App header + slim metrics context bar
// Design: Full app header with logo, search, and backend nav
//         icons (placeholders for future backend modules).
//         Financial metrics (hard cost, price, GM, GP) live in
//         a slim context bar above the estimator section tabs.
// ============================================================

import { useState } from 'react';
import { fmtDollar, fmtPct, getMarginFlag, TotalsResult } from '@/lib/calc';
import { useEstimator } from '@/contexts/EstimatorContext';
import { AppSection } from '@/lib/types';
import { toast } from 'sonner';
import {
  Search, LayoutDashboard, Users, Inbox, GitBranch,
  DollarSign, BarChart2, Megaphone, Settings, UserCircle,
  ChevronDown,
} from 'lucide-react';

const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';

interface MetricsBarProps {
  totals: TotalsResult;
}

const NAV_ITEMS: { id: AppSection; icon: string; label: string; shortLabel: string }[] = [
  { id: 'customer',   icon: '👤', label: 'Customer Info', shortLabel: 'Client'   },
  { id: 'sales',      icon: '🛍', label: 'Sales View',   shortLabel: 'Sales'    },
  { id: 'calculator', icon: '🧮', label: 'Calculator',   shortLabel: 'Calc'     },
  { id: 'estimate',   icon: '📄', label: 'Estimate',     shortLabel: 'Estimate' },
];

// Backend module nav items — placeholders for future backend
const BACKEND_NAV = [
  { icon: LayoutDashboard, label: 'Dashboard'  },
  { icon: Users,           label: 'Customers'  },
  { icon: Inbox,           label: 'Inbox'      },
  { icon: GitBranch,       label: 'Pipeline'   },
  { icon: DollarSign,      label: 'Financials' },
  { icon: BarChart2,       label: 'Reporting'  },
  { icon: Megaphone,       label: 'Marketing'  },
];

export default function MetricsBar({ totals }: MetricsBarProps) {
  const { totalHard, totalPrice, totalGP, totalGM } = totals;
  const { state, setSection, reset } = useEstimator();
  const [searchQuery, setSearchQuery] = useState('');

  const minGM = totalHard < 2000 ? 0.40 : 0.30;
  const gmFlag = getMarginFlag(totalGM, totalHard);

  // Hide internal cost data on customer-facing screens
  const isCustomerFacing = state.activeSection === 'sales' || state.activeSection === 'estimate';

  const gmColor = {
    empty: 'text-muted-foreground',
    ok:    'text-emerald-600',
    warn:  'text-amber-600',
    bad:   'text-red-600',
  }[gmFlag];

  const handleReset = () => {
    if (window.confirm('Clear all estimate data and start fresh?')) {
      reset();
      toast.success('Estimate cleared — ready for a new job');
    }
  };

  const handleBackendNav = (label: string) => {
    toast.info(`${label} — coming soon`, { description: 'This module is part of the upcoming HP backend.' });
  };

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-border shadow-sm no-print">

      {/* ── TOP APP HEADER ─────────────────────────────────────── */}
      <div className="container">
        <div className="flex items-center gap-3 h-14">

          {/* Logo + wordmark */}
          <div className="flex items-center gap-2.5 shrink-0 mr-2">
            <img src={HP_LOGO} alt="Handy Pioneers" className="w-8 h-8 object-contain rounded" />
            <div className="hidden sm:block">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Handy Pioneers</div>
              <div className="text-xs font-bold text-foreground leading-tight">Field Estimator</div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-border shrink-0 hidden sm:block" />

          {/* Search bar */}
          <div className="flex-1 max-w-xs relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search estimates, clients…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/60 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Backend module nav icons */}
          <nav className="hidden md:flex items-center gap-0.5">
            {BACKEND_NAV.map(({ icon: Icon, label }) => (
              <button
                key={label}
                onClick={() => handleBackendNav(label)}
                title={label}
                className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors group"
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9px] font-semibold leading-none opacity-0 group-hover:opacity-100 transition-opacity absolute mt-8 bg-foreground text-background px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap pointer-events-none">
                  {label}
                </span>
              </button>
            ))}
          </nav>

          {/* Divider */}
          <div className="h-6 w-px bg-border shrink-0 hidden md:block" />

          {/* Settings + My Account */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleBackendNav('Settings')}
              title="Settings"
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleBackendNav('My Account')}
              title="My Account"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <UserCircle className="w-5 h-5" />
              <ChevronDown className="w-3 h-3 hidden sm:block" />
            </button>
          </div>

          {/* Reset button */}
          <button
            onClick={handleReset}
            className="shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-destructive border border-border hover:border-destructive/50 px-2.5 py-1 rounded-md transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* ── SLIM METRICS CONTEXT BAR ───────────────────────────── */}
      {/* Hidden on customer-facing screens; shows financial summary for estimator */}
      {!isCustomerFacing && totalPrice > 0 && (
        <div className="bg-slate-50 border-t border-border">
          <div className="container">
            <div className="flex items-center gap-5 py-1.5 text-xs overflow-x-auto">
              <span className="text-muted-foreground shrink-0">This estimate:</span>
              <MetricPill label="Hard Cost" value={fmtDollar(totalHard)} sub="internal" />
              <div className="h-4 w-px bg-border shrink-0" />
              <MetricPill label="Customer Price" value={fmtDollar(totalPrice)} sub="all phases" bold />
              <div className="h-4 w-px bg-border shrink-0" />
              <MetricPill
                label="GM"
                value={fmtPct(totalGM)}
                sub={totalGM >= minGM - 0.001 ? `${Math.round(minGM * 100)}% floor ✓` : `${Math.round(minGM * 100)}% floor ✗`}
                valueClass={gmColor}
              />
              <div className="h-4 w-px bg-border shrink-0" />
              <MetricPill label="Gross Profit" value={fmtDollar(totalGP)} sub="price − cost" />
            </div>
          </div>
        </div>
      )}

      {/* ── ESTIMATOR SECTION TABS ─────────────────────────────── */}
      <div className="border-t border-border bg-white">
        <div className="container">
          <div className="flex -mx-4 px-0">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold border-b-2 transition-colors min-w-0 ${
                  state.activeSection === item.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-sm leading-none">{item.icon}</span>
                <span className="leading-none hidden sm:inline">{item.label}</span>
                <span className="leading-none sm:hidden">{item.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value, sub, bold = false, valueClass = '' }: {
  label: string; value: string; sub: string; bold?: boolean; valueClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 shrink-0">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-bold ${bold ? 'text-primary' : 'text-foreground'} ${valueClass}`}>{value}</span>
      <span className="text-muted-foreground/70 text-[10px]">{sub}</span>
    </div>
  );
}
