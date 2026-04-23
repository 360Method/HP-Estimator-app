// ============================================================
// HelpPage — Help & Support + Keyboard Shortcuts
// ============================================================

import { useState } from 'react';
import {
  ArrowLeft, HelpCircle, ChevronDown, ChevronUp,
  Mail, Phone, ExternalLink, Keyboard, Search,
} from 'lucide-react';

interface Props {
  onBack: () => void;
  initialTab?: 'help' | 'shortcuts';
}

const FAQS = [
  {
    q: 'How do I create a new estimate?',
    a: 'Click the "New" button in the top-right header and select "New Estimate". Fill in the customer details, then use the Calculator tab to add line items and phases.',
  },
  {
    q: 'How do I convert a lead to an estimate?',
    a: 'Open the lead in the Pipeline view, then click "Convert to Estimate" in the lead card actions. The customer info will carry over automatically.',
  },
  {
    q: 'How do I add multiple addresses to a customer?',
    a: 'Open the customer profile and scroll to the Address card. Click "+ Add Address" to add a new address. You can set any address as the primary address.',
  },
  {
    q: 'How do I send an estimate to a customer?',
    a: 'Navigate to the Estimate tab for the job. Click "Share / Send" to generate a shareable link or download a PDF. The customer can review and sign digitally.',
  },
  {
    q: 'How do I track job tasks?',
    a: 'Open a job and go to the Job Details tab. The Tasks section lets you add tasks with priority levels, assignees, and completion tracking.',
  },
  {
    q: 'How do I upload photos to a job?',
    a: 'In the Job Details tab, scroll to the Attachments section. Drag and drop files or click the upload zone to attach photos and documents.',
  },
  {
    q: 'How do I set up a deposit?',
    a: 'In the Estimate tab, look for the Deposit section. You can set a percentage or flat amount. The deposit and balance are shown on the invoice automatically.',
  },
  {
    q: 'How do I view my schedule?',
    a: 'Click the Schedule icon in the top navigation bar. You can view events in month, week, or day view and filter by job or team member.',
  },
];

const SHORTCUTS = [
  { keys: ['N'], description: 'Open New menu' },
  { keys: ['Esc'], description: 'Close modal / dropdown' },
  { keys: ['?'], description: 'Open keyboard shortcuts' },
  { keys: ['G', 'D'], description: 'Go to Dashboard' },
  { keys: ['G', 'C'], description: 'Go to Customers' },
  { keys: ['G', 'J'], description: 'Go to Jobs' },
  { keys: ['G', 'P'], description: 'Go to Pipeline' },
  { keys: ['G', 'S'], description: 'Go to Schedule' },
  { keys: ['⌘', 'K'], description: 'Quick search' },
  { keys: ['⌘', 'S'], description: 'Save / apply changes' },
  { keys: ['⌘', 'Z'], description: 'Undo last change' },
  { keys: ['Tab'], description: 'Move to next field' },
  { keys: ['Enter'], description: 'Confirm / submit' },
];

export default function HelpPage({ onBack, initialTab = 'help' }: Props) {
  const [tab, setTab] = useState<'help' | 'shortcuts'>(initialTab);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const filteredFaqs = FAQS.filter(
    f => !search || f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Help & Support</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-4">
        <div className="flex gap-0 max-w-2xl mx-auto">
          {[
            { id: 'help', label: 'Help', icon: HelpCircle },
            { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as 'help' | 'shortcuts')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {tab === 'help' && (
          <>
            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search help articles…"
                className="field-input w-full pl-9"
              />
            </div>

            {/* FAQ */}
            <section>
              <h2 className="text-sm font-bold text-foreground mb-3">Frequently Asked Questions</h2>
              <div className="space-y-1.5">
                {filteredFaqs.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No results for "{search}"</p>
                )}
                {filteredFaqs.map((faq, i) => (
                  <div key={i} className="rounded-xl border border-border overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(openFaq === i ? null : i)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
                    >
                      <span>{faq.q}</span>
                      {openFaq === i ? <ChevronUp size={14} className="flex-shrink-0 text-muted-foreground" /> : <ChevronDown size={14} className="flex-shrink-0 text-muted-foreground" />}
                    </button>
                    {openFaq === i && (
                      <div className="px-4 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed border-t border-border/60 bg-muted/20">
                        {faq.a}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Contact */}
            <section className="card-section">
              <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
                <HelpCircle size={13} />
                <span>Contact Support</span>
              </div>
              <div className="card-section-body space-y-3">
                <p className="text-sm text-muted-foreground">
                  Can't find what you're looking for? Our team is here to help.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <a
                    href="mailto:help@handypioneers.com"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Mail size={14} className="text-primary" />
                    help@handypioneers.com
                  </a>
                  <a
                    href="tel:+13605550100"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Phone size={14} className="text-primary" />
                    (360) 555-0100
                  </a>
                </div>
                <a
                  href="https://handypioneers.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink size={12} />
                  Visit handypioneers.com
                </a>
              </div>
            </section>
          </>
        )}

        {tab === 'shortcuts' && (
          <section>
            <p className="text-sm text-muted-foreground mb-4">
              Use these keyboard shortcuts to navigate the app faster.
            </p>
            <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
              {SHORTCUTS.map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                  <span className="text-sm text-foreground">{s.description}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k, ki) => (
                      <span key={ki}>
                        <kbd className="px-2 py-0.5 rounded-md bg-muted border border-border text-xs font-mono font-semibold text-foreground">
                          {k}
                        </kbd>
                        {ki < s.keys.length - 1 && <span className="text-muted-foreground text-xs mx-0.5">then</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
