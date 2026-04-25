import { ExternalLink, CheckCircle, XCircle, Plug, Loader2, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { useLocation } from 'wouter';

interface StaticIntegration {
  id: string;
  name: string;
  description: string;
  category: string;
  logoText: string;
  logoColor: string;
  connectUrl?: string;
  connected?: boolean;
}

const STATIC_INTEGRATIONS: StaticIntegration[] = [
  {
    id: 'stripe', name: 'Stripe', category: 'Payments',
    description: 'Accept credit card and ACH payments from customers.',
    connected: true, logoText: 'S', logoColor: 'bg-indigo-600',
    connectUrl: 'https://dashboard.stripe.com',
  },
  {
    id: 'google-calendar', name: 'Google Calendar', category: 'Scheduling',
    description: 'Sync job appointments and schedules with Google Calendar.',
    connected: false, logoText: 'GC', logoColor: 'bg-blue-500',
  },
  {
    id: 'twilio', name: 'Twilio SMS', category: 'Communications',
    description: 'Send automated SMS reminders and notifications to customers.',
    connected: false, logoText: 'T', logoColor: 'bg-red-700',
  },
  {
    id: 'google-maps', name: 'Google Maps', category: 'Maps',
    description: 'Address autocomplete, map previews, and route planning.',
    connected: true, logoText: 'M', logoColor: 'bg-green-500',
  },
  {
    id: 'zapier', name: 'Zapier', category: 'Automation',
    description: 'Connect Handy Pioneers to 5,000+ apps via Zapier workflows.',
    connected: false, logoText: 'Z', logoColor: 'bg-orange-500',
    connectUrl: 'https://zapier.com',
  },
  {
    id: 'thumbtack', name: 'Thumbtack', category: 'Lead Generation',
    description: 'Import leads directly from your Thumbtack pro account.',
    connected: false, logoText: 'TT', logoColor: 'bg-blue-700',
    connectUrl: 'https://www.thumbtack.com',
  },
  {
    id: 'angi', name: 'Angi (HomeAdvisor)', category: 'Lead Generation',
    description: 'Import leads from Angi and HomeAdvisor.',
    connected: false, logoText: 'A', logoColor: 'bg-green-700',
    connectUrl: 'https://www.angi.com',
  },
];

// ── Gmail ─────────────────────────────────────────────────────────────────────
function GmailRow() {
  const { data: gmailStatus, isLoading, refetch } = trpc.gmail.status.useQuery();
  const { data: authUrlData, isLoading: loadingUrl } = trpc.gmail.getAuthUrl.useQuery(
    { origin: typeof window !== 'undefined' ? window.location.origin : undefined },
    { enabled: gmailStatus?.configured === true && !gmailStatus?.connected }
  );
  const [location] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get('gmail');
    if (gmailParam === 'connected') {
      toast.success('Gmail connected successfully!');
      refetch();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (gmailParam === 'error') {
      toast.error('Gmail connection failed. Please try again.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [location]);

  const isConnected = gmailStatus?.connected ?? false;
  const connectedEmail = gmailStatus?.email;

  return (
    <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-white text-xs font-bold shrink-0">G</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-foreground">Gmail</p>
          {isLoading ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><Loader2 size={10} className="animate-spin" /> Checking...</span>
          ) : isConnected ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600"><CheckCircle size={10} /> Connected</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><XCircle size={10} /> Not connected</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {isConnected && connectedEmail ? `Sending from ${connectedEmail}` : 'Send estimates and invoices directly from your Gmail account.'}
        </p>
      </div>
      {isConnected ? (
        <span className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-green-700 bg-green-50">Active</span>
      ) : !gmailStatus?.configured ? (
        <span className="px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50">Setup required</span>
      ) : loadingUrl ? (
        <button disabled className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/60 text-primary-foreground rounded-lg text-xs font-semibold cursor-not-allowed">
          <Loader2 size={10} className="animate-spin" /> Loading...
        </button>
      ) : authUrlData?.url ? (
        <a href={authUrlData.url} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          Connect <ExternalLink size={10} />
        </a>
      ) : null}
    </div>
  );
}

// ── QuickBooks ────────────────────────────────────────────────────────────────
function QuickBooksRow() {
  const { data: qbStatus, isLoading, refetch } = trpc.quickbooks.getStatus.useQuery();
  const { data: authUrlData } = trpc.quickbooks.getAuthUrl.useQuery(
    { redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/qbo/callback` : '' },
    { enabled: qbStatus?.configured === true && !qbStatus?.connected }
  );
  const disconnect = trpc.quickbooks.disconnect.useMutation({ onSuccess: () => { toast.success('QuickBooks disconnected'); refetch(); } });
  const [location] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('qb') === 'connected') {
      toast.success('QuickBooks connected!');
      refetch();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [location]);

  return (
    <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">QB</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-foreground">QuickBooks Online</p>
          {isLoading ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><Loader2 size={10} className="animate-spin" /> Checking...</span>
          ) : qbStatus?.connected ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600"><CheckCircle size={10} /> Connected</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><XCircle size={10} /> Not connected</span>
          )}
          {qbStatus?.environment && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{qbStatus.environment}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {qbStatus?.connected && qbStatus.realmId ? `Realm: ${qbStatus.realmId}` : 'Sync invoices, payments, and customers with QuickBooks Online.'}
        </p>
      </div>
      {qbStatus?.connected ? (
        <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors">
          {disconnect.isPending ? 'Disconnecting...' : 'Disconnect'}
        </button>
      ) : !qbStatus?.configured ? (
        <span className="px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50">Setup required</span>
      ) : authUrlData?.url ? (
        <a href={authUrlData.url} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          Connect <ExternalLink size={10} />
        </a>
      ) : null}
    </div>
  );
}

// ── Google Business Profile ───────────────────────────────────────────────────
function GbpRow() {
  const { data: status, isLoading, refetch } = trpc.gbp.getConnectionStatus.useQuery();
  const disconnect = trpc.gbp.disconnect.useMutation({ onSuccess: () => { toast.success('Google Business Profile disconnected'); refetch(); } });
  const [location] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('gbp');
    if (p === 'connected') { toast.success('Google Business Profile connected!'); refetch(); window.history.replaceState({}, '', window.location.pathname); }
    else if (p === 'error') { toast.error(`GBP connection failed: ${params.get('reason') ?? 'unknown error'}`); window.history.replaceState({}, '', window.location.pathname); }
  }, [location]);

  const connectUrl = '/api/integrations/gbp/connect';

  return (
    <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">GBP</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-foreground">Google Business Profile</p>
          {isLoading ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><Loader2 size={10} className="animate-spin" /> Checking...</span>
          ) : status?.connected ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600"><CheckCircle size={10} /> Connected</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><XCircle size={10} /> Not connected</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {status?.connected && status.accountId
            ? `Account: ${status.accountId}${status.locationId ? ` · Location: ${status.locationId}` : ''}`
            : 'Fetch reviews, draft responses, and schedule posts from your GBP listing.'}
        </p>
      </div>
      {status?.connected ? (
        <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors">
          {disconnect.isPending ? 'Disconnecting...' : 'Disconnect'}
        </button>
      ) : !status?.configured ? (
        <span className="px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50">Setup required</span>
      ) : (
        <a href={connectUrl} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          Connect <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

// ── Meta ──────────────────────────────────────────────────────────────────────
function MetaRow() {
  const { data: status, isLoading, refetch } = trpc.meta.getConnectionStatus.useQuery();
  const verify = trpc.meta.verifyToken.useMutation({
    onSuccess: (r) => {
      if (r.valid) toast.success('Meta token verified — active');
      else toast.error(`Meta token invalid: ${r.error ?? 'expired'}`);
      refetch();
    },
    onError: (e) => toast.error(`Verify failed: ${e.message}`),
  });

  return (
    <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center text-white text-xs font-bold shrink-0">Meta</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-foreground">Meta (Facebook / Instagram)</p>
          {isLoading ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><Loader2 size={10} className="animate-spin" /> Checking...</span>
          ) : status?.connected ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600"><CheckCircle size={10} /> Active</span>
          ) : status?.configured ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600"><AlertTriangle size={10} /> Token not verified</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><XCircle size={10} /> Not configured</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {status?.adAccountId
            ? `Ad Account: act_${status.adAccountId}${status.lastVerifiedAt ? ` · Verified ${new Date(status.lastVerifiedAt).toLocaleDateString()}` : ''}`
            : 'Fetch ad insights, page messages, and draft ad creatives (system-user token).'}
        </p>
      </div>
      {status?.configured ? (
        <button onClick={() => verify.mutate()} disabled={verify.isPending} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          {verify.isPending ? <><Loader2 size={10} className="animate-spin" /> Verifying...</> : 'Verify token'}
        </button>
      ) : (
        <span className="px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50">Setup required</span>
      )}
    </div>
  );
}

// ── Google Ads ────────────────────────────────────────────────────────────────
function GoogleAdsRow() {
  const { data: status, isLoading, refetch } = trpc.googleAds.getConnectionStatus.useQuery();
  const disconnect = trpc.googleAds.disconnect.useMutation({ onSuccess: () => { toast.success('Google Ads disconnected'); refetch(); } });
  const [location] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('googleAds');
    if (p === 'connected') { toast.success('Google Ads connected!'); refetch(); window.history.replaceState({}, '', window.location.pathname); }
    else if (p === 'error') { toast.error(`Google Ads connection failed: ${params.get('reason') ?? 'unknown error'}`); window.history.replaceState({}, '', window.location.pathname); }
  }, [location]);

  const connectUrl = '/api/integrations/google-ads/connect';

  return (
    <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div className="w-10 h-10 rounded-xl bg-yellow-500 flex items-center justify-center text-white text-xs font-bold shrink-0">GAds</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-foreground">Google Ads</p>
          {isLoading ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><Loader2 size={10} className="animate-spin" /> Checking...</span>
          ) : status?.connected ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600"><CheckCircle size={10} /> Connected</span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><XCircle size={10} /> Not connected</span>
          )}
          {status?.configured && status.devTokenStatus === 'pending_approval' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-mono">dev token pending</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {status?.connected && status.customerId
            ? `Customer ID: ${status.customerId}`
            : 'Fetch campaign data, keyword research, and draft ad creatives. Developer token pending Google approval.'}
        </p>
      </div>
      {status?.connected ? (
        <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors">
          {disconnect.isPending ? 'Disconnecting...' : 'Disconnect'}
        </button>
      ) : !status?.configured ? (
        <span className="px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50">Setup required</span>
      ) : (
        <a href={connectUrl} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          Connect <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}

const CATEGORIES = ['Accounting', 'Payments', 'Scheduling', 'Communications', 'Marketing', 'Maps', 'Automation', 'Lead Generation'];

export default function IntegrationsSettings() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Integrations</h2>
      <p className="text-sm text-muted-foreground">Connect Handy Pioneers with the tools your team already uses.</p>

      {/* ── Accounting ─────────────────────────────────────────────────────── */}
      <section className="card-section">
        <div className="card-section-header"><Plug size={13} /><span className="text-xs font-bold uppercase tracking-wider">Accounting</span></div>
        <div className="card-section-body divide-y divide-border/60">
          <QuickBooksRow />
        </div>
      </section>

      {/* ── Payments ───────────────────────────────────────────────────────── */}
      <section className="card-section">
        <div className="card-section-header"><Plug size={13} /><span className="text-xs font-bold uppercase tracking-wider">Payments</span></div>
        <div className="card-section-body divide-y divide-border/60">
          {STATIC_INTEGRATIONS.filter(i => i.category === 'Payments').map(intg => (
            <StaticRow key={intg.id} intg={intg} />
          ))}
        </div>
      </section>

      {/* ── Marketing ──────────────────────────────────────────────────────── */}
      <section className="card-section">
        <div className="card-section-header"><Plug size={13} /><span className="text-xs font-bold uppercase tracking-wider">Marketing</span></div>
        <div className="card-section-body divide-y divide-border/60">
          <GbpRow />
          <MetaRow />
          <GoogleAdsRow />
        </div>
      </section>

      {/* ── Communications ─────────────────────────────────────────────────── */}
      <section className="card-section">
        <div className="card-section-header"><Plug size={13} /><span className="text-xs font-bold uppercase tracking-wider">Communications</span></div>
        <div className="card-section-body divide-y divide-border/60">
          <GmailRow />
          {STATIC_INTEGRATIONS.filter(i => i.category === 'Communications').map(intg => (
            <StaticRow key={intg.id} intg={intg} />
          ))}
        </div>
      </section>

      {/* ── Other categories ───────────────────────────────────────────────── */}
      {['Scheduling', 'Maps', 'Automation', 'Lead Generation'].map(cat => {
        const items = STATIC_INTEGRATIONS.filter(i => i.category === cat);
        if (items.length === 0) return null;
        return (
          <section key={cat} className="card-section">
            <div className="card-section-header"><Plug size={13} /><span className="text-xs font-bold uppercase tracking-wider">{cat}</span></div>
            <div className="card-section-body divide-y divide-border/60">
              {items.map(intg => <StaticRow key={intg.id} intg={intg} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function StaticRow({ intg }: { intg: StaticIntegration }) {
  return (
    <div className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
      <div className={`w-10 h-10 rounded-xl ${intg.logoColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
        {intg.logoText}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-foreground">{intg.name}</p>
          {intg.connected
            ? <span className="flex items-center gap-1 text-[10px] font-bold text-green-600"><CheckCircle size={10} /> Connected</span>
            : <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground"><XCircle size={10} /> Not connected</span>
          }
        </div>
        <p className="text-xs text-muted-foreground">{intg.description}</p>
      </div>
      {intg.connected ? (
        <button className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors">Disconnect</button>
      ) : intg.connectUrl ? (
        <a href={intg.connectUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          Connect <ExternalLink size={10} />
        </a>
      ) : (
        <span className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-muted-foreground">Coming soon</span>
      )}
    </div>
  );
}
