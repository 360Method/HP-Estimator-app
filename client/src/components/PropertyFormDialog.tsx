/**
 * PropertyFormDialog
 * Add or edit a property for a customer.
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { Property } from "@/lib/types";
import { toast } from 'sonner';
// useToast replaced with sonner

interface PropertyFormDialogProps {
  customerId: string;
  property: Property | null; // null = create mode
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY_FORM = {
  label: "Home",
  street: "",
  unit: "",
  city: "",
  state: "",
  zip: "",
  isPrimary: false,
  isBilling: false,
  propertyNotes: "",
  addressNotes: "",
};

export default function PropertyFormDialog({
  customerId,
  property,
  open,
  onClose,
  onSaved,
}: PropertyFormDialogProps) {
  
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (property) {
      setForm({
        label: property.label ?? "Home",
        street: property.street ?? "",
        unit: property.unit ?? "",
        city: property.city ?? "",
        state: property.state ?? "",
        zip: property.zip ?? "",
        isPrimary: property.isPrimary ?? false,
        isBilling: property.isBilling ?? false,
        propertyNotes: property.propertyNotes ?? "",
        addressNotes: property.addressNotes ?? "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [property, open]);

  const createMutation = trpc.properties.create.useMutation({
    onSuccess: () => { toast.success("Property added"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.properties.update.useMutation({
    onSuccess: () => { toast.success("Property updated"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    if (property) {
      updateMutation.mutate({ id: property.id, ...form });
    } else {
      createMutation.mutate({ customerId, ...form });
    }
  };

  const set = (field: keyof typeof EMPTY_FORM, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{property ? "Edit Property" : "Add Property"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label>Label</Label>
            <Input
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              placeholder="Home, Rental, Office…"
            />
          </div>

          <div>
            <Label>Street address</Label>
            <Input
              value={form.street}
              onChange={(e) => set("street", e.target.value)}
              placeholder="123 Main St"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Unit / Suite</Label>
              <Input
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="Apt 2B"
              />
            </div>
            <div>
              <Label>ZIP</Label>
              <Input
                value={form.zip}
                onChange={(e) => set("zip", e.target.value)}
                placeholder="98661"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>City</Label>
              <Input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Vancouver"
              />
            </div>
            <div>
              <Label>State</Label>
              <Input
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                placeholder="WA"
              />
            </div>
          </div>

          <div>
            <Label>Access / gate notes</Label>
            <Textarea
              value={form.propertyNotes}
              onChange={(e) => set("propertyNotes", e.target.value)}
              placeholder="Gate code, key location, dog in yard…"
              rows={2}
            />
          </div>

          <div>
            <Label>Address notes</Label>
            <Textarea
              value={form.addressNotes}
              onChange={(e) => set("addressNotes", e.target.value)}
              placeholder="Billing notes, special instructions…"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-6 pt-1">
            <div className="flex items-center gap-2">
              <Switch
                id="isPrimary"
                checked={form.isPrimary}
                onCheckedChange={(v) => set("isPrimary", v)}
              />
              <Label htmlFor="isPrimary" className="cursor-pointer">
                Primary address
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="isBilling"
                checked={form.isBilling}
                onCheckedChange={(v) => set("isBilling", v)}
              />
              <Label htmlFor="isBilling" className="cursor-pointer">
                Billing address
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {property ? "Save changes" : "Add property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
