/**
 * EstimateDocument — the customer-safe estimate document, extracted from
 * PortalEstimateDetail so the portal page and the on-site close flow render
 * the exact same paper: HP header bar, customer meta, phase sections with
 * line items, totals, and deposit line. Pure props, no queries; retail
 * prices only (never costs or margins).
 */
import { Button } from "@/components/ui/button";

const HP_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";
const HP_ADDRESS = "808 SE Chkalov Dr, 3-433\nVancouver, WA 98683";
const HP_PHONE = "(360) 838-6731";
const HP_EMAIL = "help@handypioneers.com";

// ─── Types ────────────────────────────────────────────────────
type PortalLineItem = {
  name: string;
  scopeOfWork: string;
  qty: number;
  unitType: string;
  unitPrice: number;
  amount: number;
};
type PortalPhase = {
  phaseName: string;
  phaseDescription: string;
  items: PortalLineItem[];
  phaseTotal: number;
};

export interface EstimateDocumentData {
  id: number;
  estimateNumber?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  scopeOfWork?: string | null;
  lineItemsJson?: string | null;
  totalAmount: number;
  depositAmount?: number | null;
  depositPercent?: number | null;
  taxEnabled?: number | boolean | null;
  taxRateCode?: string | null;
  customTaxPct?: number | null;
  taxAmount?: number | null;
  sentAt?: number | Date | string | null;
  expiresAt?: number | Date | string | null;
}

// ─── Helpers ──────────────────────────────────────────────────
export function fmtMoney(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtMoneyFlat(dollars: number) {
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function fmtDate(ts: number | Date | string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Parse lineItemsJson — handles both the new structured format (array of phases)
 * and the legacy format (array of {description, qty, unitPrice, amount}).
 */
function parseLineItems(json: string | null | undefined): { phases: PortalPhase[] | null; legacy: { description: string; qty: number; unitPrice: number; amount: number }[] | null } {
  if (!json) return { phases: null, legacy: null };
  try {
    const parsed = JSON.parse(json as string);
    if (!Array.isArray(parsed) || parsed.length === 0) return { phases: null, legacy: null };
    // New format: first element has phaseName + items
    if (parsed[0] && typeof parsed[0].phaseName === "string" && Array.isArray(parsed[0].items)) {
      return { phases: parsed as PortalPhase[], legacy: null };
    }
    // Legacy format: array of {description, qty, unitPrice, amount}
    return { phases: null, legacy: parsed };
  } catch {
    return { phases: null, legacy: null };
  }
}

export default function EstimateDocument({
  estimate: est,
  canApprove = false,
  onApprove,
  children,
}: {
  estimate: EstimateDocumentData;
  canApprove?: boolean;
  onApprove?: () => void;
  /** Rendered inside the document wrapper after the totals (e.g. the portal's footer CTA) */
  children?: React.ReactNode;
}) {
  const { phases, legacy } = parseLineItems(est.lineItemsJson);

  // Totals — resolve tax from stored snapshot
  const taxEnabled = est.taxEnabled === 1 || est.taxEnabled === true;
  const taxAmountCents = taxEnabled ? (est.taxAmount ?? 0) : 0;
  const taxRateCode = est.taxRateCode ?? '0603';
  const customTaxBp = est.customTaxPct ?? 890; // basis points
  // totalAmount already includes tax (grand total) when taxEnabled
  const totalCents = est.totalAmount;
  // Subtotal = totalAmount - taxAmount when tax is enabled
  const subtotalCents = taxEnabled ? totalCents - taxAmountCents : totalCents;
  // Resolve tax label
  const CLARK_TAX_LABELS: Record<string, string> = {
    '0603': 'Vancouver (8.9%)', '0601': 'Battle Ground (8.9%)', '0602': 'Camas (8.8%)',
    '0611': 'La Center (8.8%)', '0604': 'Ridgefield (8.8%)', '0605': 'Washougal (8.6%)',
    '0607': 'Woodland (7.9%)', '0606': 'Yacolt (8.5%)', '0666': 'Clark County Unincorp. PTBA (8.7%)',
    '0600': 'Clark County Unincorp. (8.0%)', 'none': 'No Tax (0%)',
  };
  const taxLabel = taxRateCode === 'custom'
    ? `Custom (${(customTaxBp / 100).toFixed(2)}%)`
    : (CLARK_TAX_LABELS[taxRateCode] ?? taxRateCode);
  const depositCents = est.depositAmount ?? Math.round(totalCents * 0.5);
  const depositPct = est.depositPercent ?? 50;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden" id="estimate-document">

      {/* HP header bar */}
      <div className="bg-[#1a2e1a] px-8 py-5 flex items-center justify-between">
        <div>
          <p className="text-white font-bold text-lg tracking-wide">Handy Pioneers</p>
          <p className="text-green-200 text-xs mt-0.5">{HP_ADDRESS.replace("\n", " · ")}</p>
          <p className="text-green-200 text-xs">{HP_PHONE} · {HP_EMAIL}</p>
        </div>
        <img
          src={HP_LOGO}
          alt="Handy Pioneers"
          className="h-14 w-auto object-contain rounded"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </div>

      {/* Estimate meta */}
      <div className="px-8 py-6 border-b border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Left: customer */}
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Estimate for</p>
            <p className="font-semibold text-gray-900 text-lg">{est.customerName}</p>
            {est.customerAddress && <p className="text-sm text-gray-500 mt-0.5">{est.customerAddress}</p>}
          </div>
          {/* Right: meta grid */}
          <div className="sm:text-right">
            <p className="text-xs text-gray-400 mb-1">Estimate #{est.estimateNumber ?? est.id}</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
              <span className="text-gray-400">Created:</span>
              <span>{fmtDate(est.sentAt)}</span>
              <span className="text-gray-400">Expires:</span>
              <span>{fmtDate(est.expiresAt)}</span>
            </div>
          </div>
        </div>
        {est.scopeOfWork && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Project Overview</p>
            <p>{est.scopeOfWork}</p>
          </div>
        )}
      </div>

      {/* ── Option block ── */}
      <div className="px-8 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <div>
          <p className="font-semibold text-gray-900">Option #1</p>
          <p className="text-sm text-gray-500">{fmtMoney(totalCents)}</p>
        </div>
        {canApprove && onApprove && (
          <Button
            className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white font-semibold px-6"
            onClick={onApprove}
          >
            Approve Estimate
          </Button>
        )}
      </div>

      {/* ── Phase sections (new structured format) ── */}
      {phases && phases.map((phase, pi) => (
        <div key={pi} className="border-b border-gray-100 last:border-0">
          {/* Phase header */}
          <div className="px-8 pt-5 pb-2">
            <p className="font-bold text-gray-900 text-base">{phase.phaseName}</p>
            {phase.phaseDescription && (
              <p className="text-xs text-gray-500 mt-0.5">{phase.phaseDescription}</p>
            )}
          </div>
          {/* Line items table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-y border-gray-100 text-xs text-gray-500">
                  <th className="text-left px-8 py-2 font-semibold">Services</th>
                  <th className="text-right px-4 py-2 font-semibold w-16">Qty</th>
                  <th className="text-right px-4 py-2 font-semibold w-28">Unit Price</th>
                  <th className="text-right px-8 py-2 font-semibold w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {phase.items.map((item, ii) => (
                  <tr key={ii} className="border-b border-gray-50 last:border-0">
                    <td className="px-8 py-3 align-top">
                      <p className="font-semibold text-gray-900">{item.name}</p>
                      {item.scopeOfWork && (
                        <>
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-1 mb-0.5">Scope of Work</p>
                          <p className="text-xs text-gray-600">— {item.scopeOfWork}</p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 align-top">{item.qty}</td>
                    <td className="px-4 py-3 text-right text-gray-600 align-top">{fmtMoneyFlat(item.unitPrice)}</td>
                    <td className="px-8 py-3 text-right font-semibold text-gray-900 align-top">{fmtMoneyFlat(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phase subtotal */}
          <div className="px-8 py-2 text-right text-xs text-gray-500 border-t border-gray-100">
            Services subtotal: <span className="font-semibold text-gray-700">{fmtMoneyFlat(phase.phaseTotal)}</span>
          </div>
        </div>
      ))}

      {/* ── Legacy flat line items (fallback) ── */}
      {!phases && legacy && legacy.length > 0 && (
        <div className="border-b border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-y border-gray-100 text-xs text-gray-500">
                <th className="text-left px-8 py-2 font-semibold">Services</th>
                <th className="text-right px-4 py-2 font-semibold w-16">Qty</th>
                <th className="text-right px-4 py-2 font-semibold w-28">Unit Price</th>
                <th className="text-right px-8 py-2 font-semibold w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {legacy.map((item, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="px-8 py-3 text-gray-700 whitespace-pre-wrap">{item.description}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{item.qty > 0 ? item.qty.toFixed(0) : "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{item.unitPrice > 0 ? fmtMoney(item.unitPrice) : "—"}</td>
                  <td className="px-8 py-3 text-right font-semibold">{fmtMoney(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Totals ── */}
      <div className="px-8 py-5 space-y-2 text-sm">
        {taxEnabled ? (
          <>
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{fmtMoney(subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax ({taxLabel})</span>
              <span>{fmtMoney(taxAmountCents)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-3 mt-1">
              <span>Total</span>
              <span>{fmtMoney(totalCents)}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{fmtMoney(totalCents)}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>Tax (WA — client to verify)</span>
              <span className="italic text-gray-400">Not included</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-3 mt-1">
              <span>Total</span>
              <span>{fmtMoney(totalCents)}</span>
            </div>
          </>
        )}
        {depositCents > 0 && (
          <div className="flex justify-between text-gray-600 text-sm">
            <span>Deposit ({depositPct}%) required to schedule</span>
            <span>{fmtMoney(depositCents)}</span>
          </div>
        )}
      </div>

      {children}
    </div>
  );
}
