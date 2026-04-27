/**
 * AdminVendorDetail — single vendor view: identity, trades, onboarding steps,
 * recent jobs, and the communication log.
 */
import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "./AdminShell";

export default function AdminVendorDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const utils = trpc.useUtils();
  const vendorQ = trpc.vendors.get.useQuery({ id }, { enabled: Number.isFinite(id) });

  const updateMut = trpc.vendors.update.useMutation({
    onSuccess: () => {
      utils.vendors.get.invalidate({ id });
      toast.success("Saved.");
    },
    onError: (e) => toast.error(e.message),
  });

  const logCommMut = trpc.vendors.logCommunication.useMutation({
    onSuccess: () => {
      utils.vendors.get.invalidate({ id });
      toast.success("Logged.");
    },
    onError: (e) => toast.error(e.message),
  });

  const addStepMut = trpc.vendors.createOnboardingStep.useMutation({
    onSuccess: () => {
      utils.vendors.get.invalidate({ id });
      toast.success("Step added.");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStepMut = trpc.vendors.updateOnboardingStep.useMutation({
    onSuccess: () => utils.vendors.get.invalidate({ id }),
  });

  const [commChannel, setCommChannel] = useState("call");
  const [commSubject, setCommSubject] = useState("");
  const [commBody, setCommBody] = useState("");

  const [stepKey, setStepKey] = useState("");
  const [stepLabel, setStepLabel] = useState("");

  if (vendorQ.isLoading) {
    return (
      <AdminShell>
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin inline" />
        </div>
      </AdminShell>
    );
  }
  if (!vendorQ.data) {
    return (
      <AdminShell>
        <Card className="p-8 text-center text-muted-foreground">Vendor not found.</Card>
      </AdminShell>
    );
  }

  const { vendor, trades, onboarding, recentJobs, recentComms } = vendorQ.data;

  return (
    <AdminShell>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{vendor.name}</h1>
            <p className="text-sm text-muted-foreground">
              {vendor.companyName ? `${vendor.companyName} • ` : ""}
              {vendor.contactName ?? ""}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline">{vendor.status}</Badge>
              <Badge variant="outline">tier: {vendor.tier}</Badge>
              {vendor.rating && <Badge variant="outline">★ {vendor.rating}</Badge>}
              <Badge variant="outline">jobs: {vendor.jobsCompleted}</Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <select
              className="border rounded-md text-sm h-9 px-2"
              value={vendor.status}
              onChange={(e) =>
                updateMut.mutate({ id, patch: { status: e.target.value as never } })
              }
            >
              {["prospect", "onboarding", "active", "paused", "retired"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className="border rounded-md text-sm h-9 px-2"
              value={vendor.tier}
              onChange={(e) =>
                updateMut.mutate({ id, patch: { tier: e.target.value as never } })
              }
            >
              {["preferred", "approved", "trial", "probation"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Contact</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>Email: {vendor.email ?? "—"}</div>
            <div>Phone: {vendor.phone ?? "—"}</div>
            <div>License: {vendor.licenseNumber ?? "—"}</div>
            <div>Service area: {vendor.serviceArea ?? "—"}</div>
            <div>W-9 on file: {vendor.w9OnFile ? "yes" : "no"}</div>
            <div>COI on file: {vendor.coiOnFile ? "yes" : "no"}</div>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Trades</p>
          <div className="flex flex-wrap gap-1">
            {trades.length === 0 && <span className="text-sm text-muted-foreground">No trades tagged.</span>}
            {trades.map((t) => (
              <Badge key={t.tradeId} variant="outline">
                {t.name}
              </Badge>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Onboarding</p>
          <ul className="space-y-2 mb-4">
            {onboarding.length === 0 && <li className="text-sm text-muted-foreground">No steps yet.</li>}
            {onboarding.map((s) => (
              <li key={s.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{s.stepKey}</span>
                </div>
                <select
                  className="border rounded-md text-xs h-7 px-1"
                  value={s.status}
                  onChange={(e) =>
                    updateStepMut.mutate({ id: s.id, patch: { status: e.target.value as never } })
                  }
                >
                  {["pending", "in_progress", "complete", "skipped", "blocked"].map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div>
              <Label className="text-xs">Step key</Label>
              <Input value={stepKey} onChange={(e) => setStepKey(e.target.value)} placeholder="w9_collected" />
            </div>
            <div className="sm:col-span-1">
              <Label className="text-xs">Label</Label>
              <Input value={stepLabel} onChange={(e) => setStepLabel(e.target.value)} placeholder="Collect signed W-9" />
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (!stepKey.trim() || !stepLabel.trim()) return;
                addStepMut.mutate({
                  vendorId: id,
                  stepKey: stepKey.trim(),
                  label: stepLabel.trim(),
                });
                setStepKey("");
                setStepLabel("");
              }}
              disabled={addStepMut.isPending}
            >
              Add step
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Log a touch</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
            <select
              className="border rounded-md text-sm h-9 px-2"
              value={commChannel}
              onChange={(e) => setCommChannel(e.target.value)}
            >
              {["call", "email", "sms", "meeting", "note", "quote", "order", "followup"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Input
              value={commSubject}
              onChange={(e) => setCommSubject(e.target.value)}
              placeholder="Subject (optional)"
              className="sm:col-span-2"
            />
          </div>
          <Textarea
            value={commBody}
            onChange={(e) => setCommBody(e.target.value)}
            rows={2}
            placeholder="Notes…"
          />
          <div className="flex justify-end mt-2">
            <Button
              size="sm"
              onClick={() => {
                if (!commBody.trim() && !commSubject.trim()) return;
                logCommMut.mutate({
                  vendorId: id,
                  channel: commChannel as never,
                  subject: commSubject.trim() || undefined,
                  body: commBody.trim() || undefined,
                });
                setCommSubject("");
                setCommBody("");
              }}
              disabled={logCommMut.isPending}
            >
              Log
            </Button>
          </div>
          <div className="border-t mt-4 pt-3 space-y-2">
            {recentComms.length === 0 && <p className="text-sm text-muted-foreground">No history yet.</p>}
            {recentComms.map((c) => (
              <div key={c.id} className="text-sm border-l-2 pl-3 py-1 border-gray-300">
                <div className="text-xs text-muted-foreground">
                  {new Date(c.createdAt as never).toLocaleString()} • {c.channel} ({c.direction})
                </div>
                {c.subject && <div className="font-medium">{c.subject}</div>}
                {c.body && <div className="text-gray-700 whitespace-pre-wrap">{c.body}</div>}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Recent jobs</p>
          {recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs assigned yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Opportunity</th>
                  <th className="text-left p-2">Amount</th>
                  <th className="text-left p-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((j) => (
                  <tr key={j.id} className="border-b last:border-0">
                    <td className="p-2">#{j.id}</td>
                    <td className="p-2"><Badge variant="outline">{j.status}</Badge></td>
                    <td className="p-2 font-mono text-xs">{j.opportunityId ?? "—"}</td>
                    <td className="p-2">
                      {j.agreedAmountCents != null ? `$${(j.agreedAmountCents / 100).toFixed(2)}` : "—"}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {new Date(j.createdAt as never).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
