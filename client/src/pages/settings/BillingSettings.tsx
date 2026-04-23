import { CreditCard, CheckCircle, ExternalLink } from 'lucide-react';

export default function BillingSettings() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Billing</h2>

      {/* Current Plan */}
      <section className="card-section">
        <div className="card-section-header">
          <CheckCircle size={13} className="text-green-600" />
          <span className="text-xs font-bold uppercase tracking-wider">Current Plan</span>
        </div>
        <div className="card-section-body space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-bold text-foreground">Handy Pioneers Pro</p>
              <p className="text-sm text-muted-foreground">Full access — Field Estimator + CRM + Scheduling</p>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">Active</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
            {[
              { label: 'Plan type', value: 'Owner License' },
              { label: 'Billing cycle', value: 'Monthly' },
              { label: 'Next renewal', value: 'May 1, 2026' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="text-sm text-foreground font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Payment Method */}
      <section className="card-section">
        <div className="card-section-header justify-between">
          <div className="flex items-center gap-2">
            <CreditCard size={13} />
            <span className="text-xs font-bold uppercase tracking-wider">Payment Method</span>
          </div>
          <button className="text-xs text-primary font-semibold hover:underline">Update</button>
        </div>
        <div className="card-section-body">
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
            <div className="w-10 h-7 bg-blue-600 rounded flex items-center justify-center text-white text-[9px] font-bold">VISA</div>
            <div>
              <p className="text-sm font-semibold text-foreground">•••• •••• •••• 4242</p>
              <p className="text-xs text-muted-foreground">Expires 12/27</p>
            </div>
            <span className="ml-auto px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-bold">Default</span>
          </div>
        </div>
      </section>

      {/* Stripe Integration */}
      <section className="card-section">
        <div className="card-section-header justify-between">
          <span className="text-xs font-bold uppercase tracking-wider">Stripe Payment Processing</span>
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline"
          >
            <ExternalLink size={11} /> Stripe Dashboard
          </a>
        </div>
        <div className="card-section-body space-y-2">
          <p className="text-sm text-muted-foreground">
            Stripe is connected for accepting customer payments. Test mode is active — claim your sandbox to go live.
          </p>
          <a
            href="https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVElVU2JCMlBnWE1aT1R0LDE3NzU5NTQzMTkv100YrqMwAHh"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <ExternalLink size={11} /> Claim Stripe Sandbox
          </a>
        </div>
      </section>

      {/* Invoice History placeholder */}
      <section className="card-section">
        <div className="card-section-header">
          <span className="text-xs font-bold uppercase tracking-wider">Invoice History</span>
        </div>
        <div className="card-section-body">
          <p className="text-sm text-muted-foreground italic">No billing invoices yet.</p>
        </div>
      </section>
    </div>
  );
}
