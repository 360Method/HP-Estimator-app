/**
 * AdminVendorsList — vendor roster with status/tier/trade filter and quick search.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Plus } from "lucide-react";
import { AdminShell } from "./AdminShell";

const STATUSES = ["all", "prospect", "onboarding", "active", "paused", "retired"] as const;
type StatusFilter = (typeof STATUSES)[number];

export default function AdminVendorsList() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [tradeSlug, setTradeSlug] = useState<string>("");
  const [q, setQ] = useState("");

  const tradesQ = trpc.vendors.listTrades.useQuery();
  const vendorsQ = trpc.vendors.list.useQuery({
    status: status === "all" ? undefined : status,
    tradeSlug: tradeSlug || undefined,
    limit: 500,
  });

  const filtered = useMemo(() => {
    const all = vendorsQ.data ?? [];
    if (!q.trim()) return all;
    const needle = q.toLowerCase();
    return all.filter(
      (v) =>
        v.name?.toLowerCase().includes(needle) ||
        v.companyName?.toLowerCase().includes(needle) ||
        v.email?.toLowerCase().includes(needle) ||
        v.phone?.includes(needle),
    );
  }, [vendorsQ.data, q]);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Vendor Network</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Trade partners we route work to. Track onboarding, jobs, and quality over time.
            </p>
          </div>
          <Link href="/admin/vendors/new">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" /> New vendor
            </Button>
          </Link>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1">
            {STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "default" : "outline"}
                onClick={() => setStatus(s)}
              >
                {s}
              </Button>
            ))}
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Trade</label>
            <select
              className="border rounded-md text-sm h-9 px-2"
              value={tradeSlug}
              onChange={(e) => setTradeSlug(e.target.value)}
            >
              <option value="">All trades</option>
              {(tradesQ.data ?? []).map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs text-muted-foreground mb-1">Search</label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, company, email…" />
          </div>
        </div>

        {vendorsQ.isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin inline" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No vendors match those filters.
          </Card>
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Company</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Tier</th>
                  <th className="text-left p-3 font-medium">Rating</th>
                  <th className="text-left p-3 font-medium">Jobs</th>
                  <th className="text-left p-3 font-medium">Last job</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="p-3">
                      <Link href={`/admin/vendors/${v.id}`} className="text-primary hover:underline">
                        {v.name}
                      </Link>
                    </td>
                    <td className="p-3">{v.companyName ?? "—"}</td>
                    <td className="p-3">
                      <Badge variant="outline">{v.status}</Badge>
                    </td>
                    <td className="p-3">{v.tier}</td>
                    <td className="p-3">{v.rating ?? "—"}</td>
                    <td className="p-3">{v.jobsCompleted}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {v.lastJobAt ? new Date(v.lastJobAt as never).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
