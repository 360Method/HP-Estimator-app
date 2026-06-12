/**
 * client/src/lib/sow.ts
 *
 * Customer-facing scope-of-work copy + the portal line-items serializer.
 * Extracted from EstimateSection so the guided wizard and the full builder
 * generate identical output. NOTHING here may include costs, margins, hours,
 * or markup — this is the client-visible layer.
 */
import type { CustomItemResult, PhaseResult } from './calc';
import type { CustomLineItem, LineItem, PhaseGroup } from './types';

export function qtyLabel(n: number, unit: string): string {
  const map: Record<string, string> = {
    lf: `${n} linear ft`, sqft: `${n} sq ft`, unit: `${n} unit${n !== 1 ? 's' : ''}`,
    hr: `${n} hr${n !== 1 ? 's' : ''}`, opening: `${n} opening${n !== 1 ? 's' : ''}`,
    load: `${n} load${n !== 1 ? 's' : ''}`, patch: `${n} patch${n !== 1 ? 'es' : ''}`,
    step: `${n} step${n !== 1 ? 's' : ''}`, closet: `${n} closet${n !== 1 ? 's' : ''}`,
    fixture: `${n} fixture${n !== 1 ? 's' : ''}`, circuit: `${n} circuit${n !== 1 ? 's' : ''}`,
    can: `${n} can${n !== 1 ? 's' : ''}`, door: `${n} door${n !== 1 ? 's' : ''}`,
    box: `${n} box${n !== 1 ? 'es' : ''}`, window: `${n} window${n !== 1 ? 's' : ''}`,
    fan: `${n} fan${n !== 1 ? 's' : ''}`, device: `${n} device${n !== 1 ? 's' : ''}`,
  };
  return map[unit] ?? `${n} ${unit}`;
}

/** One customer-facing bullet per active line item in a phase. */
export function buildSowBullets(phase: PhaseGroup, activeItems: LineItem[]): string[] {
  const bullets: string[] = [];
  for (const item of activeItems) {
    const tierData = item.hasTiers ? item.tiers[item.tier] : null;
    const tierName = tierData?.name ?? '';
    const qty = item.qty;
    const u = item.unitType;
    let bullet = '';
    if (item.hasTiers && tierName) {
      bullet = `Supply and install ${qtyLabel(qty, u)} of ${tierName}`;
      if (item.wastePct > 0) bullet += ` (includes ${item.wastePct}% waste allowance)`;
    } else {
      bullet = `${item.name} — ${qtyLabel(qty, u)}`;
    }
    if (item.salesDesc) {
      const desc = item.salesDesc.replace(/\.$/, '');
      bullet += `. ${desc}.`;
    }
    if (item.hasPaintPrep && item.paintPrep !== 'none') {
      const prepLabel = item.paintPrep === 'caulk' ? 'caulk and touch-up' : 'full paint prep (caulk, prime, and paint)';
      bullet += ` Includes ${prepLabel}.`;
    }
    if (item.flagged && item.flagNote) bullet += ` (${item.flagNote})`;
    bullets.push(bullet);
  }
  if (bullets.length > 8) {
    const shown = bullets.slice(0, 7);
    shown.push(`Plus ${bullets.length - 7} additional items — see detailed breakdown below.`);
    return shown;
  }
  return bullets;
}

// ─── Portal serialization (the lineItemsJson contract) ────────────────────────

export type PortalLineItem = {
  name: string;
  scopeOfWork: string;
  qty: number;
  unitType: string;
  unitPrice: number;
  amount: number;
};

export type PortalPhase = {
  phaseName: string;
  phaseDescription: string;
  items: PortalLineItem[];
  phaseTotal: number;
};

export type ActivePhaseData = {
  phase: PhaseGroup;
  result: PhaseResult;
  activeItems: LineItem[];
  bullets: string[];
};

/** The label custom/maintenance items group under in the customer's portal. */
export const CUSTOM_ITEMS_PHASE_NAME = 'Maintenance & Additional Services';

/**
 * Serialize the estimate for the portal: catalog phases plus (when present)
 * one group holding the custom/maintenance line items. Prices only — never
 * costs or margins.
 */
export function buildPortalPhases(
  activePhaseData: ActivePhaseData[],
  customItems: CustomLineItem[] = [],
  customResults: CustomItemResult[] = [],
): PortalPhase[] {
  const phases: PortalPhase[] = activePhaseData.map(({ phase, result, activeItems, bullets }) => ({
    phaseName: phase.name,
    phaseDescription: (phase as { description?: string }).description ?? '',
    items: activeItems.map((item, idx) => {
      const itemResult = (result.items as Array<{ id: string; price: number }>).find(r => r.id === item.id);
      const price = itemResult?.price ?? 0;
      const unitPrice = item.qty > 0 ? price / item.qty : 0;
      return {
        name: item.name,
        scopeOfWork: bullets[idx] ?? '',
        qty: item.qty,
        unitType: item.unitType,
        unitPrice: Math.round(unitPrice * 100) / 100,
        amount: Math.round(price * 100) / 100,
      };
    }),
    phaseTotal: Math.round(result.price * 100) / 100,
  }));

  const activeCustom = customResults.filter(r => r.hasData);
  if (activeCustom.length > 0) {
    const byId = new Map(customItems.map(ci => [ci.id, ci]));
    phases.push({
      phaseName: CUSTOM_ITEMS_PHASE_NAME,
      phaseDescription: 'Individual services and out-of-scope items.',
      items: activeCustom.map(r => {
        const ci = byId.get(r.id);
        const unitPrice = r.qty > 0 ? r.price / r.qty : 0;
        return {
          name: r.description,
          scopeOfWork: ci?.notes?.startsWith('pricebook:') ? `${r.description} — ${qtyLabel(r.qty, r.unitType)}` : r.sowLine,
          qty: r.qty,
          unitType: r.unitType,
          unitPrice: Math.round(unitPrice * 100) / 100,
          amount: Math.round(r.price * 100) / 100,
        };
      }),
      phaseTotal: Math.round(activeCustom.reduce((s, r) => s + r.price, 0) * 100) / 100,
    });
  }
  return phases;
}
