/**
 * MembershipEnrollDialog
 * Enroll a specific property in a 360° membership tier.
 * Calls trpc.properties.enrollMembership which creates a threeSixtyMembership
 * linked to the property and customer.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { Property } from "@/lib/types";
import { toast } from 'sonner';
// useToast replaced with sonner

const TIERS = [
  {
    id: "bronze" as const,
    label: "Bronze — Exterior Shield",
    description: "Annual exterior inspection + gutter cleaning + 1 priority visit",
    laborBank: 0,
    monthlyPrice: 49,
  },
  {
    id: "silver" as const,
    label: "Silver — Full Coverage",
    description: "Everything in Bronze + interior inspection + $300 labor bank",
    laborBank: 300,
    monthlyPrice: 89,
  },
  {
    id: "gold" as const,
    label: "Gold — Max Protection",
    description: "Everything in Silver + $600 labor bank + 2 priority visits",
    laborBank: 600,
    monthlyPrice: 149,
  },
];

const CADENCES = [
  { id: "monthly" as const, label: "Monthly" },
  { id: "quarterly" as const, label: "Quarterly (save 5%)" },
  { id: "annual" as const, label: "Annual (save 10%)" },
];

interface MembershipEnrollDialogProps {
  property: Property;
  open: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

export default function MembershipEnrollDialog({
  property,
  open,
  onClose,
  onEnrolled,
}: MembershipEnrollDialogProps) {
  
  const [tier, setTier] = useState<"bronze" | "silver" | "gold">("silver");
  const [cadence, setCadence] = useState<"monthly" | "quarterly" | "annual">("annual");

  const enrollMutation = trpc.properties.enrollMembership.useMutation({
    onSuccess: () => {
      toast({
        title: "Enrolled in 360°",
        description: `${property.label} is now on the ${tier} plan.`,
      });
      onEnrolled();
    },
    onError: (e) =>
      toast.error(e.message),
  });

  const addressLine = [property.street, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Enroll in 360° Membership
          </DialogTitle>
          <DialogDescription>
            {property.label}
            {addressLine ? ` — ${addressLine}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Tier selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Select tier</Label>
            <RadioGroup
              value={tier}
              onValueChange={(v) => setTier(v as typeof tier)}
              className="space-y-2"
            >
              {TIERS.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    tier === t.id ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  onClick={() => setTier(t.id)}
                >
                  <RadioGroupItem value={t.id} id={`tier-${t.id}`} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Label
                        htmlFor={`tier-${t.id}`}
                        className="font-medium cursor-pointer"
                      >
                        {t.label}
                      </Label>
                      <Badge variant="outline" className="text-xs">
                        ${t.monthlyPrice}/mo
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                    {t.laborBank > 0 && (
                      <p className="text-xs text-green-600 mt-0.5">
                        +${t.laborBank} labor bank credit
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Cadence selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Billing cadence</Label>
            <RadioGroup
              value={cadence}
              onValueChange={(v) => setCadence(v as typeof cadence)}
              className="flex gap-3"
            >
              {CADENCES.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    cadence === c.id ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  onClick={() => setCadence(c.id)}
                >
                  <RadioGroupItem value={c.id} id={`cadence-${c.id}`} />
                  <Label htmlFor={`cadence-${c.id}`} className="cursor-pointer text-sm">
                    {c.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enrollMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              enrollMutation.mutate({
                propertyId: property.id,
                customerId: property.customerId,
                tier,
                billingCadence: cadence,
              })
            }
            disabled={enrollMutation.isPending}
          >
            {enrollMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Enroll in 360°
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
