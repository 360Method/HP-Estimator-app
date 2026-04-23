/**
 * MembershipManagePanel — Full admin management panel for a 360° membership.
 * Tabs: Overview/Billing · Labor Bank · Work Orders · Notes · Danger Zone
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  PauseCircle,
  PlayCircle,
  CreditCard,
  FileText,
  Wrench,
  StickyNote,
  AlertTriangle,
  ExternalLink,
  Plus,
  Minus,
  RefreshCw,
} from "lucide-react";
import { Property } from "@/lib/types";
import { toast } from "sonner";
import { useEstimator } from "@/contexts/EstimatorContext";
import { useLocation } from "wouter";

// ─── Tier config ──────────────────────────────────────────────────────────────
const TIER_ORDER = ["bronze", "silver", "gold"] as const;
type Tier = (typeof TIER_ORDER)[number];

const TIER_CONFIG: Record<
  Tier,
  { homeLabel: string; portfolioLabel: string; className: string; laborBank: number }
> = {
  bronze: {
    homeLabel: "Essential",
    portfolioLabel: "Exterior Shield",
    className: "bg-amber-700 text-white",
    laborBank: 0,
  },
  silver: {
    homeLabel: "Full Coverage",
    portfolioLabel: "Full Coverage",
    className: "bg-slate-500 text-white",
    laborBank: 300,
  },
  gold: {
    homeLabel: "Maximum Protection",
    portfolioLabel: "Portfolio Max",
    className: "bg-yellow-500 text-white",
    laborBank: 600,
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface MembershipManagePanelProps {
  property: Property;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MembershipManagePanel({
  property,
  open,
  onClose,
  onChanged,
}: MembershipManagePanelProps) {
  const utils = trpc.useUtils();
  const { setActiveCustomer, setSection } = useEstimator();
  const [, navigate] = useLocation();

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [laborAdjust, setLaborAdjust] = useState("");
  const [laborReason, setLaborReason] = useState("");
  const [notes, setNotes] = useState(property.membership?.notes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);

  const membership = property.membership;
  const currentTier = membership?.tier as Tier | undefined;
  const tierIdx = currentTier ? TIER_ORDER.indexOf(currentTier) : -1;
  const canUpgrade = tierIdx < TIER_ORDER.length - 1;
  const canDowngrade = tierIdx > 0;
  const isPaused = membership?.status === "paused";
  const isPortfolio = membership?.planType === "portfolio";

  const membershipId = membership?.id;
  const addressLine = [property.street, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: visits = [], isLoading: visitsLoading } =
    trpc.threeSixty.visits.list.useQuery(
      { membershipId: membershipId! },
      { enabled: open && !!membershipId }
    );

  const { data: workOrders = [], isLoading: woLoading } =
    trpc.workOrders.list.useQuery(
      { membershipId: membershipId! },
      { enabled: open && !!membershipId }
    );

  const { data: stripeData, isLoading: stripeLoading } =
    trpc.properties.getMembershipStripeStatus.useQuery(
      { propertyId: property.id },
      { enabled: open && !!membershipId }
    );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const invalidate = () => {
    utils.properties.listByCustomer.invalidate({ customerId: property.customerId });
    onChanged();
  };

  const changeTierMutation = trpc.properties.changeTier.useMutation({
    onSuccess: () => { toast.success("Tier updated"); invalidate(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const cancelMutation = trpc.properties.cancelMembership.useMutation({
    onSuccess: () => {
      toast.success("Membership cancelled");
      setShowCancelConfirm(false);
      invalidate();
      onClose();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const pauseMutation = trpc.properties.pauseMembership.useMutation({
    onSuccess: () => {
      toast.success("Membership paused");
      setShowPauseConfirm(false);
      invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const resumeMutation = trpc.properties.resumeMembership.useMutation({
    onSuccess: () => { toast.success("Membership resumed"); invalidate(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const adjustLaborMutation = trpc.properties.adjustLaborBank.useMutation({
    onSuccess: (data) => {
      toast.success(`Labor bank updated — new balance: $${(data.newBalanceCents / 100).toFixed(2)}`);
      setLaborAdjust("");
      setLaborReason("");
      invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const saveNotesMutation = trpc.properties.updateMembershipNotes.useMutation({
    onSuccess: () => { toast.success("Notes saved"); setNotesDirty(false); invalidate(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  if (!membership || (membership.status !== "active" && membership.status !== "paused")) {
    return null;
  }

  const tierCfg = TIER_CONFIG[currentTier!];
  const tierLabel = isPortfolio ? tierCfg.portfolioLabel : tierCfg.homeLabel;
  const laborBalance = (membership.laborBankBalance ?? 0) / 100;

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              360° Membership Management
            </SheetTitle>
            <SheetDescription>
              {property.label}
              {addressLine ? ` — ${addressLine}` : ""}
            </SheetDescription>
          </SheetHeader>

          {/* Status bar */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Badge className={tierCfg.className}>{tierLabel}</Badge>
            <Badge variant={isPaused ? "outline" : "secondary"} className={isPaused ? "border-amber-500 text-amber-600" : ""}>
              {isPaused ? "⏸ Paused" : "● Active"}
            </Badge>
            <Badge variant="outline" className="capitalize">{membership.billingCadence ?? "annual"}</Badge>
            {isPortfolio && <Badge variant="outline" className="text-blue-600 border-blue-300">Portfolio</Badge>}
            <span className="ml-auto text-xs text-muted-foreground">
              ID #{membershipId}
            </span>
          </div>

          <Tabs defaultValue="overview">
            <TabsList className="grid grid-cols-5 w-full mb-4">
              <TabsTrigger value="overview" className="text-xs"><CreditCard className="h-3 w-3 mr-1" />Billing</TabsTrigger>
              <TabsTrigger value="labor" className="text-xs"><DollarSign className="h-3 w-3 mr-1" />Labor</TabsTrigger>
              <TabsTrigger value="workorders" className="text-xs"><Wrench className="h-3 w-3 mr-1" />Work</TabsTrigger>
              <TabsTrigger value="notes" className="text-xs"><StickyNote className="h-3 w-3 mr-1" />Notes</TabsTrigger>
              <TabsTrigger value="danger" className="text-xs text-destructive"><AlertTriangle className="h-3 w-3 mr-1" />Admin</TabsTrigger>
            </TabsList>

            {/* ── OVERVIEW / BILLING ── */}
            <TabsContent value="overview" className="space-y-4">
              {/* Key dates */}
              <div className="rounded-lg border p-4 space-y-2.5">
                <h3 className="text-sm font-semibold mb-1">Membership Details</h3>
                <Row label="Start date" value={new Date(membership.startDate).toLocaleDateString()} />
                <Row label="Renewal date" value={membership.renewalDate ? new Date(membership.renewalDate).toLocaleDateString() : "—"} />
                <Row label="Annual scan" value={membership.annualScanCompleted ? "✅ Completed" : "⚠️ Not completed"} />
                {membership.stripeSubscriptionId && (
                  <Row label="Stripe sub ID" value={<code className="text-xs">{membership.stripeSubscriptionId}</code>} />
                )}
                {membership.stripeCustomerId && (
                  <Row label="Stripe customer" value={<code className="text-xs">{membership.stripeCustomerId}</code>} />
                )}
              </div>

              {/* Stripe subscription live status */}
              <div className="rounded-lg border p-4 space-y-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Stripe Subscription</h3>
                  {stripeLoading && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
                </div>
                {!stripeData?.subscription ? (
                  <p className="text-sm text-muted-foreground">
                    {membership.stripeSubscriptionId
                      ? "Could not reach Stripe. Check your API key."
                      : "No Stripe subscription linked. Enrolled manually or via cash."}
                  </p>
                ) : (
                  <>
                    <Row label="Status" value={
                      <Badge variant={stripeData.subscription.status === "active" ? "secondary" : "outline"} className="capitalize text-xs">
                        {stripeData.subscription.status}
                      </Badge>
                    } />
                    {stripeData.subscription.amount != null && (
                      <Row
                        label="Amount"
                        value={`$${(stripeData.subscription.amount / 100).toFixed(2)} / ${stripeData.subscription.interval}`}
                      />
                    )}
                    <Row
                      label="Period end"
                      value={new Date(stripeData.subscription.currentPeriodEnd * 1000).toLocaleDateString()}
                    />
                    {stripeData.subscription.cancelAtPeriodEnd && (
                      <p className="text-xs text-amber-600 font-medium">⚠️ Cancels at period end</p>
                    )}
                  </>
                )}
              </div>

              {/* Recent invoices */}
              {(stripeData?.invoices?.length ?? 0) > 0 && (
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Recent Invoices</h3>
                  </div>
                  <div className="space-y-2">
                    {stripeData!.invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
                        <div>
                          <span className="font-medium">{inv.number ?? inv.id}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {new Date(inv.created * 1000).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={inv.status === "paid" ? "secondary" : "outline"} className="text-xs capitalize">
                            {inv.status}
                          </Badge>
                          <span className="text-sm font-medium">${((inv.amount ?? 0) / 100).toFixed(2)}</span>
                          {inv.hostedUrl && (
                            <a href={inv.hostedUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tier change */}
              <div className="space-y-2">
                {canUpgrade && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    disabled={changeTierMutation.isPending}
                    onClick={() => changeTierMutation.mutate({ propertyId: property.id, newTier: TIER_ORDER[tierIdx + 1] })}
                  >
                    {changeTierMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4 text-green-600" />}
                    Upgrade to {isPortfolio ? TIER_CONFIG[TIER_ORDER[tierIdx + 1]].portfolioLabel : TIER_CONFIG[TIER_ORDER[tierIdx + 1]].homeLabel}
                  </Button>
                )}
                {canDowngrade && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    disabled={changeTierMutation.isPending}
                    onClick={() => changeTierMutation.mutate({ propertyId: property.id, newTier: TIER_ORDER[tierIdx - 1] })}
                  >
                    {changeTierMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4 text-amber-500" />}
                    Downgrade to {isPortfolio ? TIER_CONFIG[TIER_ORDER[tierIdx - 1]].portfolioLabel : TIER_CONFIG[TIER_ORDER[tierIdx - 1]].homeLabel}
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* ── LABOR BANK ── */}
            <TabsContent value="labor" className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Current Balance</span>
                </div>
                <div className="text-3xl font-bold text-green-600">${laborBalance.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Available credit toward labor on any job at this property.
                </p>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-semibold">Manual Adjustment</h3>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Amount (positive = credit, negative = deduct)</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="pl-7"
                        value={laborAdjust}
                        onChange={(e) => setLaborAdjust(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-green-600"
                      onClick={() => setLaborAdjust((v) => String(Math.abs(parseFloat(v) || 0)))}
                      title="Credit"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-red-500"
                      onClick={() => setLaborAdjust((v) => String(-Math.abs(parseFloat(v) || 0)))}
                      title="Deduct"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    placeholder="Reason (optional)"
                    value={laborReason}
                    onChange={(e) => setLaborReason(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    disabled={!laborAdjust || isNaN(parseFloat(laborAdjust)) || adjustLaborMutation.isPending}
                    onClick={() =>
                      adjustLaborMutation.mutate({
                        propertyId: property.id,
                        amountDollars: parseFloat(laborAdjust),
                        reason: laborReason || undefined,
                      })
                    }
                  >
                    {adjustLaborMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Apply Adjustment
                  </Button>
                </div>
              </div>

              {/* Visit history with labor used */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Visit History</h3>
                </div>
                {visitsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : visits.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No visits recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(visits as any[]).slice(0, 8).map((v: any) => (
                      <div key={v.id} className="flex items-start justify-between text-sm border rounded-md px-3 py-2">
                        <div>
                          <div className="font-medium capitalize">{v.visitType ?? v.season ?? "Visit"}</div>
                          <div className="text-xs text-muted-foreground">{v.notes ?? v.technicianNotes ?? "No notes"}</div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <div className="text-xs text-muted-foreground">
                            {v.visitDate || v.completedDate
                              ? new Date(v.visitDate ?? v.completedDate).toLocaleDateString()
                              : "—"}
                          </div>
                          {v.laborBankUsed > 0 && (
                            <div className="text-xs text-red-500">−${(v.laborBankUsed / 100).toFixed(2)}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── WORK ORDERS ── */}
            <TabsContent value="workorders" className="space-y-3">
              {woLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading work orders…
                </div>
              ) : workOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No work orders for this membership yet.</p>
              ) : (
                (workOrders as any[]).map((wo: any) => (
                  <div
                    key={wo.id}
                    className="rounded-lg border p-3 hover:border-primary/40 transition-colors cursor-pointer"
                    onClick={() => {
                      onClose();
                      navigate(`/360/work-orders/${wo.id}`);
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium capitalize">{wo.visitType ?? wo.season ?? "Work Order"} Visit</span>
                      <Badge
                        variant="outline"
                        className={`text-xs capitalize ${
                          wo.status === "completed"
                            ? "border-green-500 text-green-600"
                            : wo.status === "in_progress"
                            ? "border-blue-500 text-blue-600"
                            : wo.status === "scheduled"
                            ? "border-amber-500 text-amber-600"
                            : ""
                        }`}
                      >
                        {wo.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {wo.scheduledDate && (
                        <span>📅 {new Date(wo.scheduledDate).toLocaleDateString()}</span>
                      )}
                      {wo.assignedTechName && <span>👤 {wo.assignedTechName}</span>}
                      {wo.healthScore != null && <span>🏠 Health: {wo.healthScore}/100</span>}
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            {/* ── NOTES ── */}
            <TabsContent value="notes" className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Internal Notes</Label>
                <p className="text-xs text-muted-foreground">
                  Visible to staff only. Not shown to the customer.
                </p>
                <Textarea
                  rows={8}
                  placeholder="Add notes about this membership, special instructions, billing arrangements, etc."
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                />
                <Button
                  className="w-full"
                  disabled={!notesDirty || saveNotesMutation.isPending}
                  onClick={() => saveNotesMutation.mutate({ propertyId: property.id, notes })}
                >
                  {saveNotesMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Notes
                </Button>
              </div>
            </TabsContent>

            {/* ── DANGER ZONE ── */}
            <TabsContent value="danger" className="space-y-4">
              {/* Pause / Resume */}
              <div className="rounded-lg border border-amber-200 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {isPaused ? <PlayCircle className="h-4 w-4 text-green-600" /> : <PauseCircle className="h-4 w-4 text-amber-500" />}
                  <h3 className="text-sm font-semibold">{isPaused ? "Resume Membership" : "Pause Membership"}</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isPaused
                    ? "Reactivate this membership. Visits and labor bank will resume."
                    : "Temporarily suspend visits and labor bank usage. Billing continues unless cancelled in Stripe."}
                </p>
                {isPaused ? (
                  <Button
                    variant="outline"
                    className="w-full text-green-600 border-green-300"
                    disabled={resumeMutation.isPending}
                    onClick={() => resumeMutation.mutate({ propertyId: property.id })}
                  >
                    {resumeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Resume Membership
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full text-amber-600 border-amber-300"
                    onClick={() => setShowPauseConfirm(true)}
                  >
                    <PauseCircle className="h-4 w-4 mr-2" />
                    Pause Membership
                  </Button>
                )}
              </div>

              <Separator />

              {/* Cancel */}
              <div className="rounded-lg border border-destructive/30 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <h3 className="text-sm font-semibold text-destructive">Cancel Membership</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Permanently deactivates this membership. Remaining labor bank balance is forfeited. This does NOT cancel the Stripe subscription — do that separately in Stripe.
                </p>
                <Button
                  variant="outline"
                  className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel Membership
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Pause confirm */}
      <AlertDialog open={showPauseConfirm} onOpenChange={setShowPauseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause 360° Membership?</AlertDialogTitle>
            <AlertDialogDescription>
              Visits will be suspended. Billing continues in Stripe unless you cancel there too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Input
              placeholder="Reason (optional)"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep active</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 text-white hover:bg-amber-600"
              onClick={() => pauseMutation.mutate({ propertyId: property.id, reason: pauseReason || undefined })}
              disabled={pauseMutation.isPending}
            >
              {pauseMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Pause
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirm */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel 360° Membership?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the membership for <strong>{property.label}</strong>. The remaining labor bank balance will be forfeited. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep membership</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelMutation.mutate({ propertyId: property.id })}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Yes, cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
