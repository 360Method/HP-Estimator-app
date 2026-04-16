/**
 * MembershipManagePanel
 * A Sheet-based panel for managing an active 360° membership on a property.
 * Features:
 *   - Current tier + billing cadence display
 *   - Labor bank balance
 *   - Visit history (last 5)
 *   - Upgrade / Downgrade tier
 *   - Cancel membership
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ShieldCheck,
  DollarSign,
  Calendar,
  TrendingUp,
  TrendingDown,
  XCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Property } from "@/lib/types";
import { toast } from 'sonner';
// useToast replaced with sonner

const TIER_ORDER = ["bronze", "silver", "gold"] as const;
type Tier = (typeof TIER_ORDER)[number];

const TIER_CONFIG: Record<Tier, { label: string; className: string; laborBank: number }> = {
  bronze: { label: "Bronze — Exterior Shield", className: "bg-amber-700 text-white", laborBank: 0 },
  silver: { label: "Silver — Full Coverage", className: "bg-slate-400 text-white", laborBank: 300 },
  gold: { label: "Gold — Max Protection", className: "bg-yellow-500 text-white", laborBank: 600 },
};

interface MembershipManagePanelProps {
  property: Property;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export default function MembershipManagePanel({
  property,
  open,
  onClose,
  onChanged,
}: MembershipManagePanelProps) {
  
  const utils = trpc.useUtils();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const membership = property.membership;
  const currentTier = membership?.tier as Tier | undefined;
  const tierIdx = currentTier ? TIER_ORDER.indexOf(currentTier) : -1;
  const canUpgrade = tierIdx < TIER_ORDER.length - 1;
  const canDowngrade = tierIdx > 0;

  // Fetch visit history for this property via membership ID
  const membershipId = membership?.id;
  const { data: visits = [], isLoading: visitsLoading } =
    trpc.threeSixty.visits.list.useQuery(
      { membershipId: membershipId },
      { enabled: open && !!membershipId }
    );

  const changeTierMutation = trpc.properties.changeTier.useMutation({
    onSuccess: () => {
      utils.properties.listByCustomer.invalidate({ customerId: property.customerId });
      toast.success("Membership updated");
      onChanged();
    },
    onError: (e: { message: string }) =>
      toast.error(e.message),
  });

  const cancelMutation = trpc.properties.cancelMembership.useMutation({
    onSuccess: () => {
      utils.properties.listByCustomer.invalidate({ customerId: property.customerId });
      toast.success("Membership cancelled");
      setShowCancelConfirm(false);
      onChanged();
      onClose();
    },
    onError: (e: { message: string }) =>
      toast.error(e.message),
  });

  if (!membership || membership.status !== "active") {
    return null;
  }

  const tierCfg = TIER_CONFIG[currentTier!];
  const laborBalance = (membership.laborBankBalance ?? 0) / 100;
  const addressLine = [property.street, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              360° Membership
            </SheetTitle>
            <SheetDescription>
              {property.label}
              {addressLine ? ` — ${addressLine}` : ""}
            </SheetDescription>
          </SheetHeader>

          {/* Current tier */}
          <div className="rounded-lg border p-4 mb-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current plan</span>
              <Badge className={tierCfg.className}>
                {tierCfg.label}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Billing cadence</span>
              <span className="text-sm font-medium capitalize">
                {membership.billingCadence ?? "annual"}
              </span>
            </div>
            {membership.renewalDate && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Next renewal</span>
                <span className="text-sm font-medium">
                  {new Date(membership.renewalDate).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* Labor bank */}
          <div className="rounded-lg border p-4 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Labor Bank</span>
            </div>
            <div className="text-2xl font-bold text-green-600">
              ${laborBalance.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Available credit toward labor on any job at this property.
            </p>
          </div>

          {/* Tier change actions */}
          <div className="space-y-2 mb-4">
            {canUpgrade && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={changeTierMutation.isPending}
                onClick={() =>
                  changeTierMutation.mutate({
                    propertyId: property.id,
                    newTier: TIER_ORDER[tierIdx + 1],
                  })
                }
              >
                {changeTierMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                )}
                Upgrade to {TIER_CONFIG[TIER_ORDER[tierIdx + 1]].label}
              </Button>
            )}
            {canDowngrade && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={changeTierMutation.isPending}
                onClick={() =>
                  changeTierMutation.mutate({
                    propertyId: property.id,
                    newTier: TIER_ORDER[tierIdx - 1],
                  })
                }
              >
                {changeTierMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-amber-500" />
                )}
                Downgrade to {TIER_CONFIG[TIER_ORDER[tierIdx - 1]].label}
              </Button>
            )}
          </div>

          <Separator className="my-4" />

          {/* Visit history */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Visit History</span>
            </div>
            {visitsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading visits…
              </div>
            ) : visits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {(visits as any[]).slice(0, 5).map((v: any) => (
                  <div
                    key={v.id}
                    className="flex items-start justify-between text-sm border rounded-md px-3 py-2"
                  >
                    <div>
                      <div className="font-medium capitalize">{v.visitType ?? "Visit"}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.notes ?? "No notes"}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 ml-2">
                      {v.visitDate
                        ? new Date(v.visitDate).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator className="my-4" />

          {/* Cancel */}
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={() => setShowCancelConfirm(true)}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel membership
          </Button>
        </SheetContent>
      </Sheet>

      {/* Cancel confirm dialog */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel 360° Membership?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the membership for{" "}
              <strong>{property.label}</strong>. The remaining labor bank balance
              will be forfeited. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep membership</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                cancelMutation.mutate({ propertyId: property.id })
              }
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
