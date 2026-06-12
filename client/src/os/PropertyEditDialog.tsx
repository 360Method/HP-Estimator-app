/**
 * PropertyEditDialog — create or edit one property under a client umbrella.
 * Thin form over properties.create / properties.update; primary handling
 * rides the same mutations (the router clears the old primary flag).
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { trpc } from "@/lib/trpc";

type PropertySeed = {
  id?: string;
  label?: string | null;
  street?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  isPrimary?: boolean | null;
  propertyNotes?: string | null;
};

export default function PropertyEditDialog({
  customerId,
  property,
  open,
  onClose,
}: {
  customerId: string;
  /** Omit for create. */
  property?: PropertySeed;
  open: boolean;
  onClose: () => void;
}) {
  const isNew = !property?.id;
  const [form, setForm] = useState({
    label: property?.label ?? "Home",
    street: property?.street ?? "",
    unit: property?.unit ?? "",
    city: property?.city ?? "",
    state: property?.state ?? "",
    zip: property?.zip ?? "",
    isPrimary: property?.isPrimary ?? false,
    propertyNotes: property?.propertyNotes ?? "",
  });

  const utils = trpc.useUtils();
  const done = (msg: string) => {
    void utils.properties.listByCustomer.invalidate({ customerId });
    toast.success(msg);
    onClose();
  };
  const createM = trpc.properties.create.useMutation({
    onSuccess: () => done("Property added"),
    onError: (e) => toast.error(e.message),
  });
  const updateM = trpc.properties.update.useMutation({
    onSuccess: () => done("Property saved"),
    onError: (e) => toast.error(e.message),
  });
  const pending = createM.isPending || updateM.isPending;

  const save = () => {
    if (!form.label.trim()) {
      toast.error("Give the property a label");
      return;
    }
    const data = {
      label: form.label.trim(),
      street: form.street.trim(),
      unit: form.unit.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zip: form.zip.trim(),
      isPrimary: form.isPrimary,
      propertyNotes: form.propertyNotes.trim() || undefined,
    };
    if (isNew) createM.mutate({ ...data, customerId });
    else updateM.mutate({ ...data, id: property!.id! });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add property" : "Edit property"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Label</label>
            <Input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Home, Rental, Cabin…"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Street address</label>
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
              <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">City</label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">State</label>
              <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            </div>
          </div>
          <div className="w-1/3">
            <label className="text-xs text-muted-foreground">ZIP</label>
            <Input value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes</label>
            <Input
              value={form.propertyNotes}
              onChange={(e) => setForm((f) => ({ ...f, propertyNotes: e.target.value }))}
              placeholder="Gate code, dog, parking…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
            />
            Primary property
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : isNew ? "Add property" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
