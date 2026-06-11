// ProfileTab — extracted from CustomerSection.tsx (Phase D2). Reads shared state
// via useClientUmbrella(); markup moved verbatim (no behavior/visual change).
import { toast } from 'sonner';
import {
  Activity, ShieldCheck, User, Save, Edit3, Building2, Phone, Mail, CheckCircle2,
  ExternalLink, CreditCard, X, Plus, Send, Bell, DollarSign, Tag, AtSign, Briefcase,
  MapPin, Trash2, MessageSquare,
} from 'lucide-react';
import { JOB_TYPES, type LeadSource, type PipelineArea } from '@/lib/types';
import { nanoid } from 'nanoid';
import AddressAutocomplete, { type ParsedAddress } from '@/components/AddressAutocomplete';
import AddressMapPreview from '@/components/AddressMapPreview';
import VoiceCallPanel from '@/components/VoiceCallPanel';
import CustomerActivityFeed from '@/components/CustomerActivityFeed';
import { getOpportunityHeat } from '@/components/OpportunityWorkflowPanel';
import Toggle from '@/components/clients/Toggle';
import { fmtDate, fmtDollar } from '@/components/clients/formatters';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

const LEAD_SOURCES: LeadSource[] = [
  'Google', 'Referral', 'Facebook', 'Instagram', 'Nextdoor',
  'Yelp', 'Direct Mail', 'Repeat Customer', 'Other',
];

export default function ProfileTab() {
  const {
    jobInfo, customerProfile, activeCustomer, activeCustomerId, activeOpportunityId,
    opportunities, customerContext, customerContextLoading, launchGaps,
    contactDraft, setContactDraft, editingContact, setEditingContact,
    jobDetailsDraft, setJobDetailsDraft, newTag, setNewTag,
    addingAddress, setAddingAddress, editingAddressId, setEditingAddressId,
    addrForm, setAddrForm, addrLatLng, setAddrLatLng,
    setQuickAction, setShowCallPanel,
    setJobInfo, setCustomerProfile, setActiveOpportunity, setSection,
    addTag, removeTag, sendPortalInvite,
    handleAddAddress, handleUpdateAddress, handleRemoveAddress, handleSetPrimary, handleSetBilling,
    syncToDbMutation, inviteToPortalMutation,
  } = useClientUmbrella();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── Left Sidebar ── */}
      <div className="space-y-4">

        {/* Summary */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Activity size={13} />
            <span>Summary</span>
          </div>
          <div className="card-section-body space-y-3">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Created</div>
              <div className="text-sm font-medium">{fmtDate(customerProfile.createdAt)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Lifetime Value</div>
              <div className="text-sm font-semibold text-emerald-700">{fmtDollar(customerProfile.lifetimeValue)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Outstanding Balance</div>
              <div className={`text-sm font-semibold ${customerProfile.outstandingBalance > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {fmtDollar(customerProfile.outstandingBalance)}
              </div>
            </div>
            {/* Pipeline summary */}
            <div className="pt-2 border-t border-border space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pipeline</div>
              {(['lead', 'estimate', 'job'] as PipelineArea[]).map(area => {
                const count = opportunities.filter(o => o.area === area && !o.archived).length;
                const val = opportunities.filter(o => o.area === area && !o.archived).reduce((s, o) => s + o.value, 0);
                return count > 0 ? (
                  <div key={area} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{area}s</span>
                    <span className="font-medium">{count} · {fmtDollar(val)}</span>
                  </div>
                ) : null;
              })}
              {(() => {
                const active = opportunities.filter(o => !o.archived);
                const hot = active.filter(o => getOpportunityHeat(o.area, o.stage, o.value, o.updatedAt).level === 'hot');
                const warm = active.filter(o => getOpportunityHeat(o.area, o.stage, o.value, o.updatedAt).level === 'warm');
                if (active.length === 0) return null;
                return (
                  <div className="pt-2 mt-2 border-t border-border space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-rose-700 font-medium">Hot</span>
                      <span className="font-semibold">{hot.length}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-amber-700 font-medium">Warm</span>
                      <span className="font-semibold">{warm.length}</span>
                    </div>
                    {hot.slice(0, 3).map(o => (
                      <button
                        key={o.id}
                        className="w-full text-left rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-800 hover:bg-rose-100"
                        onClick={() => {
                          setActiveOpportunity(o.id);
                          setSection('opp-details');
                        }}
                      >
                        <span className="font-semibold uppercase">{o.area}</span> · {o.title}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Launch alignment */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <ShieldCheck size={13} />
            <span>Customer Truth</span>
          </div>
          <div className="card-section-body space-y-2">
            {customerContextLoading ? (
              <div className="text-xs text-muted-foreground">Checking linked records...</div>
            ) : (
              <>
                {[
                  { label: 'Portal account', value: customerContext?.portal?.customer ? 'Linked' : 'Not linked', ok: !!customerContext?.portal?.customer },
                  { label: 'Opportunities', value: String(customerContext?.opportunities?.length ?? 0), ok: (customerContext?.opportunities?.length ?? 0) > 0 },
                  { label: 'Invoices', value: String(customerContext?.invoices?.length ?? 0), ok: true },
                  { label: 'Messages & calls', value: String(customerContext?.conversations?.reduce((sum: number, c: any) => sum + (c.messages?.length ?? 0) + (c.callLogs?.length ?? 0), 0) ?? 0), ok: true },
                  { label: '360 memberships', value: String(customerContext?.memberships?.length ?? 0), ok: true },
                  { label: 'Work orders', value: String(customerContext?.workOrders?.length ?? 0), ok: true },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className={`font-medium ${item.ok ? 'text-foreground' : 'text-amber-700'}`}>{item.value}</span>
                  </div>
                ))}
                {launchGaps.length > 0 && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {launchGaps.length} estimate/job record{launchGaps.length === 1 ? '' : 's'} need portal links or job-scoped messages before launch.
                    <div className="mt-1 text-[11px] text-amber-700">
                      {launchGaps.slice(0, 3).map((summary: any) => summary.opportunity.title).join(', ')}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Contact Info */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <User size={13} />
            <span>Contact Info</span>
            <button onClick={() => setEditingContact(e => !e)} className="ml-auto p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
              {editingContact ? <Save size={13} /> : <Edit3 size={13} />}
            </button>
          </div>
          <div className="card-section-body space-y-3">
            {editingContact ? (
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Name</label>
                  <input type="text" value={contactDraft.client} onChange={e => setContactDraft(d => ({ ...d, client: e.target.value }))}
                    placeholder="Jane Smith" className="field-input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Company</label>
                  <input type="text" value={contactDraft.companyName} onChange={e => setContactDraft(d => ({ ...d, companyName: e.target.value }))}
                    placeholder="Acme Corp" className="field-input w-full text-sm" />
                </div>
                {/* Primary phone + additional phones */}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Primary Phone</label>
                  <input type="tel" value={contactDraft.phone} onChange={e => setContactDraft(d => ({ ...d, phone: e.target.value }))}
                    placeholder="(360) 555-0100" className="field-input w-full text-sm" />
                </div>
                {contactDraft.additionalPhones.map((p, i) => (
                  <div key={i} className="flex gap-1">
                    <input value={p.label} onChange={e => setContactDraft(d => ({ ...d, additionalPhones: d.additionalPhones.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))}
                      placeholder="Label" className="field-input text-xs w-20 shrink-0" />
                    <input type="tel" value={p.number} onChange={e => setContactDraft(d => ({ ...d, additionalPhones: d.additionalPhones.map((x, j) => j === i ? { ...x, number: e.target.value } : x) }))}
                      placeholder="(360) 555-0101" className="field-input text-xs flex-1" />
                    <button onClick={() => setContactDraft(d => ({ ...d, additionalPhones: d.additionalPhones.filter((_, j) => j !== i) }))} className="p-1 text-muted-foreground hover:text-destructive"><X size={12} /></button>
                  </div>
                ))}
                <button onClick={() => setContactDraft(d => ({ ...d, additionalPhones: [...d.additionalPhones, { label: 'Alt', number: '' }] }))}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"><Plus size={11} /> Add phone</button>

                {/* Primary email + additional emails */}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Primary Email</label>
                  <input type="email" value={contactDraft.email} onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))}
                    placeholder="jane@example.com" className="field-input w-full text-sm" />
                </div>
                {contactDraft.additionalEmails.map((em, i) => (
                  <div key={i} className="flex gap-1">
                    <input value={em.label} onChange={e => setContactDraft(d => ({ ...d, additionalEmails: d.additionalEmails.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))}
                      placeholder="Label" className="field-input text-xs w-20 shrink-0" />
                    <input type="email" value={em.address} onChange={e => setContactDraft(d => ({ ...d, additionalEmails: d.additionalEmails.map((x, j) => j === i ? { ...x, address: e.target.value } : x) }))}
                      placeholder="alt@example.com" className="field-input text-xs flex-1" />
                    <button onClick={() => setContactDraft(d => ({ ...d, additionalEmails: d.additionalEmails.filter((_, j) => j !== i) }))} className="p-1 text-muted-foreground hover:text-destructive"><X size={12} /></button>
                  </div>
                ))}
                <button onClick={() => setContactDraft(d => ({ ...d, additionalEmails: [...d.additionalEmails, { label: 'Alt', address: '' }] }))}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"><Plus size={11} /> Add email</button>

                <button onClick={() => {
                  if (contactDraft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactDraft.email)) {
                    toast.error('Invalid email — check for missing @ or typos');
                    return;
                  }
                  setJobInfo(contactDraft);
                  // Persist additional phones/emails to DB
                  if (activeCustomerId) {
                    syncToDbMutation.mutate({
                      id: activeCustomerId,
                      firstName: activeCustomer?.firstName || contactDraft.client.split(' ')[0] || '',
                      lastName: activeCustomer?.lastName || contactDraft.client.split(' ').slice(1).join(' ') || '',
                      displayName: contactDraft.client,
                      company: contactDraft.companyName,
                      mobilePhone: contactDraft.phone,
                      email: contactDraft.email,
                      street: activeCustomer?.street || '',
                      city: activeCustomer?.city || '',
                      state: activeCustomer?.state || '',
                      zip: activeCustomer?.zip || '',
                      tags: activeCustomer?.tags ?? [],
                      leadSource: (activeCustomer?.leadSource || '') as any,
                      customerNotes: activeCustomer?.customerNotes || '',
                      sendNotifications: activeCustomer?.sendNotifications ?? true,
                      sendMarketingOptIn: activeCustomer?.sendMarketingOptIn ?? false,
                      additionalPhones: JSON.stringify(contactDraft.additionalPhones),
                      additionalEmails: JSON.stringify(contactDraft.additionalEmails),
                    });
                  }
                  setEditingContact(false);
                }}
                  className="w-full px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
                  Save Contact
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User size={13} className="text-muted-foreground shrink-0" />
                  <span className="font-medium">{jobInfo.client || <span className="text-muted-foreground italic">No name</span>}</span>
                </div>
                {jobInfo.companyName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 size={13} className="text-muted-foreground shrink-0" />
                    <span>{jobInfo.companyName}</span>
                  </div>
                )}
                {jobInfo.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={13} className="text-muted-foreground shrink-0" />
                    <VoiceCallPanel toNumber={jobInfo.phone} toName={jobInfo.client || 'customer'} label={jobInfo.phone} />
                  </div>
                )}
                {/* Additional phones */}
                {((): { label: string; number: string }[] => { try { const v = (activeCustomer as any)?.additionalPhones; const r = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(r) ? r : []; } catch { return []; } })().filter(p => p.number).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Phone size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{p.label}</span>
                    <VoiceCallPanel toNumber={p.number} toName={jobInfo.client || 'customer'} label={p.number} />
                  </div>
                ))}
                {jobInfo.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={13} className="text-muted-foreground shrink-0" />
                    <a href={`mailto:${jobInfo.email}`} className="text-primary hover:underline truncate">{jobInfo.email}</a>
                  </div>
                )}
                {/* Additional emails */}
                {((): { label: string; address: string }[] => { try { const v = (activeCustomer as any)?.additionalEmails; const r = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(r) ? r : []; } catch { return []; } })().filter(em => em.address).map((em, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Mail size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{em.label}</span>
                    <a href={`mailto:${em.address}`} className="text-primary hover:underline truncate">{em.address}</a>
                  </div>
                ))}
                {/* Customer portal invite */}
                <div className="pt-2 border-t border-border">
                  {customerProfile.portalInviteSent ? (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 size={12} />
                        <span>Portal invite sent {customerProfile.portalInvitedAt ? fmtDate(customerProfile.portalInvitedAt) : ''}</span>
                      </div>
                      <button
                        onClick={sendPortalInvite}
                        disabled={inviteToPortalMutation.isPending}
                        className="text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {inviteToPortalMutation.isPending ? 'Sending…' : 'Resend'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={sendPortalInvite}
                      disabled={inviteToPortalMutation.isPending}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed">
                      <ExternalLink size={12} />
                      {inviteToPortalMutation.isPending ? 'Sending invite…' : 'Invite to customer portal'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment Method */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <CreditCard size={13} />
            <span>Payment Method</span>
          </div>
          <div className="card-section-body space-y-2">
            {customerProfile.paymentMethodOnFile ? (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CreditCard size={14} className="text-emerald-700" />
                <div>
                  <div className="text-xs font-semibold text-emerald-800">Card on file</div>
                  {customerProfile.paymentMethodLast4 && (
                    <div className="text-[10px] text-emerald-700">···· {customerProfile.paymentMethodLast4}</div>
                  )}
                </div>
                <button onClick={() => setCustomerProfile({ paymentMethodOnFile: false, paymentMethodLast4: '' })}
                  className="ml-auto p-1 rounded hover:bg-emerald-100 text-emerald-700 transition-colors">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={() => {
                  const last4 = prompt('Enter last 4 digits of card (or leave blank):') ?? '';
                  setCustomerProfile({ paymentMethodOnFile: true, paymentMethodLast4: last4.slice(-4) });
                  toast.success('Payment method saved');
                }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  <Plus size={13} /> Add credit card
                </button>
                <button onClick={() => toast.info('Request card on file feature coming soon')}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  <Send size={13} /> Request card on file
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Communication Preferences */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Bell size={13} />
            <span>Communication Preferences</span>
          </div>
          <div className="card-section-body divide-y divide-border">
            <Toggle
              checked={customerProfile.notificationsEnabled}
              onChange={v => setCustomerProfile({ notificationsEnabled: v })}
              label="Notifications enabled"
            />
            <Toggle
              checked={customerProfile.smsConsent}
              onChange={v => setCustomerProfile({ smsConsent: v })}
              label="Text message consent"
              sublabel="Customer consents to receive service texts"
            />
            <Toggle
              checked={customerProfile.smsMarketingConsent}
              onChange={v => setCustomerProfile({ smsMarketingConsent: v })}
              label="SMS marketing consent"
              sublabel="Promotional texts and offers"
            />
            <Toggle
              checked={customerProfile.emailMarketingConsent}
              onChange={v => setCustomerProfile({ emailMarketingConsent: v })}
              label="Email marketing consent"
              sublabel="Newsletters and promotions"
            />
          </div>
        </div>

        {/* Default Tax Rate */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <DollarSign size={13} />
            <span>Default Tax Rate</span>
          </div>
          <div className="card-section-body">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Tax jurisdiction for invoices</label>
              <select
                value={customerProfile.defaultTaxCode || '0603'}
                onChange={e => setCustomerProfile({ defaultTaxCode: e.target.value })}
                className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option value="none">No Tax (0%)</option>
                <option value="0600">Clark County Unincorp. Areas (8.0%)</option>
                <option value="0666">Clark County Unincorp. PTBA (8.7%)</option>
                <option value="0601">Battle Ground (8.9%)</option>
                <option value="0602">Camas (8.8%)</option>
                <option value="0611">La Center (8.8%)</option>
                <option value="0604">Ridgefield (8.8%)</option>
                <option value="0603">Vancouver (8.9%) — Default</option>
                <option value="0605">Washougal (8.6%)</option>
                <option value="0607">Woodland (7.9%)</option>
                <option value="0606">Yacolt (8.5%)</option>
                <option value="custom">Custom rate…</option>
              </select>
              <p className="text-xs text-muted-foreground">Pre-fills the tax selector when creating invoices for this customer.</p>
            </div>
          </div>
        </div>

        {/* Customer Tags */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Tag size={13} />
            <span>Customer Tags</span>
          </div>
          <div className="card-section-body space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {customerProfile.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors">
                    <X size={10} />
                  </button>
                </span>
              ))}
              {customerProfile.tags.length === 0 && (
                <span className="text-xs text-muted-foreground italic">No tags yet</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Add tag..."
                className="field-input flex-1 text-xs py-1.5"
              />
              <button onClick={addTag} className="px-2 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs hover:bg-primary/90 transition-colors">
                <Plus size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Lead Source */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <AtSign size={13} />
            <span>Lead Source</span>
          </div>
          <div className="card-section-body">
            <select
              value={customerProfile.leadSource}
              onChange={e => setCustomerProfile({ leadSource: e.target.value as LeadSource | '' })}
              className="field-input w-full"
            >
              <option value="">Select lead source...</option>
              {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Right Main ── */}
      <div className="lg:col-span-2 space-y-4">

        {/* Job Details — only shown when inside an open opportunity */}
        {activeOpportunityId && (
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Briefcase size={13} />
            <span>Job Details</span>
          </div>
          <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Job Type</label>
              <select value={jobInfo.jobType} onChange={e => setJobInfo({ jobType: e.target.value })} className="field-input w-full">
                {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Estimator</label>
              <input type="text" value={jobDetailsDraft.estimator} onChange={e => setJobDetailsDraft(d => ({ ...d, estimator: e.target.value }))} onBlur={() => setJobInfo({ estimator: jobDetailsDraft.estimator })}
                placeholder="e.g. Mike, Sarah" className="field-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Estimate Date</label>
              <input type="date" value={jobInfo.date} onChange={e => setJobInfo({ date: e.target.value })} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Expires Date</label>
              <input type="date" value={jobInfo.expiresDate} onChange={e => setJobInfo({ expiresDate: e.target.value })} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Service Date</label>
              <input type="date" value={jobInfo.servicedDate} onChange={e => setJobInfo({ servicedDate: e.target.value })} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Job Number</label>
              <input type="text" value={jobDetailsDraft.jobNumber} onChange={e => setJobDetailsDraft(d => ({ ...d, jobNumber: e.target.value }))} onBlur={() => setJobInfo({ jobNumber: jobDetailsDraft.jobNumber })} className="field-input w-full" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Scope of Work</label>
              <textarea value={jobDetailsDraft.scope} onChange={e => setJobDetailsDraft(d => ({ ...d, scope: e.target.value }))} onBlur={() => setJobInfo({ scope: jobDetailsDraft.scope })}
                placeholder="e.g. Full trim package — install new baseboard, door casing, and window casing throughout main floor."
                rows={3} className="field-input w-full resize-none" />
            </div>
          </div>
        </div>
        )}

        {/* Addresses — multi-address */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <MapPin size={13} />
            <span>Addresses</span>
            <button
              onClick={() => { setAddingAddress(true); setEditingAddressId(null); setAddrForm({ label: 'Home', street: '', unit: '', city: 'Vancouver', state: 'WA', zip: '', lat: undefined, lng: undefined, propertyNotes: '' }); setAddrLatLng({}); }}
              className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              <Plus size={11} /> Add Address
            </button>
          </div>
          <div className="card-section-body space-y-4">
            {/* Existing addresses */}
            {(activeCustomer?.addresses ?? []).length === 0 && !addingAddress && (
              <p className="text-xs text-muted-foreground">No addresses on file.</p>
            )}
            {(activeCustomer?.addresses ?? []).map(addr => (
              <div key={addr.id} className="rounded-lg border border-border overflow-hidden">
                {/* Address row header */}
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
                  <span className="text-xs font-semibold text-foreground">{addr.label}</span>
                  {addr.isPrimary && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">Primary</span>
                  )}
                  {(addr as any).isBilling && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">Billing</span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {!addr.isPrimary && (
                      <button
                        onClick={() => activeCustomerId && handleSetPrimary(activeCustomerId, addr.id)}
                        className="text-[11px] text-muted-foreground hover:text-primary"
                      >Set Primary</button>
                    )}
                    {!addr.isBilling && (
                      <button
                        onClick={() => activeCustomerId && handleSetBilling(activeCustomerId, addr.id)}
                        className="text-[11px] text-muted-foreground hover:text-blue-500"
                      >Set Billing</button>
                    )}
                    <button
                      onClick={() => {
                        setEditingAddressId(addr.id);
                        setAddingAddress(false);
                        setAddrForm({ label: addr.label, street: addr.street, unit: addr.unit, city: addr.city, state: addr.state, zip: addr.zip, lat: addr.lat, lng: addr.lng, propertyNotes: (addr as any).propertyNotes ?? '' });
                        setAddrLatLng({ lat: addr.lat, lng: addr.lng });
                      }}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    ><Edit3 size={11} /></button>
                    <button
                      onClick={() => activeCustomerId && handleRemoveAddress(activeCustomerId, addr.id)}
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    ><Trash2 size={11} /></button>
                  </div>
                </div>
                {/* Address details + map */}
                {editingAddressId === addr.id ? (
                  <div className="p-3 space-y-2">
                    <input value={addrForm.label} onChange={e => setAddrForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (Home, Rental…)" className="field-input w-full text-xs" />
                    <AddressAutocomplete
                      value={addrForm.street}
                      onChange={v => setAddrForm(f => ({ ...f, street: v }))}
                      onAddressSelect={(p: ParsedAddress) => {
                        setAddrForm(f => ({ ...f, street: p.street, unit: p.unit || f.unit, city: p.city || f.city, state: p.state || f.state, zip: p.zip || f.zip, lat: p.lat, lng: p.lng }));
                        setAddrLatLng({ lat: p.lat, lng: p.lng });
                      }}
                      placeholder="Street"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input value={addrForm.city} onChange={e => setAddrForm(f => ({ ...f, city: e.target.value }))} placeholder="City" className="field-input text-xs" />
                      <input value={addrForm.state} onChange={e => setAddrForm(f => ({ ...f, state: e.target.value }))} placeholder="State" className="field-input text-xs" />
                      <input value={addrForm.zip} onChange={e => setAddrForm(f => ({ ...f, zip: e.target.value }))} placeholder="Zip" className="field-input text-xs" />
                    </div>
                    {addrForm.street && <AddressMapPreview street={addrForm.street} city={addrForm.city} state={addrForm.state} zip={addrForm.zip} lat={addrLatLng.lat} lng={addrLatLng.lng} height="120px" showLink={false} />}
                    <textarea value={(addrForm as any).propertyNotes ?? ''} onChange={e => setAddrForm(f => ({ ...f, propertyNotes: e.target.value }))} placeholder="Property notes (gate code, parking, access instructions…)" rows={2} className="field-input w-full text-xs resize-none" />
                    <div className="flex gap-2">
                      <button onClick={() => {
                        if (!activeCustomerId) return;
                        handleUpdateAddress(activeCustomerId, addr.id, { label: addrForm.label, street: addrForm.street, unit: addrForm.unit, city: addrForm.city, state: addrForm.state, zip: addrForm.zip, lat: addrForm.lat, lng: addrForm.lng, propertyNotes: addrForm.propertyNotes });
                        // Sync jobInfo if this is primary
                        if (addr.isPrimary) setJobInfo({ address: addrForm.street, city: addrForm.city, state: addrForm.state, zip: addrForm.zip });
                        setEditingAddressId(null);
                      }} className="flex-1 text-xs bg-primary text-primary-foreground rounded px-2 py-1.5">Save</button>
                      <button onClick={() => setEditingAddressId(null)} className="text-xs text-muted-foreground hover:text-foreground px-2">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    <div className="text-sm">
                      {[addr.street, addr.unit].filter(Boolean).join(' ')}
                      {(addr.city || addr.state || addr.zip) && <div className="text-xs text-muted-foreground">{[addr.city, addr.state, addr.zip].filter(Boolean).join(', ')}</div>}
                    </div>
                    <AddressMapPreview street={addr.street} city={addr.city} state={addr.state} zip={addr.zip} lat={addr.lat} lng={addr.lng} height="140px" showLink />
                  </div>
                )}
              </div>
            ))}

            {/* Add address form */}
            {addingAddress && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="text-xs font-semibold text-foreground mb-1">New Address</div>
                <input value={addrForm.label} onChange={e => setAddrForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (Home, Rental, Office…)" className="field-input w-full text-xs" />
                <AddressAutocomplete
                  value={addrForm.street}
                  onChange={v => setAddrForm(f => ({ ...f, street: v }))}
                  onAddressSelect={(p: ParsedAddress) => {
                    setAddrForm(f => ({ ...f, street: p.street, unit: p.unit || f.unit, city: p.city || f.city, state: p.state || f.state, zip: p.zip || f.zip, lat: p.lat, lng: p.lng }));
                    setAddrLatLng({ lat: p.lat, lng: p.lng });
                  }}
                  placeholder="Street"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input value={addrForm.city} onChange={e => setAddrForm(f => ({ ...f, city: e.target.value }))} placeholder="City" className="field-input text-xs" />
                  <input value={addrForm.state} onChange={e => setAddrForm(f => ({ ...f, state: e.target.value }))} placeholder="State" className="field-input text-xs" />
                  <input value={addrForm.zip} onChange={e => setAddrForm(f => ({ ...f, zip: e.target.value }))} placeholder="Zip" className="field-input text-xs" />
                </div>
                {addrForm.street && <AddressMapPreview street={addrForm.street} city={addrForm.city} state={addrForm.state} zip={addrForm.zip} lat={addrLatLng.lat} lng={addrLatLng.lng} height="120px" showLink={false} />}
                <textarea value={(addrForm as any).propertyNotes ?? ''} onChange={e => setAddrForm(f => ({ ...f, propertyNotes: e.target.value }))} placeholder="Property notes (gate code, parking, access instructions…)" rows={2} className="field-input w-full text-xs resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => {
                    if (!activeCustomerId || !addrForm.street) { toast.error('Street is required'); return; }
                    const isFirst = (activeCustomer?.addresses ?? []).length === 0;
                    handleAddAddress(activeCustomerId, { id: nanoid(), label: addrForm.label || 'Home', street: addrForm.street, unit: addrForm.unit, city: addrForm.city, state: addrForm.state, zip: addrForm.zip, isPrimary: isFirst, lat: addrForm.lat, lng: addrForm.lng, propertyNotes: (addrForm as any).propertyNotes });
                    if (isFirst) setJobInfo({ address: addrForm.street, city: addrForm.city, state: addrForm.state, zip: addrForm.zip });
                    setAddingAddress(false);
                  }} className="flex-1 text-xs bg-primary text-primary-foreground rounded px-2 py-1.5">Add Address</button>
                  <button onClick={() => setAddingAddress(false)} className="text-xs text-muted-foreground hover:text-foreground px-2">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Private Notes */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Edit3 size={13} />
            <span>Private Notes</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-normal">Internal only — not visible to customer</span>
          </div>
          <div className="card-section-body">
            <textarea
              value={customerProfile.privateNotes}
              onChange={e => setCustomerProfile({ privateNotes: e.target.value })}
              placeholder="Add private notes about this customer — preferences, special instructions, history..."
              rows={4}
              className="field-input w-full resize-none"
            />
          </div>
        </div>

        {/* Activity Feed — server-backed unified feed */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Activity size={13} />
            <span>Activity Feed</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-normal">All channels — live</span>
          </div>
          <div className="card-section-body space-y-3">
            {/* Quick note shortcut */}
            <div className="flex gap-2">
              <button
                onClick={() => { setQuickAction('note'); setShowCallPanel(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="flex-1 text-left field-input text-sm text-muted-foreground hover:text-foreground cursor-text"
              >
                Add an internal note…
              </button>
              <button
                onClick={() => { setQuickAction('sms'); setShowCallPanel(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                title="Send SMS"
              ><MessageSquare size={13} /></button>
              <button
                onClick={() => { setQuickAction('email'); setShowCallPanel(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:border-sky-500 hover:text-sky-600 transition-colors"
                title="Send Email"
              ><Mail size={13} /></button>
              <button
                onClick={() => { setShowCallPanel(true); setQuickAction(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:border-emerald-500 hover:text-emerald-600 transition-colors"
                title="Call"
              ><Phone size={13} /></button>
            </div>

            {/* Feed — shared CustomerActivityFeed component */}
            {activeCustomerId && (
              <CustomerActivityFeed customerId={activeCustomerId} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
