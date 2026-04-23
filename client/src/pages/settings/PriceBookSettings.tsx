import { useState } from 'react';
import { BookOpen, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function PriceBookSettings() {
  const [cfg, setCfg] = useState({
    defaultMarkupPct: 30,
    goodTierLabel: 'Good', goodTierMarkup: 20,
    betterTierLabel: 'Better', betterTierMarkup: 35,
    bestTierLabel: 'Best', bestTierMarkup: 50,
    defaultTaxRate: 8.5,
    laborRatePerHour: 150,
    showTiersOnEstimate: true,
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Price Book</h2>

      <section className="card-section">
        <div className="card-section-header"><BookOpen size={13} /><span className="text-xs font-bold uppercase tracking-wider">Default Pricing</span></div>
        <div className="card-section-body grid grid-cols-2 gap-4">
          <div><label className="field-label">Default markup (%)</label>
            <input type="number" step="0.5" value={cfg.defaultMarkupPct} onChange={e => setCfg(p => ({ ...p, defaultMarkupPct: Number(e.target.value) }))} className="field-input" /></div>
          <div><label className="field-label">Default tax rate (%)</label>
            <input type="number" step="0.1" value={cfg.defaultTaxRate} onChange={e => setCfg(p => ({ ...p, defaultTaxRate: Number(e.target.value) }))} className="field-input" /></div>
          <div><label className="field-label">Internal labor rate ($/hr)</label>
            <input type="number" value={cfg.laborRatePerHour} onChange={e => setCfg(p => ({ ...p, laborRatePerHour: Number(e.target.value) }))} className="field-input" /></div>
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Material Tiers</span></div>
        <div className="card-section-body">
          <p className="text-xs text-muted-foreground mb-4">Define the three material quality tiers shown on customer estimates.</p>
          <div className="space-y-4">
            {([
              ['good', 'Good tier', 'bg-green-50 border-green-200'],
              ['better', 'Better tier', 'bg-blue-50 border-blue-200'],
              ['best', 'Best tier', 'bg-purple-50 border-purple-200'],
            ] as const).map(([key, label, cls]) => (
              <div key={key} className={`p-4 rounded-xl border ${cls} grid grid-cols-2 gap-3`}>
                <div><label className="field-label">{label} — label</label>
                  <input value={cfg[`${key}TierLabel` as keyof typeof cfg] as string}
                    onChange={e => setCfg(p => ({ ...p, [`${key}TierLabel`]: e.target.value }))}
                    className="field-input" /></div>
                <div><label className="field-label">Markup (%)</label>
                  <input type="number" step="0.5" value={cfg[`${key}TierMarkup` as keyof typeof cfg] as number}
                    onChange={e => setCfg(p => ({ ...p, [`${key}TierMarkup`]: Number(e.target.value) }))}
                    className="field-input" /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Options</span></div>
        <div className="card-section-body">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-foreground">Show material tiers on customer-facing estimate</span>
            <button onClick={() => setCfg(p => ({ ...p, showTiersOnEstimate: !p.showTiersOnEstimate }))}
              className={`relative w-9 h-5 rounded-full transition-colors ${cfg.showTiersOnEstimate ? 'bg-primary' : 'bg-muted border border-border'}`}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${cfg.showTiersOnEstimate ? 'translate-x-4' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      <button onClick={() => toast.success('Price book settings saved')} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Save size={14} /> Save Settings
      </button>
    </div>
  );
}
