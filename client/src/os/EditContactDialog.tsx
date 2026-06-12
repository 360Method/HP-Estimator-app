/**
 * EditContactDialog — lean contact + billing address editor for the OS
 * client page. ProfileTab's editor is welded to the estimator context, so
 * this one talks straight to customers.update (which also syncs identity
 * to the linked portal profile) and invalidates getFullContext.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { trpc } from "@/lib/trpc";

type ContactSeed = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  mobilePhone?: string | null;
  email?: string | null;
  street?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export default function EditContactDialog({
  customer,
  open,
  onClose,
}: {
  customer: ContactSeed;
  open: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    firstName: customer.firstName ?? "",
    lastName: customer.lastName ?? "",
    company: customer.company ?? "",
    mobilePhone: customer.mobilePhone ?? "",
    email: customer.email ?? "",
    street: customer.street ?? "",
    unit: customer.unit ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    zip: customer.zip ?? "",
  });

  const utils = trpc.useUtils();
  const updateM = trpc.customers.update.useMutation({
    onSuccess: () => {
      void utils.customers.getFullContext.invalidate({ id: customer.id });
      void utils.customers.invalidate();
      toast.success("Contact saved");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = () => {
    const displayName =
      [form.firstName, form.lastName].filter(Boolean).join(" ").trim() ||
      form.company.trim() ||
      undefined;
    updateM.mutate({
      id: customer.id,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      ...(displayName ? { displayName } : {}),
      company: form.company.trim(),
      mobilePhone: form.mobilePhone.trim(),
      email: form.email.trim(),
      street: form.street.trim(),
      unit: form.unit.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zip: form.zip.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">First name</label>
              <Input value={form.firstName} onChange={set("firstName")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Last name</label>
              <Input value={form.lastName} onChange={set("lastName")} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Company</label>
            <Input value={form.company} onChange={set("company")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Mobile phone</label>
              <Input type="tel" value={form.mobilePhone} onChange={set("mobilePhone")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Email</label>
              <Input type="email" value={form.email} onChange={set("email")} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Billing address</label>
            <AddressAutocomplete
              value={form.street}
              onChange={(v) => setForm((f) => ({ ...f, street: v }))}
              onAddressSelect={(p) =>
                setForm((f) => ({
                  ...f,
                  street: p.street,
                  unit: p.unit || f.unit,
                  city: p.city,
                  state: p.state,
                  zip: p.zip,
                }))
              }
            />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Unit</label>
              <Input value={form.unit} onChange={set("unit")} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">City</label>
              <Input value={form.city} onChange={set("city")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">State</label>
              <Input value={form.state} onChange={set("state")} />
            </div>
          </div>
          <div className="w-1/3">
            <label className="text-xs text-muted-foreground">ZIP</label>
            <Input value={form.zip} onChange={set("zip")} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={updateM.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateM.isPending}>
            {updateM.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
