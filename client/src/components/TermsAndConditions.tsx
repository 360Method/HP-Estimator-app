// ============================================================
// TermsAndConditions — HP-branded T&C modal
// Used in InvoicePrintView footer and anywhere else T&C is needed.
// ============================================================

import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TermsAndConditionsProps {
  onClose: () => void;
}

export default function TermsAndConditions({ onClose }: TermsAndConditionsProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 no-print"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Terms &amp; Conditions</h2>
            <p className="text-xs text-gray-500 mt-0.5">Handy Pioneers, LLC — Effective January 1, 2025</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 flex-1 text-sm text-gray-700 space-y-5 leading-relaxed">

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">1. Services</h3>
            <p>
              Handy Pioneers, LLC ("Company") agrees to perform the services described in the accompanying
              estimate or invoice ("Work"). All Work is subject to these Terms &amp; Conditions. The scope of
              Work is limited to what is expressly stated in the estimate; any additional work requested
              by the customer will be quoted separately before proceeding.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">2. Payment Terms</h3>
            <p>
              Payment is due upon receipt of invoice unless otherwise stated in writing. A deposit may be
              required before Work begins, as specified in the estimate. The Company accepts cash, check,
              Zelle, Venmo, and major credit/debit cards. A 3% processing fee applies to all card
              transactions. Returned checks are subject to a $35 returned-check fee.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">3. Late Payments</h3>
            <p>
              Invoices not paid within 30 days of the due date are subject to a late fee of 1.5% per month
              (18% per annum) on the outstanding balance. The Company reserves the right to suspend or
              withhold services on accounts with overdue balances.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">4. Warranty</h3>
            <p>
              The Company warrants all labor performed for a period of one (1) year from the date of
              completion. This warranty covers defects in workmanship only and does not cover damage caused
              by misuse, neglect, acts of nature, or work performed by others. Manufacturer warranties on
              materials and products are passed through to the customer and are subject to the respective
              manufacturer's terms.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">5. Customer Responsibilities</h3>
            <p>
              The customer is responsible for providing safe and reasonable access to the work area,
              disclosing any known hazards (asbestos, lead paint, mold, etc.), and ensuring that utilities
              (water, electricity, gas) are available as needed. The Company is not liable for delays or
              additional costs resulting from undisclosed conditions discovered during Work.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">6. Materials</h3>
            <p>
              Unless otherwise specified, the Company will supply all necessary materials. Customer-supplied
              materials must be on-site before scheduled Work begins. The Company is not responsible for
              defects in customer-supplied materials. Any materials purchased specifically for a project
              that are subsequently cancelled by the customer will be billed at cost plus a 20% restocking fee.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">7. Cancellation &amp; Rescheduling</h3>
            <p>
              Cancellations or rescheduling requests must be made at least 48 hours before the scheduled
              appointment. Cancellations with less than 48 hours notice may be subject to a cancellation
              fee equal to 15% of the estimated job value, up to $150. Deposits are non-refundable if
              materials have already been ordered or Work has commenced.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">8. Limitation of Liability</h3>
            <p>
              The Company's total liability for any claim arising out of or related to the services provided
              shall not exceed the total amount paid by the customer for the specific Work giving rise to the
              claim. The Company is not liable for indirect, incidental, special, or consequential damages.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">9. Insurance &amp; Licensing</h3>
            <p>
              Handy Pioneers, LLC is a licensed contractor in the State of Washington (License No. HANDYP*761NH)
              and carries general liability insurance and workers' compensation coverage. Certificates of
              insurance are available upon request.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">10. Dispute Resolution</h3>
            <p>
              Any disputes arising from these Terms or the services provided shall first be addressed through
              good-faith negotiation. If unresolved, disputes shall be submitted to binding arbitration in
              Clark County, Washington, in accordance with the rules of the American Arbitration Association.
              These Terms are governed by the laws of the State of Washington.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-gray-900 mb-1">11. Entire Agreement</h3>
            <p>
              These Terms &amp; Conditions, together with the signed estimate or invoice, constitute the entire
              agreement between the parties and supersede all prior discussions, representations, or agreements.
              Any modifications must be made in writing and signed by both parties.
            </p>
          </section>

          <div className="pt-2 border-t border-gray-100 text-xs text-gray-400">
            Handy Pioneers, LLC · 808 SE Chkalov Dr, 3-433 · Vancouver, WA 98683 ·
            (360) 544-9858 · help@handypioneers.com · handypioneers.com
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
