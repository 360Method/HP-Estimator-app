// ============================================================
// CompanySettings — Single source of truth for all app-wide defaults
// FIX: Field component extracted OUTSIDE parent to prevent focus loss on re-render
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import {
  Building2, Clock, MapPin, Save, Loader2, Globe, Phone, Mail,
  FileText, Palette, DollarSign, MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

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

// ── Field is OUTSIDE the parent component so it never remounts on re-render ──
type FieldProps = {
  label: string;
  field: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'select' | 'textarea' | 'number' | 'color';
  options?: { value: string; label: string }[];
  placeholder?: string;
  rows?: number;
  hint?: string;
  draft: Record<string, string | number>;
  setDraft: (updater: (prev: Record<string, string | number>) => Record<string, string | number>) => void;
};

function Field({ label, field, type = 'text', options, placeholder, rows, hint, draft, setDraft }: FieldProps) {
  const value = draft[field] ?? '';

  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </label>
      {type === 'select' ? (
        <select
          value={String(value)}
          onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
          className="field-input"
        >
          {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          value={String(value)}
          onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
          rows={rows ?? 4}
          placeholder={placeholder}
          className="field-input resize-y"
        />
      ) : type === 'color' ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={String(value) || '#1a2e1a'}
            onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
            className="w-10 h-8 rounded border border-border cursor-pointer"
          />
          <input
            type="text"
            value={String(value)}
            onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
            className="field-input flex-1"
            placeholder="#1a2e1a"
          />
        </div>
      ) : type === 'number' ? (
        <input
          type="number"
          value={String(value)}
          onChange={e => setDraft(d => ({ ...d, [field]: e.target.value === '' ? '' : Number(e.target.value) }))}
          placeholder={placeholder}
          className="field-input"
        />
      ) : (
        <input
          type={type}
          value={String(value)}
          onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
          placeholder={placeholder}
          className="field-input"
        />
      )}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

// ── Section wrapper with collapse + save ──────────────────────────────────────
type SectionProps = {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  defaultOpen?: boolean;
};

function Section({ title, icon, children, onSave, saving, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card-section">
      <div className="card-section-header justify-between cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </div>
      {open && (
        <>
          <div className="card-section-body space-y-4">
            {children}
          </div>
          <div className="px-4 pb-4 flex justify-end">
            <Button size="sm" onClick={onSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Save
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

type Tab = 'profile' | 'branding' | 'documents' | 'email-templates';

export default function CompanySettings() {
  const [tab, setTab] = useState<Tab>('profile');
  const [draft, setDraft] = useState<Record<string, string | number>>({});
  const [initialized, setInitialized] = useState(false);

  const { data: settings, isLoading } = trpc.appSettings.getSettings.useQuery();

  // Seed draft once when settings load for the first time
  useEffect(() => {
    if (settings && !initialized) {
      setDraft({ ...settings } as unknown as Record<string, string | number>);
      setInitialized(true);
    }
  }, [settings, initialized]);

  const utils = trpc.useUtils();
  const updateMutation = trpc.appSettings.updateSettings.useMutation({
    onSuccess: () => {
      toast.success('Settings saved');
      utils.appSettings.getSettings.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const save = useCallback((fields: string[]) => {
    const payload: Record<string, unknown> = {};
    for (const k of fields) {
      if (draft[k] !== undefined) payload[k] = draft[k];
    }
    if (Object.keys(payload).length === 0) return;
    updateMutation.mutate(payload as any);
  }, [draft, updateMutation]);

  const fieldProps = { draft, setDraft };
  const saving = updateMutation.isPending;

  if (isLoading || !initialized) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={16} /> Loading settings…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h2 className="text-2xl font-bold text-foreground mb-1">Company Settings</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Every field here is the single source of truth for the entire app — estimates, invoices, the customer portal, automations, and email templates all read from these values.
      </p>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border mb-6 overflow-x-auto">
        {([
          ['profile',         'Business Profile'],
          ['branding',        'Branding & Portal'],
          ['documents',       'Documents & Terms'],
          ['email-templates', 'Email Templates'],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
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

          <Section
            title="Business Information"
            icon={<Building2 size={13} />}
            onSave={() => save(['companyName','supportEmail','supportPhone','websiteUrl','googleReviewLink','addressLine1','addressLine2','timezone'])}
            saving={saving}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company Name" field="companyName" placeholder="Handy Pioneers" {...fieldProps} />
              <Field label="Support Email" field="supportEmail" type="email" placeholder="help@company.com"
                hint="Used in all customer-facing emails and estimates." {...fieldProps} />
              <Field label="Support Phone" field="supportPhone" type="tel" placeholder="(360) 544-9858"
                hint="Shown on estimates, invoices, and the portal." {...fieldProps} />
              <Field label="Website URL" field="websiteUrl" type="url" placeholder="https://handypioneers.com" {...fieldProps} />
              <Field label="Google Review Link" field="googleReviewLink" type="url"
                placeholder="https://g.page/r/YOUR_PLACE_ID/review"
                hint="Injected into review-request SMS automations via {{googleReviewLink}}." {...fieldProps} />
              <Field label="Address Line 1" field="addressLine1" placeholder="808 SE Chkalov Dr 3-433" {...fieldProps} />
              <Field label="City, State ZIP" field="addressLine2" placeholder="Vancouver, WA 98683" {...fieldProps} />
              <Field label="Timezone" field="timezone" type="select" options={TIMEZONES} {...fieldProps} />
            </div>
          </Section>

          <Section
            title="Pricing Defaults"
            icon={<DollarSign size={13} />}
            onSave={() => save(['defaultTaxBps','defaultDepositPct','internalLaborRateCents','defaultMarkupPct'])}
            saving={saving}
          >
            <p className="text-xs text-muted-foreground -mt-1">
              These values pre-fill every new estimate and invoice. Change them here and all future documents will reflect the new defaults automatically.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Field label="Default Tax Rate (basis points)" field="defaultTaxBps" type="number"
                  placeholder="875" hint="875 bps = 8.75%. Shown on estimates and invoices." {...fieldProps} />
                {draft.defaultTaxBps !== undefined && (
                  <p className="text-xs text-muted-foreground mt-1">
                    = {(Number(draft.defaultTaxBps) / 100).toFixed(2)}%
                  </p>
                )}
              </div>
              <Field label="Default Deposit %" field="defaultDepositPct" type="number"
                placeholder="50" hint="% of estimate total required to schedule work." {...fieldProps} />
              <div>
                <Field label="Internal Labor Rate ($/hr)" field="internalLaborRateCents" type="number"
                  placeholder="150" hint="Used in margin calculations. Enter dollars (e.g. 150 = $150/hr)." {...fieldProps} />
              </div>
              <Field label="Default Markup %" field="defaultMarkupPct" type="number"
                placeholder="40" hint="Applied to subcontractor costs when building estimates." {...fieldProps} />
            </div>
          </Section>

          <Section
            title="Document Numbering"
            icon={<FileText size={13} />}
            onSave={() => save(['estimatePrefix','invoicePrefix','jobPrefix'])}
            saving={saving}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Estimate Prefix" field="estimatePrefix" placeholder="EST" {...fieldProps} />
              <Field label="Invoice Prefix" field="invoicePrefix" placeholder="INV" {...fieldProps} />
              <Field label="Job Prefix" field="jobPrefix" placeholder="JOB" {...fieldProps} />
            </div>
          </Section>

          <Section
            title="SMS Settings"
            icon={<MessageSquare size={13} />}
            onSave={() => save(['smsFromName'])}
            saving={saving}
          >
            <Field label="SMS From Name" field="smsFromName" placeholder="Handy Pioneers"
              hint="Shown as the sender name in outbound SMS automations (where carrier supports alphanumeric sender IDs)." {...fieldProps} />
          </Section>

        </div>
      )}

      {/* ── Branding Tab ── */}
      {tab === 'branding' && (
        <div className="space-y-6">

          <Section
            title="Brand Identity"
            icon={<Palette size={13} />}
            onSave={() => save(['brandColor','logoUrl'])}
            saving={saving}
          >
            <Field label="Brand Primary Color" field="brandColor" type="color" {...fieldProps} />
            <Field label="Logo URL (CDN)" field="logoUrl" type="url"
              placeholder="https://cdn.example.com/logo.png"
              hint="Used in email templates, the customer portal header, and PDF documents." {...fieldProps} />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Current Logo Preview</p>
              <div className="w-40 h-28 border border-border rounded-xl flex items-center justify-center bg-white p-3">
                <img
                  src={String(draft.logoUrl || '') || HP_LOGO}
                  alt="Company logo"
                  className="max-w-full max-h-full object-contain"
                  onError={e => { (e.target as HTMLImageElement).src = HP_LOGO; }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Recommended: PNG or SVG, at least 200×200px</p>
            </div>
          </Section>

          <Section
            title="Customer Portal"
            icon={<Globe size={13} />}
            onSave={() => save(['portalUrl'])}
            saving={saving}
          >
            <Field label="Portal Base URL" field="portalUrl" type="url"
              placeholder="https://client.handypioneers.com"
              hint="Used in estimate approval emails, invoice payment links, and all customer-facing communications. Change to white-label the portal for a different domain." {...fieldProps} />
          </Section>

        </div>
      )}

      {/* ── Documents Tab ── */}
      {tab === 'documents' && (
        <div className="space-y-6">

          <Section
            title="Document Footer"
            icon={<FileText size={13} />}
            onSave={() => save(['documentFooter'])}
            saving={saving}
          >
            <Field
              label="Footer text shown on estimates and invoices"
              field="documentFooter"
              type="textarea"
              rows={3}
              placeholder="Optional message shown at the bottom of all customer-facing documents…"
              {...fieldProps}
            />
          </Section>

          <Section
            title="Terms & Conditions"
            icon={<FileText size={13} />}
            onSave={() => save(['termsText'])}
            saving={saving}
          >
            <Field
              label="Shown on estimates and in the customer portal"
              field="termsText"
              type="textarea"
              rows={10}
              placeholder="Enter your terms and conditions…"
              {...fieldProps}
            />
          </Section>

        </div>
      )}

      {/* ── Email Templates Tab ── */}
      {tab === 'email-templates' && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground -mt-2 mb-2">
            These are the transactional emails sent automatically by the portal. Edit subject and body here — changes take effect on the next send. Supports{' '}
            <code className="text-xs bg-muted px-1 rounded">{'{{customerFirstName}}'}</code>,{' '}
            <code className="text-xs bg-muted px-1 rounded">{'{{referenceNumber}}'}</code>,{' '}
            <code className="text-xs bg-muted px-1 rounded">{'{{portalUrl}}'}</code>,{' '}
            <code className="text-xs bg-muted px-1 rounded">{'{{supportPhone}}'}</code>,{' '}
            <code className="text-xs bg-muted px-1 rounded">{'{{companyName}}'}</code>, and other standard variables.
          </p>

          <Section
            title="Estimate Approved"
            icon={<Mail size={13} />}
            onSave={() => save(['emailEstimateApprovedSubject','emailEstimateApprovedBody'])}
            saving={saving}
          >
            <Field label="Subject" field="emailEstimateApprovedSubject"
              placeholder="Your estimate has been approved — Handy Pioneers" {...fieldProps} />
            <Field label="Body" field="emailEstimateApprovedBody" type="textarea" rows={6}
              placeholder="Hi {{customerFirstName}},\n\nThank you for approving your estimate!…" {...fieldProps} />
          </Section>

          <Section
            title="Job Sign-Off"
            icon={<Mail size={13} />}
            onSave={() => save(['emailJobSignOffSubject','emailJobSignOffBody'])}
            saving={saving}
          >
            <Field label="Subject" field="emailJobSignOffSubject"
              placeholder="Job complete — your final invoice is ready" {...fieldProps} />
            <Field label="Body" field="emailJobSignOffBody" type="textarea" rows={6}
              placeholder="Hi {{customerFirstName}},\n\nThank you for signing off on your project!…" {...fieldProps} />
          </Section>

          <Section
            title="Change Order Approved"
            icon={<Mail size={13} />}
            onSave={() => save(['emailChangeOrderApprovedSubject','emailChangeOrderApprovedBody'])}
            saving={saving}
          >
            <Field label="Subject" field="emailChangeOrderApprovedSubject"
              placeholder="Change order approved — Handy Pioneers" {...fieldProps} />
            <Field label="Body" field="emailChangeOrderApprovedBody" type="textarea" rows={6}
              placeholder="Hi {{customerFirstName}},\n\nYour change order has been approved.…" {...fieldProps} />
          </Section>

          <Section
            title="Magic Link Login"
            icon={<Mail size={13} />}
            onSave={() => save(['emailMagicLinkSubject','emailMagicLinkBody'])}
            saving={saving}
          >
            <Field label="Subject" field="emailMagicLinkSubject"
              placeholder="Your Handy Pioneers Customer Portal Login" {...fieldProps} />
            <Field label="Body" field="emailMagicLinkBody" type="textarea" rows={6}
              placeholder="Hi {{customerFirstName}},\n\nClick the link below to access your portal:\n\n{{magicLink}}\n\nThis link expires in 24 hours." {...fieldProps} />
            <p className="text-xs text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{'{{magicLink}}'}</code> where the login URL should appear.
            </p>
          </Section>

        </div>
      )}
    </div>
  );
}
