// ============================================================
// CompanySettings — Business info, description, logo, T&C, hours, service area
// Pre-filled with Handy Pioneers data
// ============================================================

import { useState } from 'react';
import { Building2, Clock, MapPin, Save, Edit2, X, Check } from 'lucide-react';
import { toast } from 'sonner';

const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';

const TIMEZONES = [
  '(GMT-08:00) Pacific Time - Los Angeles',
  '(GMT-07:00) Mountain Time - Denver',
  '(GMT-06:00) Central Time - Chicago',
  '(GMT-05:00) Eastern Time - New York',
];

const HOURS_DEFAULT = [
  { day: 'Monday',    open: '07:00', close: '17:00', closed: false },
  { day: 'Tuesday',   open: '07:00', close: '17:00', closed: false },
  { day: 'Wednesday', open: '07:00', close: '17:00', closed: false },
  { day: 'Thursday',  open: '07:00', close: '17:00', closed: false },
  { day: 'Friday',    open: '07:00', close: '17:00', closed: false },
  { day: 'Saturday',  open: '08:00', close: '14:00', closed: false },
  { day: 'Sunday',    open: '',      close: '',       closed: true  },
];

type Tab = 'profile' | 'hours' | 'service-area';

interface BusinessInfo {
  name: string; address: string; city: string; state: string; zip: string;
  timezone: string; supportEmail: string; licenseNumber: string;
  phone: string; website: string; legalName: string; industry: string;
  description: string; invoiceMessage: string; termsAndConditions: string;
}

export default function CompanySettings() {
  const [tab, setTab] = useState<Tab>('profile');
  const [editing, setEditing] = useState<string | null>(null);
  const [info, setInfo] = useState<BusinessInfo>({
    name: 'Handy Pioneers',
    address: '808 SE Chkalov Dr 3-433',
    city: 'Vancouver', state: 'WA', zip: '98683',
    timezone: '(GMT-08:00) Pacific Time - Los Angeles',
    supportEmail: 'help@handypioneers.com',
    licenseNumber: 'HANDYP*761NH',
    phone: '(360) 544-9858',
    website: 'https://handypioneers.com',
    legalName: 'PIONEER PACIFIC PROPERTIES, LLC',
    industry: 'General Contractor',
    description: 'At Handy Pioneers, we believe every home deserves revitalization and functional improvements that reflect your unique style. Our professional team works diligently to transform your spaces into places you\'ll love. Reach out today to request an estimate for our unparalleled handyman and remodeling services.',
    invoiceMessage: '',
    termsAndConditions: `WA Contractor License: HANDYP*761NH\nWebsite: www.HandyPioneers.com\nPhone: 360-544-9858\n\nPayment is due upon completion unless otherwise agreed in writing. A 50% deposit may be required for projects over $1,000. All work is guaranteed for 1 year from completion date. Customer is responsible for obtaining any required permits unless otherwise specified in the estimate.`,
  });
  const [draft, setDraft] = useState<Partial<BusinessInfo>>({});
  const [hours, setHours] = useState(HOURS_DEFAULT);
  const [serviceRadius, setServiceRadius] = useState(50);
  const [serviceNote, setServiceNote] = useState('Serving the greater Vancouver, WA and Portland, OR metro area. We travel up to 50 miles from our base in Vancouver, WA.');

  const startEdit = (section: string) => {
    setDraft({ ...info });
    setEditing(section);
  };

  const saveEdit = () => {
    setInfo(prev => ({ ...prev, ...draft }));
    setEditing(null);
    toast.success('Settings saved');
  };

  const cancelEdit = () => { setDraft({}); setEditing(null); };

  const EditBar = ({ section }: { section: string }) => (
    editing === section ? (
      <div className="flex items-center gap-2">
        <button onClick={saveEdit} className="flex items-center gap-1 text-xs text-primary font-semibold hover:underline">
          <Check size={12} /> Save
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

  const Field = ({ label, value, field, type = 'text', options }: {
    label: string; value: string; field: keyof BusinessInfo;
    type?: 'text' | 'email' | 'tel' | 'url' | 'select' | 'textarea';
    options?: string[];
  }) => (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      {editing === 'business-info' || editing === 'description' || editing === 'invoice-message' || editing === 'terms' ? (
        type === 'select' ? (
          <select
            value={draft[field] ?? value}
            onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
            className="field-input"
          >
            {options?.map(o => <option key={o}>{o}</option>)}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            value={draft[field] ?? value}
            onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
            rows={4}
            className="field-input resize-none"
          />
        ) : (
          <input
            type={type}
            value={draft[field] ?? value}
            onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
            className="field-input"
          />
        )
      ) : (
        <p className="text-sm text-foreground">{value || <span className="text-muted-foreground italic">(Optional)</span>}</p>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h2 className="text-2xl font-bold text-foreground mb-1">Company</h2>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border mb-6">
        {([['profile', 'Profile'], ['hours', 'Business hours'], ['service-area', 'Service area']] as [Tab, string][]).map(([id, label]) => (
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

      {tab === 'profile' && (
        <div className="space-y-6">
          {/* Business Information */}
          <section className="card-section">
            <div className="card-section-header justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={13} />
                <span className="text-xs font-bold uppercase tracking-wider">Business Information</span>
              </div>
              <EditBar section="business-info" />
            </div>
            <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Business name" value={info.name} field="name" />
              <Field label="Address" value={`${info.address}, ${info.city}, ${info.state} ${info.zip}`} field="address" />
              <Field label="Time Zone" value={info.timezone} field="timezone" type="select" options={TIMEZONES} />
              <Field label="Support email" value={info.supportEmail} field="supportEmail" type="email" />
              <Field label="License number" value={info.licenseNumber} field="licenseNumber" />
              <Field label="Business phone" value={info.phone} field="phone" type="tel" />
              <Field label="Website" value={info.website} field="website" type="url" />
              <Field label="Legal entity name" value={info.legalName} field="legalName" />
              <Field label="Industry" value={info.industry} field="industry" />
            </div>
          </section>

          {/* Company Description */}
          <section className="card-section">
            <div className="card-section-header justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">Company Description</span>
              <EditBar section="description" />
            </div>
            <div className="card-section-body">
              <Field label="" value={info.description} field="description" type="textarea" />
            </div>
          </section>

          {/* Logo */}
          <section className="card-section">
            <div className="card-section-header justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">Logo</span>
              <button className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
                <Edit2 size={12} /> Edit
              </button>
            </div>
            <div className="card-section-body">
              <div className="w-40 h-28 border border-border rounded-xl flex items-center justify-center bg-white p-3">
                <img src={HP_LOGO} alt="Handy Pioneers logo" className="max-w-full max-h-full object-contain" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Recommended: PNG or SVG, at least 200×200px</p>
            </div>
          </section>

          {/* Invoice / Estimate message */}
          <section className="card-section">
            <div className="card-section-header justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">Message on invoice, receipt, and estimate</span>
              <EditBar section="invoice-message" />
            </div>
            <div className="card-section-body">
              {editing === 'invoice-message' ? (
                <textarea
                  value={draft.invoiceMessage ?? info.invoiceMessage}
                  onChange={e => setDraft(d => ({ ...d, invoiceMessage: e.target.value }))}
                  rows={3}
                  placeholder="Optional message shown on all customer-facing documents…"
                  className="field-input resize-none"
                />
              ) : (
                <p className="text-sm text-muted-foreground italic">{info.invoiceMessage || '(Optional)'}</p>
              )}
            </div>
          </section>

          {/* Terms & Conditions */}
          <section className="card-section">
            <div className="card-section-header justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">Terms and Conditions</span>
              <EditBar section="terms" />
            </div>
            <div className="card-section-body">
              {editing === 'terms' ? (
                <textarea
                  value={draft.termsAndConditions ?? info.termsAndConditions}
                  onChange={e => setDraft(d => ({ ...d, termsAndConditions: e.target.value }))}
                  rows={6}
                  className="field-input resize-none font-mono text-xs"
                />
              ) : (
                <pre className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">{info.termsAndConditions}</pre>
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'hours' && (
        <div className="space-y-4">
          <section className="card-section">
            <div className="card-section-header">
              <Clock size={13} />
              <span className="text-xs font-bold uppercase tracking-wider">Business Hours</span>
            </div>
            <div className="card-section-body divide-y divide-border/60">
              {hours.map((h, i) => (
                <div key={h.day} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="w-24 text-sm font-semibold text-foreground">{h.day}</span>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!h.closed}
                      onChange={e => setHours(prev => prev.map((r, ri) => ri === i ? { ...r, closed: !e.target.checked } : r))}
                      className="rounded"
                    />
                    Open
                  </label>
                  {!h.closed ? (
                    <div className="flex items-center gap-2 ml-auto">
                      <input
                        type="time"
                        value={h.open}
                        onChange={e => setHours(prev => prev.map((r, ri) => ri === i ? { ...r, open: e.target.value } : r))}
                        className="field-input w-28 text-xs"
                      />
                      <span className="text-muted-foreground text-xs">to</span>
                      <input
                        type="time"
                        value={h.close}
                        onChange={e => setHours(prev => prev.map((r, ri) => ri === i ? { ...r, close: e.target.value } : r))}
                        className="field-input w-28 text-xs"
                      />
                    </div>
                  ) : (
                    <span className="ml-auto text-xs text-muted-foreground italic">Closed</span>
                  )}
                </div>
              ))}
            </div>
          </section>
          <button
            onClick={() => { toast.success('Business hours saved'); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Save size={14} /> Save Hours
          </button>
        </div>
      )}

      {tab === 'service-area' && (
        <div className="space-y-4">
          <section className="card-section">
            <div className="card-section-header">
              <MapPin size={13} />
              <span className="text-xs font-bold uppercase tracking-wider">Service Area</span>
            </div>
            <div className="card-section-body space-y-4">
              <div>
                <label className="field-label">Service radius (miles from Vancouver, WA)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5} max={150} step={5}
                    value={serviceRadius}
                    onChange={e => setServiceRadius(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm font-bold text-primary w-12">{serviceRadius} mi</span>
                </div>
              </div>
              <div>
                <label className="field-label">Service area description</label>
                <textarea
                  value={serviceNote}
                  onChange={e => setServiceNote(e.target.value)}
                  rows={3}
                  className="field-input resize-none"
                />
              </div>
              <div className="rounded-xl border border-border overflow-hidden h-48 bg-muted/30 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Map preview — centered on Vancouver, WA</p>
              </div>
            </div>
          </section>
          <button
            onClick={() => toast.success('Service area saved')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Save size={14} /> Save Service Area
          </button>
        </div>
      )}
    </div>
  );
}
