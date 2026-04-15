/**
 * QuickBooksPage — QuickBooks Online integration settings.
 * Handles OAuth connect/disconnect, sync status, and bulk sync.
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, RefreshCw, Link2, Link2Off,
  AlertCircle, ArrowUpRight, Building2, FileText, Receipt,
} from "lucide-react";
import { toast } from "sonner";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const QB_LOGO = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/QuickBooks_logo.svg/240px-QuickBooks_logo.svg.png";

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function QuickBooksPage() {
  const utils = trpc.useUtils();
  const [syncing, setSyncing] = useState(false);

  const { data: status, isLoading } = trpc.quickbooks.getStatus.useQuery();

  const { data: authUrlData } = trpc.quickbooks.getAuthUrl.useQuery(
    { redirectUri: `${window.location.origin}/settings/quickbooks/callback` },
    { enabled: !!(status?.configured && !status?.connected) }
  );

  const disconnectMutation = trpc.quickbooks.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Disconnected from QuickBooks");
      utils.quickbooks.getStatus.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const bulkSyncMutation = trpc.quickbooks.bulkSync.useMutation({
    onSuccess: (data) => {
      setSyncing(false);
      const msg = `Synced ${data.invoicesSynced} invoices, ${data.expensesSynced} expenses.`;
      if (data.errors.length > 0) {
        toast.warning(`${msg} ${data.errors.length} errors.`);
        console.warn("[QB Sync errors]", data.errors);
      } else {
        toast.success(msg);
      }
      utils.quickbooks.getStatus.invalidate();
    },
    onError: (e) => {
      setSyncing(false);
      toast.error(e.message);
    },
  });

  // Handle OAuth callback (code + realmId in URL params)
  const exchangeCodeMutation = trpc.quickbooks.exchangeCode.useMutation({
    onSuccess: () => {
      toast.success("Connected to QuickBooks!");
      utils.quickbooks.getStatus.invalidate();
      // Clean URL
      window.history.replaceState({}, "", "/settings/quickbooks");
    },
    onError: (e) => toast.error(`QB connect failed: ${e.message}`),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const realmId = params.get("realmId");
    if (code && realmId) {
      exchangeCodeMutation.mutate({
        code,
        realmId,
        redirectUri: `${window.location.origin}/settings/quickbooks/callback`,
      });
    }
  }, []);

  const handleConnect = () => {
    if (authUrlData?.url) {
      window.location.href = authUrlData.url;
    }
  };

  const handleBulkSync = () => {
    setSyncing(true);
    bulkSyncMutation.mutate({ syncInvoices: true, syncExpenses: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6 max-w-3xl">

        {/* ── HEADER ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <img src={QB_LOGO} alt="QuickBooks" className="h-8 object-contain" />
          <div>
            <h1 className="text-xl font-bold">QuickBooks Integration</h1>
            <p className="text-sm text-muted-foreground">
              Sync invoices, expenses, and customers with QuickBooks Online
            </p>
          </div>
        </div>

        {/* ── CONNECTION STATUS ─────────────────────────────────── */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Connection Status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : !status?.configured ? (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">QuickBooks credentials not configured</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Add <code className="bg-amber-100 px-1 rounded">QUICKBOOKS_CLIENT_ID</code> and{" "}
                    <code className="bg-amber-100 px-1 rounded">QUICKBOOKS_CLIENT_SECRET</code> in Settings → Secrets.
                    Create a free app at{" "}
                    <a
                      href="https://developer.intuit.com"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      developer.intuit.com
                    </a>.
                  </p>
                </div>
              </div>
            ) : status.connected ? (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Connected</p>
                    <p className="text-xs text-muted-foreground">
                      Company ID: {status.realmId} · {status.environment}
                    </p>
                    {status.expiresAt && (
                      <p className="text-xs text-muted-foreground">
                        Token expires: {new Date(status.expiresAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  <Link2Off className="w-3.5 h-3.5" />
                  {disconnectMutation.isPending ? "Disconnecting…" : "Disconnect"}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Not connected</p>
                    <p className="text-xs text-muted-foreground">
                      Connect to sync invoices and expenses automatically
                    </p>
                  </div>
                </div>
                <Button size="sm" className="gap-1.5" onClick={handleConnect}>
                  <Link2 className="w-3.5 h-3.5" />
                  Connect QuickBooks
                  <ArrowUpRight className="w-3 h-3" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── SYNC ACTIONS ─────────────────────────────────────── */}
        {status?.connected && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sync Data</CardTitle>
              <CardDescription>
                Push unsynced records to QuickBooks. Up to 50 records per entity per run.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: FileText, label: "Invoices", desc: "Push open invoices to QB" },
                  { icon: Receipt, label: "Expenses", desc: "Push expense records to QB" },
                  { icon: Building2, label: "Customers", desc: "Sync customer profiles" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="rounded-lg border p-3 flex items-start gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                className="gap-1.5 w-full sm:w-auto"
                onClick={handleBulkSync}
                disabled={syncing || bulkSyncMutation.isPending}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Sync Now (Invoices + Expenses)"}
              </Button>
              {bulkSyncMutation.data && (
                <div className="text-xs text-muted-foreground">
                  Last sync: {bulkSyncMutation.data.invoicesSynced} invoices,{" "}
                  {bulkSyncMutation.data.expensesSynced} expenses synced.
                  {bulkSyncMutation.data.errors.length > 0 && (
                    <span className="text-red-600 ml-1">
                      {bulkSyncMutation.data.errors.length} error(s) — check console.
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── SETUP GUIDE ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Setup Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {[
                {
                  step: "1",
                  title: "Create a QuickBooks app",
                  desc: (
                    <>
                      Go to{" "}
                      <a href="https://developer.intuit.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">
                        developer.intuit.com
                      </a>{" "}
                      → Create an app → Select QuickBooks Online and Payments.
                    </>
                  ),
                },
                {
                  step: "2",
                  title: "Add redirect URI",
                  desc: `In your QB app settings, add the redirect URI: ${window.location.origin}/settings/quickbooks/callback`,
                },
                {
                  step: "3",
                  title: "Add credentials to Secrets",
                  desc: "Copy Client ID and Client Secret from your QB app → add as QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET in Settings → Secrets.",
                },
                {
                  step: "4",
                  title: "Connect and sync",
                  desc: "Click Connect QuickBooks above, authorize access, then use Sync Now to push your data.",
                },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center shrink-0 font-bold">
                    {step}
                  </span>
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
