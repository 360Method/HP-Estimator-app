// ============================================================
// NewCustomerModal — Full new customer intake form
// Design: Clean white modal matching the reference design.
//         Sections: Contact Info, Address (+ map preview),
//         Notes, Referred By. Footer: Send notifications,
//         Marketing opt-in, Cancel, Create customer.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import AddressAutocomplete, { ParsedAddress } from '@/components/AddressAutocomplete';
import AddressMapPreview from '@/components/AddressMapPreview';
import DuplicateSuggestionBanner from '@/components/DuplicateSuggestionBanner';
import { X, Plus, MapPin, User, Building2, Phone, Mail, AlertTriangle } from 'lucide-react';
import { Customer, CustomerType, LeadSource } from '@/lib/types';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { useEstimator } from '@/contexts/EstimatorContext';
import { trpc } from '@/lib/trpc';

const LEAD_SOURCES: LeadSource[] = [
  'Google', 'Referral', 'Facebook', 'Instagram',
  'Nextdoor', 'Yelp', 'Direct Mail', 'Repeat Customer', 'Other',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

interface Props {
  onClose: () => void;
  onCreated: (customer: Customer) => void;
}

const EMPTY: Omit<Customer, 'id' | 'createdAt' | 'lifetimeValue' | 'outstandingBalance'> = {
  firstName: '',
  lastName: '',
  displayName: '',
  company: '',
  mobilePhone: '',
  homePhone: '',
  workPhone: '',
  additionalPhones: [],
  email: '',
  additionalEmails: [],
  role: '',
  customerType: 'homeowner',
  doNotService: false,
  street: '',
  unit: '',
  city: '',
  state: 'WA',
  zip: '',
  addressNotes: '',
  customerNotes: '',
  billsTo: '',
  tags: [],
  leadSource: '',
  referredBy: '',
  sendNotifications: true,
  sendMarketingOptIn: false,
};

export default function NewCustomerModal({ onClose, onCreated }: Props) {
  const { state, setActiveCustomer } = useEstimator();
  const [form, setForm] = useState({ ...EMPTY });
  const [tagInput, setTagInput] = useState('');
  const [lastParsedLatLng, setLastParsedLatLng] = useState<{ lat?: number; lng?: number }>({});
  const firstNameRef = useRef<HTMLInputElement>(null);

  // Debounced values for duplicate detection
  const [debouncedName, setDebouncedName] = useState('');
  const [debouncedPhone, setDebouncedPhone] = useState('');
  const [debouncedEmail, setDebouncedEmail] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(form.displayName || `${form.firstName} ${form.lastName}`.trim()), 600);
    return () => clearTimeout(t);
  }, [form.firstName, form.lastName, form.displayName]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPhone(form.mobilePhone), 600);
    return () => clearTimeout(t);
  }, [form.mobilePhone]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedEmail(form.email), 600);
    return () => clearTimeout(t);
  }, [form.email]);

  // Auto-build display name from first + last
  useEffect(() => {
    if (!form.displayName || form.displayName === `${form.firstName} ${form.lastName}`.trim()) {
      const auto = [form.firstName, form.lastName].filter(Boolean).join(' ');
      setForm(f => ({ ...f, displayName: auto }));
    }
  }, [form.firstName, form.lastName]);

  // (map preview is handled by AddressMapPreview component)

  // Focus first name on open
  useEffect(() => {
    setTimeout(() => firstNameRef.current?.focus(), 50);
  }, []);

  const set = (key: keyof typeof EMPTY, value: unknown) =>
    setForm(f => ({ ...f, [key]: value }));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (form.tags.includes(t)) { toast.error('Tag already added'); return; }
    setForm(f => ({ ...f, tags: [...f.tags, t] }));
    setTagInput('');
  };

  const removeTag = (tag: string) =>
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));

  const updateAdditionalPhone = (index: number, patch: Partial<{ label: string; number: string }>) => {
    setForm(f => ({
      ...f,
      additionalPhones: (f.additionalPhones ?? []).map((phone, i) => i === index ? { ...phone, ...patch } : phone),
    }));
  };

  const updateAdditionalEmail = (index: number, patch: Partial<{ label: string; address: string }>) => {
    setForm(f => ({
      ...f,
      additionalEmails: (f.additionalEmails ?? []).map((email, i) => i === index ? { ...email, ...patch } : email),
    }));
  };

  const addAdditionalPhone = () => {
    setForm(f => ({ ...f, additionalPhones: [...(f.additionalPhones ?? []), { label: 'Alt', number: '' }] }));
  };

  const addAdditionalEmail = () => {
    setForm(f => ({ ...f, additionalEmails: [...(f.additionalEmails ?? []), { label: 'Alt', address: '' }] }));
  };

  const removeAdditionalPhone = (index: number) => {
    setForm(f => ({ ...f, additionalPhones: (f.additionalPhones ?? []).filter((_, i) => i !== index) }));
  };

  const removeAdditionalEmail = (index: number) => {
    setForm(f => ({ ...f, additionalEmails: (f.additionalEmails ?? []).filter((_, i) => i !== index) }));
  };

  const createCustomerMutation = trpc.customers.create.useMutation({
    onError: (err) => console.warn('[NewCustomerModal] DB create failed (local state preserved):', err.message),
  });

  const handleSubmit = () => {
    if (!form.firstName && !form.displayName) {
      toast.error('Please enter at least a first name or display name');
      return;
    }
    const firstAddressId = nanoid();
    const customerId = nanoid();
    const customer: Customer = {
      ...form,
      id: customerId,
      createdAt: new Date().toISOString(),
      lifetimeValue: 0,
      outstandingBalance: 0,
      addresses: form.street ? [{
        id: firstAddressId,
        label: 'Home',
        street: form.street,
        unit: form.unit,
        city: form.city,
        state: form.state,
        zip: form.zip,
        isPrimary: true,
        lat: lastParsedLatLng.lat,
        lng: lastParsedLatLng.lng,
      }] : [],
    };
    // Persist to DB (fire-and-forget; local state is source of truth for immediate UX)
    createCustomerMutation.mutate({
      displayName: customer.displayName || `${customer.firstName} ${customer.lastName}`.trim() || customer.email || 'New Customer',
      firstName: customer.firstName || '',
      lastName: customer.lastName || '',
      company: customer.company || '',
      email: customer.email || '',
      mobilePhone: customer.mobilePhone || '',
      homePhone: customer.homePhone || '',
      workPhone: customer.workPhone || '',
      additionalPhones: JSON.stringify((customer.additionalPhones ?? []).filter(phone => phone.number.trim())),
      street: customer.street || '',
      unit: customer.unit || '',
      city: customer.city || '',
      state: customer.state || '',
      zip: customer.zip || '',
      customerType: (customer.customerType as any) || 'homeowner',
      leadSource: customer.leadSource || '',
      customerNotes: customer.customerNotes || '',
      tags: customer.tags ?? [],
      role: customer.role || '',
      doNotService: customer.doNotService ?? false,
      billsTo: customer.billsTo || '',
      referredBy: customer.referredBy || '',
      sendNotifications: customer.sendNotifications ?? true,
      sendMarketingOptIn: customer.sendMarketingOptIn ?? false,
      additionalEmails: JSON.stringify((customer.additionalEmails ?? []).filter(email => email.address.trim())),
    });
    onCreated(customer);
    toast.success(`Customer "${customer.displayName || customer.firstName}" created`);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-6 px-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <User size={18} className="text-primary" />
            Add new customer
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-8">

          {/* ── Duplicate Suggestion Banner ── */}
          <DuplicateSuggestionBanner
            name={debouncedName}
            phone={debouncedPhone}
            email={debouncedEmail}
            onUseExisting={(customerId) => {
              // Navigate to the existing customer and close this modal
              setActiveCustomer(customerId);
              toast.success('Switched to existing customer');
              onClose();
            }}
          />

          {/* ── Contact Info ── */}
          <section>
            <SectionHeader icon={<User size={14} />} label="Contact info" />
            <div className="space-y-3 mt-3">
              {/* Row 1: First, Last, Mobile, Company */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <input ref={firstNameRef} type="text" placeholder="First name"
                  value={form.firstName} onChange={e => set('firstName', e.target.value)}
                  className="intake-field" />
                <input type="text" placeholder="Last name"
                  value={form.lastName} onChange={e => set('lastName', e.target.value)}
                  className="intake-field" />
                <input type="tel" placeholder="Mobile phone"
                  value={form.mobilePhone} onChange={e => set('mobilePhone', e.target.value)}
                  className="intake-field" />
                <input type="text" placeholder="Company"
                  value={form.company} onChange={e => set('company', e.target.value)}
                  className="intake-field" />
              </div>

              {/* Row 2: Display name, Home phone, Role */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input type="text" placeholder="Display name (First + Last)"
                  value={form.displayName} onChange={e => set('displayName', e.target.value)}
                  className="intake-field sm:col-span-1"
                  title="Auto-built from First + Last name. Edit to override." />
                <input type="tel" placeholder="Home phone"
                  value={form.homePhone} onChange={e => set('homePhone', e.target.value)}
                  className="intake-field" />
                <input type="text" placeholder="Role"
                  value={form.role} onChange={e => set('role', e.target.value)}
                  className="intake-field" />
              </div>

              {/* Row 3: Email, Work phone, Customer type + Do not service */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                <input type="email" placeholder="Email"
                  value={form.email} onChange={e => set('email', e.target.value)}
                  className="intake-field" />
                <input type="tel" placeholder="Work phone"
                  value={form.workPhone} onChange={e => set('workPhone', e.target.value)}
                  className="intake-field" />
                {/* Customer type + Do not service */}
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="customerType" value="homeowner"
                        checked={form.customerType === 'homeowner'}
                        onChange={() => set('customerType', 'homeowner' as CustomerType)}
                        className="accent-primary" />
                      Homeowner
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="customerType" value="business"
                        checked={form.customerType === 'business'}
                        onChange={() => set('customerType', 'business' as CustomerType)}
                        className="accent-primary" />
                      Business
                    </label>
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.doNotService}
                      onChange={e => set('doNotService', e.target.checked)}
                      className="mt-0.5 accent-destructive" />
                    <span className="text-sm">
                      Mark as{' '}
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 text-[11px] font-semibold rounded">
                        <AlertTriangle size={10} /> Do not service
                      </span>
                    </span>
                  </label>
                  {form.doNotService && (
                    <p className="text-[11px] text-muted-foreground">
                      Notifications will be turned off and it won't be possible to schedule a job or estimate.
                    </p>
                  )}
                </div>
              </div>

              {(form.additionalPhones?.length || 0) > 0 && (
                <div className="space-y-2 rounded-lg border border-border bg-slate-50/70 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Phone size={12} /> Additional phones
                  </p>
                  {form.additionalPhones?.map((phone, index) => (
                    <div key={index} className="grid grid-cols-[84px_1fr_auto] gap-2">
                      <input
                        value={phone.label}
                        onChange={e => updateAdditionalPhone(index, { label: e.target.value })}
                        placeholder="Label"
                        className="intake-field text-xs"
                      />
                      <input
                        type="tel"
                        value={phone.number}
                        onChange={e => updateAdditionalPhone(index, { number: e.target.value })}
                        placeholder="(360) 555-0101"
                        className="intake-field text-xs"
                      />
                      <button onClick={() => removeAdditionalPhone(index)} className="p-2 text-muted-foreground hover:text-destructive">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {(form.additionalEmails?.length || 0) > 0 && (
                <div className="space-y-2 rounded-lg border border-border bg-slate-50/70 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Mail size={12} /> Additional emails
                  </p>
                  {form.additionalEmails?.map((email, index) => (
                    <div key={index} className="grid grid-cols-[84px_1fr_auto] gap-2">
                      <input
                        value={email.label}
                        onChange={e => updateAdditionalEmail(index, { label: e.target.value })}
                        placeholder="Label"
                        className="intake-field text-xs"
                      />
                      <input
                        type="email"
                        value={email.address}
                        onChange={e => updateAdditionalEmail(index, { address: e.target.value })}
                        placeholder="alt@example.com"
                        className="intake-field text-xs"
                      />
                      <button onClick={() => removeAdditionalEmail(index)} className="p-2 text-muted-foreground hover:text-destructive">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button className="intake-add-btn" onClick={addAdditionalEmail}>
                  <Plus size={13} /> Email
                </button>
                <button className="intake-add-btn" onClick={addAdditionalPhone}>
                  <Plus size={13} /> Phone
                </button>
              </div>
            </div>
          </section>

          {/* ── Address ── */}
          <section>
            <SectionHeader icon={<MapPin size={14} />} label="Address" />
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left: address fields */}
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <AddressAutocomplete
                    value={form.street}
                    onChange={v => set('street', v)}
                    onAddressSelect={(parsed: ParsedAddress) => {
                      set('street', parsed.street);
                      if (parsed.unit) set('unit', parsed.unit);
                      if (parsed.city) set('city', parsed.city);
                      if (parsed.state) set('state', parsed.state);
                      if (parsed.zip) set('zip', parsed.zip);
                      setLastParsedLatLng({ lat: parsed.lat, lng: parsed.lng });
                    }}
                    placeholder="Street"
                    className="col-span-2"
                    inputClassName="intake-field"
                  />
                  <input type="text" placeholder="Unit" value={form.unit}
                    onChange={e => set('unit', e.target.value)}
                    className="intake-field" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input type="text" placeholder="City" value={form.city}
                    onChange={e => set('city', e.target.value)}
                    className="intake-field" />
                  <select value={form.state} onChange={e => set('state', e.target.value)}
                    className="intake-field">
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="text" placeholder="Zip" value={form.zip}
                    onChange={e => set('zip', e.target.value)}
                    className="intake-field" />
                </div>
                <input type="text" placeholder="Address Notes" value={form.addressNotes}
                  onChange={e => set('addressNotes', e.target.value)}
                  className="intake-field w-full" />

              </div>

              {/* Right: map preview */}
              <div className="flex flex-col justify-center">
                {form.street ? (
                  <AddressMapPreview
                    street={form.street}
                    city={form.city}
                    state={form.state}
                    zip={form.zip}
                    lat={lastParsedLatLng.lat}
                    lng={lastParsedLatLng.lng}
                    height="176px"
                    showLink
                  />
                ) : (
                  <div className="rounded-lg border border-border bg-slate-50 h-44 flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <MapPin size={20} className="mx-auto mb-1 opacity-30" />
                      <span className="text-xs">Enter an address to preview</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ── Notes ── */}
          <section>
            <SectionHeader icon={<Building2 size={14} />} label="Notes" />
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="text" placeholder="Customer notes"
                value={form.customerNotes} onChange={e => set('customerNotes', e.target.value)}
                className="intake-field" />
              <input type="text" placeholder="This customer bills to"
                value={form.billsTo} onChange={e => set('billsTo', e.target.value)}
                className="intake-field" />

              {/* Tags */}
              <div className="relative">
                <input type="text" placeholder="Customer tags (press enter)"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  className="intake-field w-full" />
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {form.tags.map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-medium rounded-full">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Lead source */}
              <select value={form.leadSource} onChange={e => set('leadSource', e.target.value as LeadSource | '')}
                className="intake-field">
                <option value="">Lead source</option>
                {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </section>

          {/* ── Referred By ── */}
          <section>
            <SectionHeader icon={<Phone size={14} />} label="Referred by" />
            <div className="mt-3">
              <input type="text" placeholder="Referred by"
                value={form.referredBy} onChange={e => set('referredBy', e.target.value)}
                className="intake-field w-full sm:max-w-md" />
            </div>
          </section>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-border bg-slate-50 rounded-b-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.sendNotifications}
                onChange={e => set('sendNotifications', e.target.checked)}
                className="accent-primary" />
              Send notifications
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.sendMarketingOptIn}
                onChange={e => set('sendMarketingOptIn', e.target.checked)}
                className="accent-primary" />
              Send marketing opt-in text
            </label>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit}
              className="px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
              Create customer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-border">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground">{label}</span>
    </div>
  );
}
