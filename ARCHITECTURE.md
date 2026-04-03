# HP Field Estimator v2 — Architecture Plan

## 4-Section Flow (top-level navigation)
1. **Customer Dashboard** — Job info, client details, project overview
2. **Sales View** — Customer-facing: material types, sizes, Good/Better/Best tiers with photos/descriptions. No prices shown. Customer picks their tier preference per trade.
3. **Internal Calculator** — Estimator-only: all 17 phase tabs, quantity inputs, labor rates, waste factors, GM enforcement
4. **Estimate Output** — Final customer-facing estimate: SOW bullets, labor + materials separated per trade, total investment, terms, copy/share/print

---

## Top-Level Navigation
- Horizontal tab bar: [Customer Info] [Sales View] [Calculator] [Estimate]
- Sticky metrics bar always visible (hard cost, price, GM%, GP)

---

## Internal Calculator — 17 Phase Tabs

Each phase tab contains N trade line items. Each line item has:
- Name / description
- Unit type (lf, sqft, per unit, hours, per opening, etc.)
- Quantity input
- Waste factor %
- Material tier (Good/Better/Best) with $/unit
- Labor mode (hourly or flat rate per unit)
- Labor rate + hrs per unit (or flat rate)
- Paint prep option (where applicable)
- Per-line GM flag
- Expandable cost breakdown

### Phase Structure:
1. Pre-Construction (4 items)
2. Demo & Rough Work (5 items)
3. Mechanical Rough-In (4 items — flagged trades)
4. Insulation & Weatherproofing (4 items)
5. Drywall (4 items)
6. Flooring (7 items)
7. Tile Work (6 items)
8. Framing & Carpentry (5 items)
9. Exterior Work (11 items)
10. Doors & Windows (7 items)
11. Trim & Finish Carpentry (12 items — existing 3 + 9 new)
12. Cabinetry & Countertops (5 items)
13. Plumbing Finish (9 items)
14. Electrical Finish (10 items)
15. Painting (9 items)
16. Appliances & Specialties (5 items)
17. Final Cleaning & Closeout (5 items)

---

## Data Model

### TradeLineItem (generic)
```ts
interface LineItem {
  id: string;
  name: string;
  unitType: 'lf' | 'sqft' | 'unit' | 'hr' | 'opening' | 'window' | 'load' | 'patch' | 'step' | 'closet' | 'fixture' | 'circuit' | 'can' | 'door' | 'box';
  qty: number;
  wastePct: number;
  matTier: 'good' | 'better' | 'best' | 'none';
  matRates: { good: number; better: number; best: number };  // $/unit hard cost
  matNames: { good: string; better: string; best: string };
  laborMode: 'hr' | 'flat';
  laborRate: number;
  hrsPerUnit: number;   // used when laborMode = 'hr'
  flatRatePerUnit: number; // used when laborMode = 'flat'
  paintPrep: 'none' | 'caulk' | 'full';
  paintRate: number;
  flagged: boolean;     // sub-specialty flag (requires licensed sub)
  enabled: boolean;
  notes: string;
}
```

### Phase
```ts
interface Phase {
  id: number;
  name: string;
  icon: string;
  items: LineItem[];
}
```

### EstimatorState
```ts
interface EstimatorState {
  jobInfo: JobInfo;
  global: GlobalSettings;
  phases: Phase[];
  salesSelections: Record<string, 'good' | 'better' | 'best'>;  // customer tier picks
  fieldNotes: string;
  summaryNotes: string;
}
```

---

## Sales View
- Shows each active trade as a card with:
  - Trade name + description
  - 3-column tier comparison (Good / Better / Best)
  - Material name, description, photo (if available)
  - NO prices shown to customer
  - Customer selects tier → syncs to calculator

## Estimate Output
Per trade section:
- **Description** paragraph (auto-generated from selections)
- **SOW bullets** (auto-generated from line items)
- **Materials line** (total material cost — shown as customer price)
- **Labor line** (total labor cost — shown as customer price)
- **Subtotal** per trade
- Grand total, terms, signature line

---

## Key Design Decisions
- All 17 phases always present in calculator (collapsed by default if empty)
- Only phases with qty > 0 appear in the estimate output
- GM enforcement: 30% floor (≥$2k hard cost), 40% floor (<$2k)
- Markup applied globally, can be overridden per phase
- Flagged trades (licensed sub required) show warning badge, excluded from GM calc
- Sales View is read-only for customer; estimator controls it
