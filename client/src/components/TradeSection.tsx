// ============================================================
// TradeSection — Full 7-step estimator flow for one trade
// Steps: 1) Profile style  2) Size  3) Material tier
//        4) Quantity + waste  5) Labor  6) Paint prep
//        7) Cost breakdown
// ============================================================

import { useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { TradeKey } from '@/lib/types';
import { BB, DC, WC, PROFILE_LABELS, PROFILE_DESCS } from '@/lib/data';
import { calcTrade } from '@/lib/calc';
import { fmtDollar } from '@/lib/data';
import MarginFlag from './MarginFlag';
import BreakdownTable from './BreakdownTable';
import type { ProfileSet } from '@/lib/data';

const PROFILE_SETS: Record<TradeKey, ProfileSet> = { bb: BB, dc: DC, wc: WC };

const TRADE_CONFIG: Record<TradeKey, { label: string; icon: string; unitLabel: string; unitSingular: string }> = {
  bb: { label: 'Baseboard',     icon: '▬', unitLabel: 'Linear Feet',      unitSingular: 'lf' },
  dc: { label: 'Door Casing',   icon: '🚪', unitLabel: 'Door Openings',   unitSingular: 'opening' },
  wc: { label: 'Window Casing', icon: '⬜', unitLabel: 'Windows',         unitSingular: 'window' },
};

interface TradeSectionProps {
  tradeKey: TradeKey;
  defaultOpen?: boolean;
}

export default function TradeSection({ tradeKey, defaultOpen = false }: TradeSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { state, setTrade } = useEstimator();
  const trade = state[tradeKey];
  const global = state.global;
  const profiles = PROFILE_SETS[tradeKey];
  const config = TRADE_CONFIG[tradeKey];
  const isBaseboard = tradeKey === 'bb';

  const result = calcTrade(tradeKey, trade, global);

  const priceLabel = result.price > 0 ? fmtDollar(result.price) : '—';
  const hasData = result.hardCost > 0;

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Trade Header — click to expand/collapse */}
      <button
        className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-lg shrink-0">
            {config.icon}
          </div>
          <div>
            <div className="text-base font-bold text-foreground">{config.label}</div>
            <div className="text-[11px] text-muted-foreground">
              {hasData
                ? `${trade.style} ${trade.size} · ${trade.tier} · ${isBaseboard ? trade.lf + ' lf' : trade.count + ' ' + config.unitSingular + (trade.count !== 1 ? 's' : '')}`
                : 'Tap to configure'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasData && (
            <div className="text-right">
              <div className="text-lg font-black mono text-primary">{priceLabel}</div>
              <div className="text-[10px] text-muted-foreground">customer price</div>
            </div>
          )}
          <div className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            ▾
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-border">
          <div className="p-5 space-y-6">

            {/* ── STEP 1: Profile Style ── */}
            <Step num={1} title="Profile Style" sub="Select the trim profile for this trade">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {Object.keys(profiles).map(styleKey => (
                  <button
                    key={styleKey}
                    onClick={() => setTrade(tradeKey, { style: styleKey })}
                    className={`text-left rounded-lg border p-3 transition-all ${
                      trade.style === styleKey
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border bg-secondary/50 hover:border-primary/40 hover:bg-secondary'
                    }`}
                  >
                    <div className="text-[13px] font-bold text-foreground">{PROFILE_LABELS[styleKey] ?? styleKey}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{PROFILE_DESCS[styleKey] ?? ''}</div>
                  </button>
                ))}
              </div>
            </Step>

            {/* ── STEP 2: Size ── */}
            <Step num={2} title="Size" sub="Select profile width">
              <div className="flex flex-wrap gap-2 mt-3">
                {(profiles[trade.style]?.sizes ?? []).map(sz => (
                  <button
                    key={sz}
                    onClick={() => setTrade(tradeKey, { size: sz })}
                    className={`px-4 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
                      trade.size === sz
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
              {profiles[trade.style]?.hints[trade.size] && (
                <p className="text-[11px] text-muted-foreground mt-2 italic">
                  {profiles[trade.style].hints[trade.size]}
                </p>
              )}
            </Step>

            {/* ── STEP 3: Material Tier ── */}
            <Step num={3} title="Material Tier" sub="Good / Better / Best with real $/lf hard costs">
              <div className="grid grid-cols-3 gap-2 mt-3">
                {(['good', 'better', 'best'] as const).map(tier => {
                  const mat = profiles[trade.style]?.mats[trade.size]?.[tier];
                  const isSelected = trade.tier === tier;
                  const tierClass = isSelected ? `tier-${tier}` : 'border-border bg-secondary/50 hover:bg-secondary text-muted-foreground';
                  return (
                    <button
                      key={tier}
                      onClick={() => setTrade(tradeKey, { tier })}
                      className={`rounded-lg border-2 p-3 text-left transition-all ${tierClass} ${isSelected ? 'ring-1' : ''}`}
                    >
                      <div className="text-[11px] font-black uppercase tracking-wider mb-1 capitalize">{tier}</div>
                      {mat ? (
                        <>
                          <div className="text-[13px] font-bold mono">${mat.rate.toFixed(2)}<span className="text-[10px] font-normal">/lf</span></div>
                          <div className="text-[10px] mt-1 leading-tight opacity-80">{mat.name.split(' — ')[0]}</div>
                        </>
                      ) : (
                        <div className="text-[11px] opacity-50">N/A</div>
                      )}
                    </button>
                  );
                })}
              </div>
              {profiles[trade.style]?.mats[trade.size]?.[trade.tier] && (
                <div className="mt-3 p-3 bg-secondary rounded-lg">
                  <div className="text-[12px] font-semibold text-foreground">
                    {profiles[trade.style].mats[trade.size][trade.tier].name}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {profiles[trade.style].mats[trade.size][trade.tier].detail}
                  </div>
                </div>
              )}
            </Step>

            {/* ── STEP 4: Quantity + Waste ── */}
            <Step num={4} title="Quantity" sub={isBaseboard ? 'Enter linear feet measured on site' : `Enter number of ${config.unitLabel.toLowerCase()}`}>
              <div className="space-y-3 mt-3">
                {isBaseboard ? (
                  <InputRow label="Field measure (lf)" unit="lf">
                    <NumInput
                      value={trade.lf}
                      onChange={v => setTrade(tradeKey, { lf: v })}
                      min={0}
                      step={1}
                      placeholder="0"
                    />
                  </InputRow>
                ) : (
                  <>
                    <InputRow label={config.unitLabel} unit={config.unitSingular + 's'}>
                      <NumInput
                        value={trade.count}
                        onChange={v => setTrade(tradeKey, { count: v })}
                        min={0}
                        step={1}
                        placeholder="0"
                      />
                    </InputRow>
                    <InputRow label={`lf per ${config.unitSingular}`} unit="lf">
                      <NumInput
                        value={trade.lfPer}
                        onChange={v => setTrade(tradeKey, { lfPer: v })}
                        min={1}
                        step={0.5}
                        placeholder="17"
                      />
                    </InputRow>
                    <div className="text-[11px] text-muted-foreground">
                      Total: <span className="font-bold mono text-foreground">{(trade.count * trade.lfPer).toFixed(1)} lf</span>
                    </div>
                  </>
                )}
                <InputRow label="Waste factor" unit="%">
                  <NumInput
                    value={trade.wastePct}
                    onChange={v => setTrade(tradeKey, { wastePct: v })}
                    min={0}
                    max={50}
                    step={1}
                    placeholder="10"
                  />
                </InputRow>
                {result.totalLF > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    Purchase qty: <span className="font-bold mono text-foreground">{result.purchaseLF.toFixed(1)} lf</span>
                    <span className="text-muted-foreground"> (includes {trade.wastePct}% waste)</span>
                  </div>
                )}
              </div>
            </Step>

            {/* ── STEP 5: Labor ── */}
            <Step num={5} title="Labor" sub="Hourly or flat rate per unit">
              <div className="mt-3 space-y-3">
                {/* Mode toggle */}
                <div className="flex gap-2">
                  <ModeBtn
                    active={trade.laborMode === 'hr'}
                    onClick={() => setTrade(tradeKey, { laborMode: 'hr' })}
                  >
                    Hourly rate
                  </ModeBtn>
                  <ModeBtn
                    active={trade.laborMode === 'unit'}
                    onClick={() => setTrade(tradeKey, { laborMode: 'unit' })}
                  >
                    Flat rate per {isBaseboard ? 'lf' : config.unitSingular}
                  </ModeBtn>
                </div>

                {trade.laborMode === 'hr' ? (
                  <>
                    <InputRow label="Labor rate" unit="$/hr">
                      <NumInput
                        value={trade.laborRate}
                        onChange={v => setTrade(tradeKey, { laborRate: v })}
                        min={0}
                        step={5}
                        placeholder="100"
                      />
                    </InputRow>
                    <InputRow
                      label={isBaseboard ? 'Hrs per lf' : `Hrs per ${config.unitSingular}`}
                      unit={isBaseboard ? 'hrs/lf' : 'hrs'}
                    >
                      <NumInput
                        value={trade.hrsPerUnit}
                        onChange={v => setTrade(tradeKey, { hrsPerUnit: v })}
                        min={0}
                        step={0.05}
                        placeholder={isBaseboard ? '0.04' : '1.5'}
                      />
                    </InputRow>
                    {result.laborHrs > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        Est. install: <span className="font-bold mono text-foreground">{result.laborHrs.toFixed(1)} hrs</span>
                        {' · '}
                        <span className="font-bold mono text-foreground">{fmtDollar(result.laborCost)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <InputRow
                      label={isBaseboard ? 'Rate per lf' : `Rate per ${config.unitSingular}`}
                      unit={isBaseboard ? '$/lf' : `$/${config.unitSingular}`}
                    >
                      <NumInput
                        value={trade.ratePerUnit}
                        onChange={v => setTrade(tradeKey, { ratePerUnit: v })}
                        min={0}
                        step={1}
                        placeholder={isBaseboard ? '1.50' : '65'}
                      />
                    </InputRow>
                    {result.laborCost > 0 && (
                      <div className="text-[11px] text-muted-foreground">
                        Labor cost: <span className="font-bold mono text-foreground">{fmtDollar(result.laborCost)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Step>

            {/* ── STEP 6: Paint Prep ── */}
            <Step num={6} title="Paint Prep" sub="Caulk only, full prep, or none">
              <div className="flex flex-wrap gap-2 mt-3">
                {([
                  { key: 'none',  label: 'None',      sub: 'No prep included' },
                  { key: 'caulk', label: 'Caulk Only', sub: '$0.14/lf mat + 0.09 hrs/lf' },
                  { key: 'full',  label: 'Full Prep',  sub: '$0.26/lf mat + 0.19 hrs/lf' },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setTrade(tradeKey, { paintPrep: opt.key })}
                    className={`rounded-lg border px-4 py-2 text-left transition-all ${
                      trade.paintPrep === opt.key
                        ? 'bg-amber-50 border-amber-400 text-amber-900'
                        : 'border-border bg-secondary/50 hover:bg-secondary text-muted-foreground'
                    }`}
                  >
                    <div className="text-[12px] font-bold">{opt.label}</div>
                    <div className="text-[10px] mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </Step>

            {/* ── STEP 7: Cost Breakdown ── */}
            <Step num={7} title="Cost Breakdown" sub="Transparent hard cost + customer price">
              <div className="mt-3 bg-secondary rounded-lg p-4">
                <BreakdownTable rows={result.breakdown} hardCost={result.hardCost} />
              </div>
              <div className="mt-3">
                <MarginFlag gm={result.gm} hardCost={result.hardCost} price={result.price} />
              </div>
            </Step>

          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function Step({ num, title, sub, children }: { num: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <div className="step-badge">{num}</div>
        <div>
          <div className="text-[13px] font-bold text-foreground">{title}</div>
          <div className="text-[11px] text-muted-foreground">{sub}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function InputRow({ label, unit, children }: { label: string; unit: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-[12px] text-muted-foreground font-medium min-w-[160px]">{label}</span>
      {children}
      <span className="text-[11px] text-muted-foreground">{unit}</span>
    </div>
  );
}

function NumInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  placeholder = '0',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      className="w-24 text-right font-bold mono text-[13px] px-2.5 py-1.5 border border-input rounded-lg bg-background focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
      value={value || ''}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={e => {
        const v = parseFloat(e.target.value);
        onChange(isNaN(v) ? 0 : v);
      }}
    />
  );
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-[12px] font-semibold border transition-all ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
