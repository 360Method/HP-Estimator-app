// ============================================================
// HP Field Estimator — Calculation Engine
// ============================================================

import { BB, DC, WC, calcPaintCost, applyMarkup, fmtDollar, fmtDollarCents, fmtPct, ProfileSet } from './data';
import { TradeState, GlobalSettings, TradeKey } from './types';

export interface BreakdownRow {
  label: string;
  value: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

export interface TradeCalcResult {
  matRate: number;
  totalLF: number;
  purchaseLF: number;
  matCost: number;
  laborCost: number;
  laborHrs: number;
  paintMatCost: number;
  paintLaborCost: number;
  paintHrs: number;
  hardCost: number;
  price: number;
  gm: number;
  gmPrelim: number;
  minGM: number;
  flagged: boolean;
  breakdown: BreakdownRow[];
  matName: string;
}

function getProfileSet(key: TradeKey): ProfileSet {
  if (key === 'bb') return BB;
  if (key === 'dc') return DC;
  return WC;
}

export function calcTrade(
  key: TradeKey,
  trade: TradeState,
  global: GlobalSettings
): TradeCalcResult {
  const profiles = getProfileSet(key);
  const matEntry = profiles[trade.style]?.mats[trade.size]?.[trade.tier];
  const matRate = matEntry?.rate ?? 0;
  const matName = matEntry?.name ?? '—';

  // Quantity
  const isBaseboard = key === 'bb';
  const totalLF = isBaseboard ? trade.lf : trade.count * trade.lfPer;
  const purchaseLF = totalLF * (1 + trade.wastePct / 100);
  const matCost = purchaseLF * matRate;

  // Labor
  let laborCost = 0;
  let laborHrs = 0;
  if (trade.laborMode === 'hr') {
    if (isBaseboard) {
      laborHrs = trade.lf * trade.hrsPerUnit;
    } else {
      laborHrs = trade.count * trade.hrsPerUnit;
    }
    laborCost = laborHrs * trade.laborRate;
  } else {
    // flat rate per unit
    if (isBaseboard) {
      laborCost = trade.lf * trade.ratePerUnit;
    } else {
      laborCost = trade.count * trade.ratePerUnit;
    }
  }

  // Paint prep
  const pp = calcPaintCost(totalLF, trade.paintPrep, trade.paintRate);

  const hardCost = matCost + laborCost + pp.mat + pp.labor;
  const { price, gm, gmPrelim, minGM, flagged } = applyMarkup(hardCost, global.markupPct);

  // Build breakdown rows
  const breakdown: BreakdownRow[] = [];

  if (isBaseboard) {
    breakdown.push({ label: 'Field measure', value: trade.lf + ' lf' });
    breakdown.push({ label: `With ${trade.wastePct}% waste → purchase`, value: purchaseLF.toFixed(1) + ' lf' });
  } else {
    const unitLabel = key === 'dc' ? 'openings' : 'windows';
    breakdown.push({ label: `${key === 'dc' ? 'Door openings' : 'Windows'}`, value: trade.count + ` ${unitLabel}` });
    breakdown.push({ label: `${trade.lfPer} lf/${key === 'dc' ? 'opening' : 'window'} + ${trade.wastePct}% waste`, value: purchaseLF.toFixed(1) + ' lf total' });
  }

  breakdown.push({ label: `Material (${fmtDollarCents(matRate)}/lf)`, value: fmtDollar(matCost) });

  if (trade.laborMode === 'hr') {
    if (isBaseboard) {
      breakdown.push({ label: `Install labor (${trade.lf} lf × ${trade.hrsPerUnit} hrs/lf × ${fmtDollar(trade.laborRate)}/hr)`, value: fmtDollar(laborCost) });
    } else {
      const unitLabel = key === 'dc' ? 'openings' : 'windows';
      breakdown.push({ label: `Install labor (${trade.count} ${unitLabel} × ${trade.hrsPerUnit} hrs × ${fmtDollar(trade.laborRate)}/hr)`, value: fmtDollar(laborCost) });
    }
    if (laborHrs > 0) {
      breakdown.push({ label: 'Estimated install hours', value: laborHrs.toFixed(1) + ' hrs', isSubtotal: true });
    }
  } else {
    const unitLabel = isBaseboard ? 'lf' : (key === 'dc' ? 'opening' : 'window');
    breakdown.push({ label: `Install labor (${fmtDollar(trade.ratePerUnit)}/${unitLabel} × ${isBaseboard ? trade.lf : trade.count})`, value: fmtDollar(laborCost) });
  }

  if (trade.paintPrep !== 'none') {
    breakdown.push({ label: 'Paint prep material', value: fmtDollar(pp.mat) });
    breakdown.push({ label: `Paint prep labor (${pp.hrs.toFixed(1)} hrs × ${fmtDollar(trade.paintRate)}/hr)`, value: fmtDollar(pp.labor) });
  }

  breakdown.push({ label: 'Hard cost (internal)', value: fmtDollar(hardCost), isTotal: true });
  breakdown.push({ label: `Customer price (${fmtPct(gm)} GM)`, value: fmtDollar(price), isTotal: true });

  return {
    matRate, totalLF, purchaseLF, matCost,
    laborCost, laborHrs,
    paintMatCost: pp.mat, paintLaborCost: pp.labor, paintHrs: pp.hrs,
    hardCost, price, gm, gmPrelim, minGM, flagged,
    breakdown, matName,
  };
}

export interface TotalsResult {
  totalHard: number;
  totalPrice: number;
  totalGP: number;
  totalGM: number;
}

export function calcTotals(
  bbResult: TradeCalcResult,
  dcResult: TradeCalcResult,
  wcResult: TradeCalcResult
): TotalsResult {
  const totalHard = bbResult.hardCost + dcResult.hardCost + wcResult.hardCost;
  const totalPrice = bbResult.price + dcResult.price + wcResult.price;
  const totalGP = totalPrice - totalHard;
  const totalGM = totalPrice > 0 ? totalGP / totalPrice : 0;
  return { totalHard, totalPrice, totalGP, totalGM };
}

export function getMarginFlag(gm: number, hardCost: number): 'ok' | 'warn' | 'bad' | 'empty' {
  if (hardCost === 0) return 'empty';
  const minGM = hardCost < 2000 ? 0.40 : 0.30;
  if (gm < minGM - 0.001) return 'bad';
  // warn zone: at floor but below 35% (only applies to large jobs where floor is 30%)
  if (gm < 0.35 && minGM < 0.35) return 'warn';
  return 'ok';
}

export function getMarginLabel(gm: number, hardCost: number, price: number): string {
  if (hardCost === 0) return 'Enter dimensions to calculate';
  const minGM = hardCost < 2000 ? 0.40 : 0.30;
  const pct = Math.round(gm * 100);
  const gp = fmtDollar(price - hardCost);
  if (gm < minGM - 0.001) return `Below ${Math.round(minGM * 100)}% GM floor — do not send`;
  if (gm < 0.35 && minGM < 0.35) return `Low margin — ${pct}% GM · consider raising markup`;
  return `${pct}% GM · ${gp} gross profit — ready to send`;
}

// ── CUSTOMER ESTIMATE TEXT GENERATOR ──────────────────────
export function generateCustomerEstimate(
  jobInfo: { client: string; address: string; date: string; estimator: string; jobNumber: string },
  items: Array<{ name: string; price: number; matName: string; totalLF: number; count?: number }>,
  totalPrice: number,
  notes: string
): string {
  const dateStr = jobInfo.date ? new Date(jobInfo.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const activeItems = items.filter(i => i.price > 0);

  const scopeLines = activeItems.map(i => {
    if (i.count !== undefined) {
      return `  • ${i.name}: ${i.count} openings/units (${i.totalLF.toFixed(0)} lf) — ${i.matName}`;
    }
    return `  • ${i.name}: ${i.totalLF.toFixed(0)} lf — ${i.matName}`;
  }).join('\n');

  const lineItems = activeItems.map(i => {
    const pad = ' '.repeat(Math.max(1, 36 - i.name.length));
    return `  ${i.name}${pad}${fmtDollar(i.price)}`;
  }).join('\n');

  const notesSection = notes.trim() ? `\nNotes\n─────\n${notes.trim()}\n` : '';

  return `HANDY PIONEERS — PROJECT ESTIMATE
Vancouver, WA  ·  (360) 555-0100  ·  handypioneers.com
${'─'.repeat(52)}

Date:        ${dateStr}
Prepared by: ${jobInfo.estimator || 'Handy Pioneers'}
Client:      ${jobInfo.client || 'TBD'}
Address:     ${jobInfo.address || 'TBD'}
${jobInfo.jobNumber ? `Job #:       ${jobInfo.jobNumber}\n` : ''}
${'─'.repeat(52)}
SCOPE OF WORK
${'─'.repeat(52)}
${scopeLines}

${'─'.repeat(52)}
INVESTMENT
${'─'.repeat(52)}
${lineItems}

  ${'─'.repeat(40)}
  TOTAL INVESTMENT          ${fmtDollar(totalPrice)}

${'─'.repeat(52)}
TERMS
${'─'.repeat(52)}
  • 50% deposit due upon acceptance
  • Balance due upon completion
  • Price valid for 30 days from estimate date
  • Pricing includes materials, labor, and cleanup
  • Client-supplied paint assumed unless noted
${notesSection}
${'─'.repeat(52)}
Thank you for the opportunity to earn your business.
Handy Pioneers — Quality work, honest pricing.
${'─'.repeat(52)}`;
}

// ── INTERNAL MARGIN AUDIT ──────────────────────────────────
export function generateMarginAudit(
  jobInfo: { client: string; jobNumber: string; date: string },
  global: GlobalSettings,
  bb: TradeCalcResult,
  dc: TradeCalcResult,
  wc: TradeCalcResult,
  totals: TotalsResult
): string {
  const flags: string[] = [];
  if (totals.totalGM < 0.30) flags.push('CRITICAL: flag_margin_below_30 — do not send estimate');
  else if (totals.totalGM < 0.35) flags.push('WARNING: warn_remodel_margin_low — GM < 35%, consider raising markup');
  if (totals.totalHard < 2000 && totals.totalGM < 0.40) flags.push('WARNING: warn_small_job_margin_low — hard cost < $2,000, 40% floor applies');
  if (bb.flagged) flags.push('BB: markup floor enforced — prelim GM was below minimum');
  if (dc.flagged) flags.push('DC: markup floor enforced — prelim GM was below minimum');
  if (wc.flagged) flags.push('WC: markup floor enforced — prelim GM was below minimum');

  const audit = {
    job: { client: jobInfo.client, number: jobInfo.jobNumber, date: jobInfo.date },
    global: { markup_pct: global.markupPct, labor_rate: global.laborRate, paint_rate: global.paintRate },
    baseboard: {
      hard_cost: Math.round(bb.hardCost),
      price: bb.price,
      gm_prelim: fmtPct(bb.gmPrelim),
      gm_final: fmtPct(bb.gm),
      gross_profit: fmtDollar(bb.price - bb.hardCost),
      min_gm_enforced: fmtPct(bb.minGM),
      floor_triggered: bb.flagged,
    },
    door_casing: {
      hard_cost: Math.round(dc.hardCost),
      price: dc.price,
      gm_prelim: fmtPct(dc.gmPrelim),
      gm_final: fmtPct(dc.gm),
      gross_profit: fmtDollar(dc.price - dc.hardCost),
      min_gm_enforced: fmtPct(dc.minGM),
      floor_triggered: dc.flagged,
    },
    window_casing: {
      hard_cost: Math.round(wc.hardCost),
      price: wc.price,
      gm_prelim: fmtPct(wc.gmPrelim),
      gm_final: fmtPct(wc.gm),
      gross_profit: fmtDollar(wc.price - wc.hardCost),
      min_gm_enforced: fmtPct(wc.minGM),
      floor_triggered: wc.flagged,
    },
    totals: {
      total_hard_cost: Math.round(totals.totalHard),
      total_price: totals.totalPrice,
      total_gross_profit: fmtDollar(totals.totalGP),
      total_gm: fmtPct(totals.totalGM),
    },
    flags: flags.length > 0 ? flags : ['No flags — estimate is clean'],
  };

  return JSON.stringify(audit, null, 2);
}
