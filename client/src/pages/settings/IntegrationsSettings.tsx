import { ExternalLink, CheckCircle, XCircle, Plug, Loader2 } from 'lucide-react';
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
  connected?: boolean; // static integrations with known state
}

const STATIC_INTEGRATIONS: StaticIntegration[] = [
  {
    id: 'quickbooks', name: 'QuickBooks Online', category: 'Accounting',
    description: 'Sync invoices, payments, and customers with QuickBooks Online.',
    connected: false, logoText: 'QB', logoColor: 'bg-green-600',
    connectUrl: 'https://quickbooks.intuit.com',
  },
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

// ── Gmail Connect Row (live status from server) ───────────────────────────────
function GmailRow() {
  const { data: gmailStatus, isLoading, refetch } = trpc.gmail.status.useQuery();
  const { data: authUrlData, isLoading: loadingUrl } = trpc.gmail.getAuthUrl.useQuery(
    { origin: typeof window !== 'undefined' ? window.location.origin : undefined },
    { enabled: gmailStatus?.configured === true && !gmailStatus?.connected }
  );
  const [location] = useLocation();

  // Handle redirect back from Google OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get('gmail');
    if (gmailParam === 'connected') {
      toast.success('Gmail connected successfully!');
      refetch();
      // Clean up URL
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
      <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
        G
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-foreground">Gmail</p>
          {isLoading ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
              <Loader2 size={10} className="animate-spin" /> Checking...
            </span>
          ) : isConnected ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-green-600">
              <CheckCircle size={10} /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
              <XCircle size={10} /> Not connected
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {isConnected && connectedEmail
            ? `Sending from ${connectedEmail}`
            : 'Send estimates and invoices directly from your Gmail account.'}
        </p>
      </div>
      {isConnected ? (
        <span className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-green-700 bg-green-50">
          Active
        </span>
      ) : !gmailStatus?.configured ? (
        <span className="px-3 py-1.5 border border-amber-300 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50">
          Setup required
        </span>
      ) : loadingUrl ? (
        <button disabled className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/60 text-primary-foreground rounded-lg text-xs font-semibold cursor-not-allowed">
          <Loader2 size={10} className="animate-spin" /> Loading...
        </button>
      ) : authUrlData?.url ? (
        <a
          href={authUrlData.url}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          Connect <ExternalLink size={10} />
        </a>
      ) : null}
    </div>
  );
}

const CATEGORIES = Array.from(new Set(['Accounting', 'Payments', 'Scheduling', 'Communications', 'Maps', 'Automation', 'Lead Generation']));

export default function IntegrationsSettings() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Integrations</h2>
      <p className="text-sm text-muted-foreground">Connect Handy Pioneers with the tools your team already uses.</p>

      {CATEGORIES.map(cat => {
        const staticItems = STATIC_INTEGRATIONS.filter(i => i.category === cat);
        const hasGmail = cat === 'Communications';
        if (staticItems.length === 0 && !hasGmail) return null;

        return (
          <section key={cat} className="card-section">
            <div className="card-section-header">
              <Plug size={13} />
              <span className="text-xs font-bold uppercase tracking-wider">{cat}</span>
            </div>
            <div className="card-section-body divide-y divide-border/60">
              {staticItems.map(intg => (
                <div key={intg.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
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
                    <button className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors">
                      Disconnect
                    </button>
                  ) : intg.connectUrl ? (
                    <a
                      href={intg.connectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
                    >
                      Connect <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </div>
              ))}
              {hasGmail && <GmailRow />}
            </div>
          </section>
        );
      })}
    </div>
  );
}
