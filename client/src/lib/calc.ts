// ============================================================
// HP Field Estimator v2 — Calculation Engine
// ============================================================

import { LineItem, PhaseGroup, GlobalSettings, Tier, CustomLineItem } from './types';

// ─── MARKUP / GM MATH ─────────────────────────────────────────
// Markup % is applied as: price = hardCost / (1 - GM)
// e.g. 40% GM → price = hardCost / 0.60 → 66.7% markup on cost
// The skill uses "markup multiplier" language but we store as GM target.
// applyMarkup: given a desired GM%, compute price and enforce floors.

export function applyMarkup(hardCost: number, markupPct: number): {
  price: number;
  gm: number;
  gmPrelim: number;
  minGM: number;
  flagged: boolean;
} {
  if (hardCost === 0) return { price: 0, gm: 0, gmPrelim: 0, minGM: 0, flagged: false };

  // markupPct is stored as the desired GM (e.g. 0.40 = 40% GM)
  const minGM = hardCost < 2000 ? 0.40 : 0.30;
  const effectiveGM = Math.max(markupPct, minGM);
  const flagged = markupPct < minGM;

  const price = Math.ceil(hardCost / (1 - effectiveGM));
  const gm = (price - hardCost) / price;
  const gmPrelim = (price - hardCost) / price; // same after floor enforcement

  return { price, gm, gmPrelim, minGM, flagged };
}

export function fmtDollar(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function fmtDollarCents(n: number): string {
  return '$' + n.toFixed(2);
}

export function fmtPct(n: number): string {
  return Math.round(n * 100) + '%';
}

// ─── PAINT PREP ───────────────────────────────────────────────
export function calcPaintCost(
  qty: number,
  prep: 'none' | 'caulk' | 'full',
  paintRate: number,
): { mat: number; labor: number; hrs: number } {
  if (prep === 'none') return { mat: 0, labor: 0, hrs: 0 };
  const matRate = prep === 'caulk' ? 0.14 : 0.26;
  const hrsRate = prep === 'caulk' ? 0.09 : 0.19;
  const mat = qty * matRate;
  const hrs = qty * hrsRate;
  const labor = hrs * paintRate;
  return { mat, labor, hrs };
}

// ─── LINE ITEM CALC ───────────────────────────────────────────
export interface LineItemResult {
  id: string;
  name: string;
  unitType: string;
  qty: number;
  purchaseQty: number;
  matRate: number;
  matName: string;
  matCost: number;
  laborCost: number;
  laborHrs: number;
  paintMatCost: number;
  paintLaborCost: number;
  hardCost: number;
  price: number;
  matPrice: number;    // customer-facing material portion
  laborPrice: number;  // customer-facing labor portion
  gm: number;
  flagged: boolean;
  hasData: boolean;
  sowLine: string;
}

export function calcLineItem(item: LineItem, global: GlobalSettings): LineItemResult {
  const hasData = item.qty > 0 && item.enabled;

  if (!hasData) {
    return {
      id: item.id, name: item.name, unitType: item.unitType,
      qty: 0, purchaseQty: 0, matRate: 0, matName: '—', matCost: 0,
      laborCost: 0, laborHrs: 0, paintMatCost: 0, paintLaborCost: 0,
      hardCost: 0, price: 0, matPrice: 0, laborPrice: 0,
      gm: 0, flagged: item.flagged, hasData: false,
      sowLine: '',
    };
  }

  const tierData = item.hasTiers ? item.tiers[item.tier as Tier] : { rate: 0, name: 'Labor only', desc: '' };
  const matRate = tierData.rate;
  const matName = tierData.name;

  const purchaseQty = item.qty * (1 + item.wastePct / 100);
  const matCost = purchaseQty * matRate;

  let laborCost = 0;
  let laborHrs = 0;
  if (item.laborMode === 'hr') {
    laborHrs = item.qty * item.hrsPerUnit;
    laborCost = laborHrs * item.laborRate;
  } else {
    laborCost = item.qty * item.flatRatePerUnit;
  }

  const pp = item.hasPaintPrep
    ? calcPaintCost(item.qty, item.paintPrep, item.paintRate)
    : { mat: 0, labor: 0, hrs: 0 };

  const hardCost = matCost + laborCost + pp.mat + pp.labor;
  // Use per-item markup override if set, otherwise fall back to global
  const effectiveMarkup = item.markupPct !== null && item.markupPct !== undefined ? item.markupPct : global.markupPct;
  const { price, gm, flagged: markupFlagged } = applyMarkup(hardCost, effectiveMarkup);

  // Split customer price proportionally between mat and labor
  const matHardFraction = hardCost > 0 ? (matCost + pp.mat) / hardCost : 0;
  const matPrice = Math.round(price * matHardFraction);
  const laborPrice = price - matPrice;

  // Build SOW line
  const sowLine = buildSowLine(item, tierData.name);

  return {
    id: item.id, name: item.name, unitType: item.unitType,
    qty: item.qty, purchaseQty,
    matRate, matName, matCost,
    laborCost, laborHrs,
    paintMatCost: pp.mat, paintLaborCost: pp.labor,
    hardCost, price, matPrice, laborPrice,
    gm, flagged: item.flagged || markupFlagged, hasData: true,
    sowLine,
  };
}

function buildSowLine(item: LineItem, matName: string): string {
  const tierLabel = item.tier.charAt(0).toUpperCase() + item.tier.slice(1);
  // When salesSelected, show the actual material name prominently
  const displayMat = item.salesSelected ? matName : `${tierLabel} grade`;
  let line = item.sowTemplate
    .replace('{qty}', item.qty.toString())
    .replace('{tier}', tierLabel)
    .replace('{name}', item.name)
    .replace('{mat}', displayMat);
  return line;
}

// ─── PHASE CALC ───────────────────────────────────────────────
export interface PhaseResult {
  phaseId: number;
  phaseName: string;
  phaseIcon: string;
  items: LineItemResult[];
  hardCost: number;
  price: number;
  matPrice: number;
  laborPrice: number;
  gm: number;
  hasData: boolean;
}

export function calcPhase(phase: PhaseGroup, global: GlobalSettings): PhaseResult {
  const items = phase.items.map(item => calcLineItem(item, global));
  const activeItems = items.filter(i => i.hasData);
  const hardCost = activeItems.reduce((s, i) => s + i.hardCost, 0);
  const price = activeItems.reduce((s, i) => s + i.price, 0);
  const matPrice = activeItems.reduce((s, i) => s + i.matPrice, 0);
  const laborPrice = activeItems.reduce((s, i) => s + i.laborPrice, 0);
  const gm = price > 0 ? (price - hardCost) / price : 0;

  return {
    phaseId: phase.id,
    phaseName: phase.name,
    phaseIcon: phase.icon,
    items,
    hardCost, price, matPrice, laborPrice, gm,
    hasData: activeItems.length > 0,
  };
}

// ─── CUSTOM LINE ITEM CALC ───────────────────────────────────
export interface CustomItemResult {
  id: string;
  phaseId: number;
  description: string;
  qty: number;
  unitType: string;
  hardCost: number;
  matCost: number;
  laborCost: number;
  price: number;
  matPrice: number;
  laborPrice: number;
  gm: number;
  sowLine: string;
  hasData: boolean;
}

export function calcCustomItem(ci: CustomLineItem, global: GlobalSettings): CustomItemResult {
  const matCost = ci.qty * ci.matCostPerUnit;
  const laborCost = ci.qty * ci.laborHrsPerUnit * ci.laborRate;
  const hardCost = matCost + laborCost;
  // Use per-item markup override if set, otherwise fall back to global
  const effectiveMarkup = ci.markupPct !== null && ci.markupPct !== undefined ? ci.markupPct : global.markupPct;
  const { price, gm } = applyMarkup(hardCost, effectiveMarkup);
  const matFraction = hardCost > 0 ? matCost / hardCost : 0;
  const matPrice = Math.round(price * matFraction);
  const laborPrice = price - matPrice;
  const sowLine = `${ci.description} — ${ci.qty} ${ci.unitType}`;
  return { id: ci.id, phaseId: ci.phaseId, description: ci.description, qty: ci.qty, unitType: ci.unitType, hardCost, matCost, laborCost, price, matPrice, laborPrice, gm, sowLine, hasData: hardCost > 0 };
}

// ─── TOTALS ───────────────────────────────────────────────
export interface TotalsResult {
  totalHard: number;
  totalPrice: number;
  totalMatPrice: number;
  totalLaborPrice: number;
  totalGP: number;
  totalGM: number;
  // Aliases for convenience
  hardCost: number;
  price: number;
  gm: number;
  grossProfit: number;
  hasData: boolean;
}

export function calcTotals(phases: PhaseResult[], customItems: CustomItemResult[] = []): TotalsResult {
  const activePhases = phases.filter(p => p.hasData);
  const totalHard = activePhases.reduce((s, p) => s + p.hardCost, 0) + customItems.reduce((s, c) => s + c.hardCost, 0);
  const totalPrice = activePhases.reduce((s, p) => s + p.price, 0) + customItems.reduce((s, c) => s + c.price, 0);
  const totalMatPrice = activePhases.reduce((s, p) => s + p.matPrice, 0) + customItems.reduce((s, c) => s + c.matPrice, 0);
  const totalLaborPrice = activePhases.reduce((s, p) => s + p.laborPrice, 0) + customItems.reduce((s, c) => s + c.laborPrice, 0);
  const totalGP = totalPrice - totalHard;
  const totalGM = totalPrice > 0 ? totalGP / totalPrice : 0;
  return { totalHard, totalPrice, totalMatPrice, totalLaborPrice, totalGP, totalGM,
    hardCost: totalHard, price: totalPrice, gm: totalGM, grossProfit: totalGP, hasData: totalHard > 0 };
}

// ─── GM FLAGS ─────────────────────────────────────────────────
export function getMarginFlag(gm: number, hardCost: number): 'ok' | 'warn' | 'bad' | 'empty' {
  if (hardCost === 0) return 'empty';
  const minGM = hardCost < 2000 ? 0.40 : 0.30;
  if (gm < minGM - 0.001) return 'bad';
  if (gm < 0.35 && minGM < 0.35) return 'warn';
  return 'ok';
}

export function getMarginLabel(gm: number, hardCost: number, price: number): string {
  if (hardCost === 0) return 'Enter quantities to calculate';
  const minGM = hardCost < 2000 ? 0.40 : 0.30;
  const pct = Math.round(gm * 100);
  const gp = fmtDollar(price - hardCost);
  if (gm < minGM - 0.001) return `Below ${Math.round(minGM * 100)}% GM floor — do not send`;
  if (gm < 0.35 && minGM < 0.35) return `Low margin — ${pct}% GM · consider raising markup`;
  return `${pct}% GM · ${gp} gross profit — ready to send`;
}

// ─── CUSTOMER ESTIMATE TEXT ───────────────────────────────────
export function generateCustomerEstimate(
  jobInfo: { client: string; address: string; date: string; estimator: string; jobNumber: string },
  phases: PhaseResult[],
  totals: TotalsResult,
  notes: string,
  customItems: CustomItemResult[] = [],
): string {
  const dateStr = jobInfo.date
    ? new Date(jobInfo.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const activePhases = phases.filter(p => p.hasData);
  const sep = '─'.repeat(52);

  const scopeSection = activePhases.map(p => {
    const lines = p.items.filter(i => i.hasData).map(i => `    • ${i.sowLine}`).join('\n');
    return `  ${p.phaseIcon} ${p.phaseName.toUpperCase()}\n${lines}`;
  }).join('\n\n');

  const investmentSection = activePhases.map(p => {
    const pad = ' '.repeat(Math.max(1, 36 - p.phaseName.length));
    const lines = [`  ${p.phaseName}${pad}${fmtDollar(p.price)}`];
    if (p.matPrice > 0 && p.laborPrice > 0) {
      lines.push(`    Materials: ${fmtDollar(p.matPrice)}   Labor: ${fmtDollar(p.laborPrice)}`);
    }
    return lines.join('\n');
  }).join('\n');

  const notesSection = notes.trim() ? `\n${sep}\nNOTES\n${sep}\n${notes.trim()}\n` : '';

  return `HANDY PIONEERS — PROJECT ESTIMATE
Vancouver, WA  ·  (360) 555-0100  ·  handypioneers.com
${sep}

Date:        ${dateStr}
Prepared by: ${jobInfo.estimator || 'Handy Pioneers'}
Client:      ${jobInfo.client || 'TBD'}
Address:     ${jobInfo.address || 'TBD'}
${jobInfo.jobNumber ? `Job #:       ${jobInfo.jobNumber}\n` : ''}
${sep}
SCOPE OF WORK
${sep}
${scopeSection}

${sep}
INVESTMENT
${sep}
${investmentSection}

  ${'─'.repeat(40)}
  TOTAL INVESTMENT          ${fmtDollar(totals.totalPrice)}
  Materials                 ${fmtDollar(totals.totalMatPrice)}
  Labor                     ${fmtDollar(totals.totalLaborPrice)}

${sep}
TERMS
${sep}
  • 50% deposit due upon acceptance
  • Balance due upon completion
  • Price valid for 30 days from estimate date
  • Pricing includes materials, labor, and cleanup
  • Client-supplied paint assumed unless noted
${notesSection}
${sep}
Thank you for the opportunity to earn your business.
Handy Pioneers — Quality work, honest pricing.
${sep}`;
}

// ─── INTERNAL MARGIN AUDIT ────────────────────────────────────
export function generateMarginAudit(
  jobInfo: { client: string; jobNumber: string; date: string },
  global: GlobalSettings,
  phases: PhaseResult[],
  totals: TotalsResult,
): string {
  const flags: string[] = [];
  if (totals.totalGM < 0.30) flags.push('CRITICAL: flag_margin_below_30 — do not send estimate');
  else if (totals.totalGM < 0.35) flags.push('WARNING: warn_margin_low — GM < 35%, consider raising markup');
  if (totals.totalHard < 2000 && totals.totalGM < 0.40) flags.push('WARNING: warn_small_job_margin_low — hard cost < $2,000, 40% floor applies');

  const phaseAudit = phases.filter(p => p.hasData).map(p => ({
    phase: p.phaseName,
    hard_cost: Math.round(p.hardCost),
    customer_price: Math.round(p.price),
    gm: fmtPct(p.gm),
    gross_profit: fmtDollar(p.price - p.hardCost),
    flagged_items: p.items.filter(i => i.flagged && i.hasData).map(i => i.name),
  }));

  const audit = {
    job: { client: jobInfo.client, number: jobInfo.jobNumber, date: jobInfo.date },
    global: { markup_gm_target: fmtPct(global.markupPct), labor_rate: global.laborRate, paint_rate: global.paintRate },
    totals: {
      total_hard_cost: Math.round(totals.totalHard),
      total_price: Math.round(totals.totalPrice),
      total_gross_profit: fmtDollar(totals.totalGP),
      total_gm: fmtPct(totals.totalGM),
      materials: fmtDollar(totals.totalMatPrice),
      labor: fmtDollar(totals.totalLaborPrice),
    },
    phases: phaseAudit,
    flags: flags.length > 0 ? flags : ['No flags — estimate is clean'],
  };

  return JSON.stringify(audit, null, 2);
}
