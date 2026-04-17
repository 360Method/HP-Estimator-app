// ============================================================
// CompanySettings — DB-backed via trpc.appSettings
// White-label foundation: all fields persist to appSettings table
// ============================================================

import { useState, useEffect } from 'react';
import { Building2, Clock, MapPin, Save, Edit2, X, Check, Loader2, Globe, Phone, Mail, FileText, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';

const TIMEZONES = [
  { value: 'America/Los_Angeles', label: '(GMT-08:00) Pacific Time — Los Angeles' },
  { value: 'America/Denver',      label: '(GMT-07:00) Mountain Time — Denver' },
  { value: 'America/Chicago',     label: '(GMT-06:00) Central Time — Chicago' },
  { value: 'America/New_York',    label: '(GMT-05:00) Eastern Time — New York' },
  { value: 'America/Phoenix',     label: '(GMT-07:00) Arizona (no DST)' },
  { value: 'America/Anchorage',   label: '(GMT-09:00) Alaska' },
  { value: 'Pacific/Honolulu',    label: '(GMT-10:00) Hawaii' },
];

type Tab = 'profile' | 'branding' | 'documents' | 'email-templates';

export default function CompanySettings() {
  const [tab, setTab] = useState<Tab>('profile');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string | number>>({});

  const { data: settings, isLoading } = trpc.appSettings.getSettings.useQuery();
  const updateMutation = trpc.appSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success('Settings saved');
      setEditing(null);
      setDraft({});
      utils.appSettings.getSettings.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const utils = trpc.useUtils();

  // Seed draft when settings load or editing section changes
  useEffect(() => {
    if (settings && editing) {
      setDraft({ ...settings } as Record<string, string | number>);
    }
  }, [editing, settings]);

  const startEdit = (section: string) => setEditing(section);
  const cancelEdit = () => { setEditing(null); setDraft({}); };

  const saveEdit = () => {
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v !== (settings as any)?.[k]) payload[k] = v;
    }
    if (Object.keys(payload).length === 0) { setEditing(null); return; }
    updateMutation.mutate(payload as any);
  };

  const EditBar = ({ section }: { section: string }) => (
    editing === section ? (
      <div className="flex items-center gap-2">
        <button
          onClick={saveEdit}
          disabled={updateMutation.isPending}
          className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline disabled:opacity-50"
        >
          {updateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
        </button>
        <button onClick={cancelEdit} className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
          <X size={12} /> Cancel
        </button>
      </div>
    ) : (
      <button onClick={() => startEdit(section)} className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
        <Edit2 size={12} /> Edit
      </button>
    )
  );

  const Field = ({
    label, field, type = 'text', options, placeholder, rows,
  }: {
    label: string;
    field: string;
    type?: 'text' | 'email' | 'tel' | 'url' | 'select' | 'textarea' | 'number' | 'color';
    options?: { value: string; label: string }[];
    placeholder?: string;
    rows?: number;
  }) => {
    const value = (settings as any)?.[field] ?? '';
    const draftValue = draft[field] ?? value;
    const isEditMode = editing !== null;

    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
        {isEditMode ? (
          type === 'select' ? (
            <select
              value={String(draftValue)}
              onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
              className="field-input"
            >
              {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : type === 'textarea' ? (
            <textarea
              value={String(draftValue)}
              onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
              rows={rows ?? 4}
              placeholder={placeholder}
              className="field-input resize-none"
            />
          ) : type === 'color' ? (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={String(draftValue)}
                onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                className="w-10 h-8 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={String(draftValue)}
                onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                className="field-input flex-1"
                placeholder="#1E3A5F"
              />
            </div>
          ) : (
            <input
              type={type}
              value={String(draftValue)}
              onChange={e => setDraft(d => ({ ...d, [field]: type === 'number' ? Number(e.target.value) : e.target.value }))}
              placeholder={placeholder}
              className="field-input"
            />
          )
        ) : (
          <p className="text-sm text-foreground">
            {type === 'color' && value ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border border-border inline-block" style={{ background: String(value) }} />
                {String(value)}
              </span>
            ) : (
              String(value) || <span className="text-muted-foreground italic">(Not set)</span>
            )}
          </p>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={16} /> Loading settings…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h2 className="text-2xl font-bold text-foreground mb-1">Company</h2>
      <p className="text-sm text-muted-foreground mb-6">
        These settings are the foundation for white-labeling. Every field here is persisted to the database and used across estimates, invoices, the customer portal, and any future white-labeled deployments.
      </p>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border mb-6">
        {([
          ['profile', 'Business Profile'],
          ['branding', 'Branding & Portal'],
          ['documents', 'Documents & Terms'],
          ['email-templates', 'Email Templates'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Profile Tab ── */}
      {tab === 'profile' && (
        <div className="space-y-6">
          <section className="card-section">
            <div className="card-section-header justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={13} />
                <span className="text-xs font-bold uppercase tracking-wider">Business Information</span>
              </div>
              <EditBar section="business-info" />
            </div>
            <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company Name" field="companyName" placeholder="Handy Pioneers" />
              <Field label="Support Email" field="supportEmail" type="email" placeholder="help@company.com" />
              <Field label="Support Phone" field="supportPhone" type="tel" placeholder="(360) 544-9858" />
              <Field label="Website URL" field="websiteUrl" type="url" placeholder="https://handypioneers.com" />
              <Field label="Google Review Link" field="googleReviewLink" type="url" placeholder="https://g.page/r/YOUR_PLACE_ID/review" />
              <Field label="Address Line 1" field="addressLine1" placeholder="808 SE Chkalov Dr 3-433" />
              <Field label="City, State ZIP" field="addressLine2" placeholder="Vancouver, WA 98683" />
              <Field label="Timezone" field="timezone" type="select" options={TIMEZONES} />
            </div>
          </section>

          <section className="card-section">
            <div className="card-section-header justify-between">
              <div className="flex items-center gap-2">
                <Globe size={13} />
                <span className="text-xs font-bold uppercase tracking-wider">Document Numbering</span>
              </div>
              <EditBar section="numbering" />
            </div>
            <div className="card-section-body grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Estimate Prefix" field="estimatePrefix" placeholder="EST" />
              <Field label="Invoice Prefix" field="invoicePrefix" placeholder="INV" />
              <Field label="Job Prefix" field="jobPrefix" placeholder="JOB" />
            </div>
          </section>

          <section className="card-section">
            <div className="card-section-header justify-between">
              <div className="flex items-center gap-2">
                <FileText size={13} />
                <span className="text-xs font-bold uppercase tracking-wider">Defaults</span>
              </div>
              <EditBar section="defaults" />
            </div>
            <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Default Tax Rate (basis points)</p>
                {editing !== null ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={Number(draft.defaultTaxBps ?? settings?.defaultTaxBps ?? 875)}
                      onChange={e => setDraft(d => ({ ...d, defaultTaxBps: Number(e.target.value) }))}
                      min={0} max={10000}
                      className="field-input w-28"
                    />
                    <span className="text-xs text-muted-foreground">= {((Number(draft.defaultTaxBps ?? settings?.defaultTaxBps ?? 875)) / 100).toFixed(2)}%</span>
                  </div>
                ) : (
                  <p className="text-sm text-foreground">{settings?.defaultTaxBps ?? 875} bps ({((settings?.defaultTaxBps ?? 875) / 100).toFixed(2)}%)</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Default Deposit %</p>
                {editing !== null ? (
                  <input
                    type="number"
                    value={Number(draft.defaultDepositPct ?? settings?.defaultDepositPct ?? 50)}
                    onChange={e => setDraft(d => ({ ...d, defaultDepositPct: Number(e.target.value) }))}
                    min={0} max={100}
                    className="field-input w-24"
                  />
                ) : (
                  <p className="text-sm text-foreground">{settings?.defaultDepositPct ?? 50}%</p>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── Branding Tab ── */}
      {tab === 'branding' && (
        <div className="space-y-6">
          <section className="card-section">
            <div className="card-section-header justify-between">
              <div className="flex items-center gap-2">
                <Palette size={13} />
                <span className="text-xs font-bold uppercase tracking-wider">Brand Identity</span>
              </div>
              <EditBar section="branding" />
            </div>
            <div className="card-section-body space-y-4">
              <Field label="Brand Primary Color" field="brandColor" type="color" />
              <Field label="Logo URL (CDN)" field="logoUrl" type="url" placeholder="https://cdn.example.com/logo.png" />
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Current Logo Preview</p>
                <div className="w-40 h-28 border border-border rounded-xl flex items-center justify-center bg-white p-3">
                  <img
                    src={settings?.logoUrl || HP_LOGO}
                    alt="Company logo"
                    className="max-w-full max-h-full object-contain"
                    onError={e => { (e.target as HTMLImageElement).src = HP_LOGO; }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">Recommended: PNG or SVG, at least 200×200px</p>
              </div>
            </div>
          </section>

          <section className="card-section">
            <div className="card-section-header justify-between">
              <div className="flex items-center gap-2">
                <Globe size={13} />
                <span className="text-xs font-bold uppercase tracking-wider">Customer Portal</span>
              </div>
              <EditBar section="portal" />
            </div>
            <div className="card-section-body">
              <Field label="Portal Base URL" field="portalUrl" type="url" placeholder="https://client.handypioneers.com" />
              <p className="text-xs text-muted-foreground mt-2">
                Used in estimate approval emails, invoice payment links, and all customer-facing communications. Change this to white-label the portal for a different domain.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* ── Email Templates Tab ── */}
      {tab === 'email-templates' && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground -mt-2 mb-2">
            These are the transactional confirmation emails sent automatically by the portal. Edit the subject and body here — they will be used the next time that event fires. Supports <code className="text-xs bg-muted px-1 rounded">{'{{customerFirstName}}'}</code>, <code className="text-xs bg-muted px-1 rounded">{'{{referenceNumber}}'}</code>, <code className="text-xs bg-muted px-1 rounded">{'{{portalUrl}}'}</code>, and other standard variables.
          </p>

          <section className="card-section">
            <div className="card-section-header justify-between">
              <div className="flex items-center gap-2">
                <Mail size={13} />
                <span className="text-xs font-bold uppercase tracking-wider">Estimate Approved</span>
              </div>
              <EditBar section="email-estimate-approved" />
            </div>
            <div className="card-section-body space-y-4">
              <Field label="Subject" field="emailEstimateApprovedSubject" placeholder="Your estimate has been approved — Handy Pioneers" />
              <Field
                label="Body"
                field="emailEstimateApprovedBody"
                type="textarea"
                rows={6}
                placeholder="Hi {{customerFirstName}},\n\nThank you for approving your estimate! We'll be in touch shortly to schedule your project.\n\nBest,\nThe Handy Pioneers Team"
              />
            </div>
          </section>

          <section className="card-section">
            <div className="card-section-header justify-between">
              <div className="flex items-center gap-2">
                <Mail size={13} />
                <span className="text-xs font-bold uppercase tracking-wider">Job Sign-Off</span>
              </div>
              <EditBar section="email-job-signoff" />
            </div>
            <div className="card-section-body space-y-4">
              <Field label="Subject" field="emailJobSignOffSubject" placeholder="Job complete — your final invoice is ready" />
              <Field
                label="Body"
                field="emailJobSignOffBody"
                type="textarea"
                rows={6}
                placeholder="Hi {{customerFirstName}},\n\nThank you for signing off on your project! Your final invoice is available in your portal.\n\nBest,\nThe Handy Pioneers Team"
              />
            </div>
          </section>

          <section className="card-section">
            <div className="card-section-header justify-between">
              <div className="flex items-center gap-2">
                <Mail size={13} />
                <span className="text-xs font-bold uppercase tracking-wider">Change Order Approved</span>
              </div>
              <EditBar section="email-change-order" />
            </div>
            <div className="card-section-body space-y-4">
              <Field label="Subject" field="emailChangeOrderApprovedSubject" placeholder="Change order approved — Handy Pioneers" />
              <Field
                label="Body"
                field="emailChangeOrderApprovedBody"
                type="textarea"
                rows={6}
                placeholder="Hi {{customerFirstName}},\n\nYour change order has been approved. We'll proceed with the updated scope.\n\nBest,\nThe Handy Pioneers Team"
              />
            </div>
          </section>

          <section className="card-section">
            <div className="card-section-header justify-between">
              <div className="flex items-center gap-2">
                <Mail size={13} />
                <span className="text-xs font-bold uppercase tracking-wider">Magic Link Login</span>
              </div>
              <EditBar section="email-magic-link" />
            </div>
            <div className="card-section-body space-y-4">
              <Field label="Subject" field="emailMagicLinkSubject" placeholder="Your Handy Pioneers Customer Portal Login" />
              <Field
                label="Body"
                field="emailMagicLinkBody"
                type="textarea"
                rows={6}
                placeholder="Hi {{customerFirstName}},\n\nClick the link below to access your customer portal:\n\n{{magicLink}}\n\nThis link expires in 24 hours.\n\nBest,\nThe Handy Pioneers Team"
              />
              <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">{'{{magicLink}}'}</code> where the login URL should appear.</p>
            </div>
          </section>
        </div>
      )}

      {/* ── Documents Tab ── */}
      {tab === 'documents' && (
        <div className="space-y-6">
          <section className="card-section">
            <div className="card-section-header justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">Document Footer</span>
              <EditBar section="footer" />
            </div>
            <div className="card-section-body">
              <Field
                label="Footer text shown on estimates and invoices"
                field="documentFooter"
                type="textarea"
                rows={3}
                placeholder="Optional message shown at the bottom of all customer-facing documents…"
              />
            </div>
          </section>

          <section className="card-section">
            <div className="card-section-header justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">Terms & Conditions</span>
              <EditBar section="terms" />
            </div>
            <div className="card-section-body">
              <Field
                label="Shown on estimates and in the customer portal"
                field="termsText"
                type="textarea"
                rows={8}
                placeholder="Enter your terms and conditions…"
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
