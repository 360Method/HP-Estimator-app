/**
 * AdminVendorNew — minimal create form. Captures identity, contact, and a trade
 * selection so the vendor lands in the network with at least one trade tag.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AdminShell } from "./AdminShell";

export default function AdminVendorNew() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [tradeSlugs, setTradeSlugs] = useState<string[]>([]);

  const tradesQ = trpc.vendors.listTrades.useQuery();
  const create = trpc.vendors.create.useMutation({
    onSuccess: (v) => {
      toast.success("Vendor added.");
      if (v?.vendor?.id) navigate(`/admin/vendors/${v.vendor.id}`);
      else navigate("/admin/vendors");
    },
    onError: (err) => toast.error(err.message),
  });

  function toggleTrade(slug: string) {
    setTradeSlugs((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  function submit() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    create.mutate({
      name: name.trim(),
      companyName: companyName.trim() || undefined,
      contactName: contactName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      serviceArea: serviceArea.trim() || undefined,
      licenseNumber: licenseNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      tradeSlugs: tradeSlugs.length > 0 ? tradeSlugs : undefined,
    });
  }

  return (
    <AdminShell>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">New Vendor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add a trade partner to the network. You can fill in license, insurance, and onboarding
            steps after they're created.
          </p>
        </div>

        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendor name" />
            </div>
            <div>
              <Label>Company</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div>
              <Label>Primary contact</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>License #</Label>
              <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Service area</Label>
              <Input value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} placeholder="e.g. Lake Oswego, West Linn" />
            </div>
          </div>

          <div>
            <Label>Trades</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Pick every trade this vendor handles — tagging drives matching for opportunities.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {(tradesQ.data ?? []).map((t) => (
                <label
                  key={t.slug}
                  className={`text-sm rounded-md border px-2 py-1.5 cursor-pointer flex items-center gap-2 ${
                    tradeSlugs.includes(t.slug) ? "border-primary bg-primary/5" : "border-gray-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={tradeSlugs.includes(t.slug)}
                    onChange={() => toggleTrade(t.slug)}
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/vendors")}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Add vendor"}
            </Button>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
