// ============================================================
// GlobalSettingsCard — Markup %, labor rate, paint rate
// These sync to all trades when changed
// ============================================================

import { useEstimator } from '@/contexts/EstimatorContext';

export default function GlobalSettingsCard() {
  const { state, setGlobal } = useEstimator();
  const { global: g } = state;

  return (
    <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Global Settings</h2>
      <div className="grid grid-cols-3 gap-4">
        <SettingBlock
          label="Markup"
          value={`${g.markupPct}%`}
          sub="applied to all trades"
        >
          <input
            type="range"
            min={20}
            max={80}
            step={1}
            value={g.markupPct}
            onChange={e => setGlobal({ markupPct: Number(e.target.value) })}
            className="w-full accent-primary mt-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>20%</span><span>80%</span>
          </div>
        </SettingBlock>

        <SettingBlock
          label="Install Labor Rate"
          value={`$${g.laborRate}/hr`}
          sub="hard cost — syncs to all trades"
        >
          <input
            type="range"
            min={60}
            max={200}
            step={5}
            value={g.laborRate}
            onChange={e => setGlobal({ laborRate: Number(e.target.value) })}
            className="w-full accent-primary mt-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>$60</span><span>$200</span>
          </div>
        </SettingBlock>

        <SettingBlock
          label="Paint Prep Rate"
          value={`$${g.paintRate}/hr`}
          sub="paint prep labor — syncs to all trades"
        >
          <input
            type="range"
            min={40}
            max={150}
            step={5}
            value={g.paintRate}
            onChange={e => setGlobal({ paintRate: Number(e.target.value) })}
            className="w-full accent-primary mt-1"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
            <span>$40</span><span>$150</span>
          </div>
        </SettingBlock>
      </div>

      <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-[11px] text-amber-800 font-medium">
          <strong>GM floors:</strong> Jobs with hard cost ≥ $2,000 → 30% minimum GM. Jobs under $2,000 → 40% minimum GM. Markup is automatically raised if needed.
        </p>
      </div>
    </div>
  );
}

function SettingBlock({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-secondary rounded-lg p-3">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-black mono text-foreground mb-0.5">{value}</div>
      <div className="text-[10px] text-muted-foreground mb-2">{sub}</div>
      {children}
    </div>
  );
}
