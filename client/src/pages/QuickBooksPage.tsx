/**
 * QuickBooksPage — QuickBooks Online integration settings.
 * Currently disabled — the sync logic uses hardcoded account IDs that will
 * fail for real QuickBooks companies. Showing a "Coming Soon" placeholder
 * until the integration is production-ready.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Construction, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

const QB_LOGO = "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/QuickBooks_logo.svg/240px-QuickBooks_logo.svg.png";

export default function QuickBooksPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6 max-w-3xl">

        {/* ── HEADER ───────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <img src={QB_LOGO} alt="QuickBooks" className="h-8 object-contain" />
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">QuickBooks Integration</h1>
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
              Coming Soon
            </Badge>
          </div>
        </div>

        {/* ── COMING SOON CARD ─────────────────────────────────── */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Under Development</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
                <Construction className="w-8 h-8 text-amber-500" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-lg font-semibold text-foreground">QuickBooks Sync Coming Soon</h3>
                <p className="text-sm text-muted-foreground">
                  We're building a production-ready QuickBooks Online integration that will
                  automatically sync invoices, expenses, and customer records between
                  Handy Pioneers and your QuickBooks company.
                </p>
                <p className="text-xs text-muted-foreground">
                  This feature is not yet available. You'll be notified when it's ready to connect.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── PLANNED FEATURES ────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Planned Features</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {[
                { title: "Invoice Sync", desc: "Automatically push invoices from HP Estimator to QuickBooks Online." },
                { title: "Expense Tracking", desc: "Sync expense records and keep your books up to date." },
                { title: "Customer Sync", desc: "Keep customer profiles in sync across both platforms." },
                { title: "OAuth Connection", desc: "Securely connect your QuickBooks company with one click." },
              ].map(({ title, desc }) => (
                <li key={title} className="flex gap-3 items-start">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-2" />
                  <div>
                    <p className="font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ── BACK LINK ───────────────────────────────────────── */}
        <div className="mt-6">
          <Link
            href="/settings/integrations"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Integrations
          </Link>
        </div>

      </div>
    </div>
  );
}
