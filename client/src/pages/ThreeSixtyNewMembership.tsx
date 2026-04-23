/**
 * 360 Method — New Membership Enrollment Form
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, CheckCircle2, Crown, Star, Shield } from 'lucide-react';
import {
  TIER_DEFINITIONS,
  ALL_TIERS,
  type MemberTier,
  type BillingCadence,
  formatDollars,
  getSavingsVsMonthly,
} from '../../../shared/threeSixtyTiers';
import { toast } from 'sonner';

const TIER_ICONS: Record<MemberTier, React.ElementType> = {
  bronze: Shield,
  silver: Star,
  gold: Crown,
};

const TIER_RING: Record<MemberTier, string> = {
  bronze: 'ring-amber-400',
  silver: 'ring-slate-400',
  gold: 'ring-yellow-500',
};

const CADENCE_LABELS: Record<BillingCadence, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
};

const CADENCE_PERIOD: Record<BillingCadence, string> = {
  monthly: '/mo',
  quarterly: '/quarter',
  annual: '/year',
};

interface Props {
  onBack: () => void;
}

export default function ThreeSixtyNewMembership({ onBack }: Props) {
  
  const utils = trpc.useUtils();

  const [selectedTier, setSelectedTier] = useState<MemberTier>('silver');
  const [cadence, setCadence] = useState<BillingCadence>('monthly');
  const [customerId, setCustomerId] = useState<string>('');

  const { data: customers } = trpc.customers.list.useQuery({});

  const enroll = trpc.threeSixty.memberships.create.useMutation({
    onSuccess: () => {
      utils.threeSixty.memberships.list.invalidate();
      toast.success('Membership created successfully');
      onBack();
    },
    onError: err => {
      toast.error(err.message);
    },
  });

  const tierDef = TIER_DEFINITIONS[selectedTier];
  const price = tierDef.pricing[cadence];
  const savings = getSavingsVsMonthly(selectedTier, cadence);

  const handleSubmit = () => {
    if (!customerId) {
      toast.error('Select a customer first');
      return;
    }
    enroll.mutate({
      customerId: customerId,
      tier: selectedTier,
      startDate: Date.now(),
    });
  };

  return (
    <div className="container py-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">New 360 Membership</h1>
          <p className="text-sm text-muted-foreground">Enroll a homeowner in the 360 Method program</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Customer selection */}
        <div className="space-y-2">
          <Label htmlFor="customer">Customer</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger id="customer">
              <SelectValue placeholder="Select a customer…" />
            </SelectTrigger>
            <SelectContent>
              {(customers ?? []).map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.firstName} {c.lastName}
                  {c.email ? ` — ${c.email}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Billing cadence toggle */}
        <div className="space-y-2">
          <Label>Billing Cadence</Label>
          <Tabs value={cadence} onValueChange={v => setCadence(v as BillingCadence)}>
            <TabsList>
              {(Object.keys(CADENCE_LABELS) as BillingCadence[]).map(c => (
                <TabsTrigger key={c} value={c}>
                  {CADENCE_LABELS[c]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {savings > 0 && (
            <p className="text-xs text-emerald-600 font-medium">
              Save {formatDollars(savings)}/yr vs. monthly billing
            </p>
          )}
        </div>

        {/* Tier selection */}
        <div className="space-y-2">
          <Label>Membership Tier</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ALL_TIERS.map(tier => {
              const def = TIER_DEFINITIONS[tier];
              const TierIcon = TIER_ICONS[tier];
              const tierPrice = def.pricing[cadence];
              const isSelected = selectedTier === tier;

              return (
                <Card
                  key={tier}
                  className={`cursor-pointer border-2 transition-all ${
                    isSelected
                      ? `ring-2 ${TIER_RING[tier]} border-transparent shadow-md`
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                  onClick={() => setSelectedTier(tier)}
                >
                  <CardHeader className="pb-2 pt-4">
                    <div className="flex items-center gap-2">
                      <TierIcon className="w-4 h-4 text-muted-foreground" />
                      <CardTitle className="text-sm">{def.label}</CardTitle>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" />}
                    </div>
                    <div className="text-xl font-bold">
                      {formatDollars(tierPrice)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        {CADENCE_PERIOD[cadence]}
                      </span>
                    </div>
                    {cadence !== 'monthly' && (
                      <div className="text-xs text-muted-foreground">
                        ≈ {formatDollars(Math.round(cadence === 'quarterly' ? tierPrice / 3 : tierPrice / 12))}/mo
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0 pb-3">
                    <ul className="space-y-1">
                      {def.features.slice(0, 3).map((f, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <Card className="border bg-muted/30">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Enrollment Summary</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tier</span>
                <span className="font-medium">{tierDef.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Billing</span>
                <span className="font-medium">{CADENCE_LABELS[cadence]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{formatDollars(price)}{CADENCE_PERIOD[cadence]}</span>
              </div>
              {tierDef.laborBankCreditCents > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Labor bank credit</span>
                  <span className="font-medium text-emerald-600">+{formatDollars(tierDef.laborBankCreditCents)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seasonal visits/yr</span>
                <span className="font-medium">{tierDef.seasonalVisits}</span>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Annual equivalent</span>
                <span className="font-semibold">
                  {formatDollars(
                    cadence === 'annual' ? price :
                    cadence === 'quarterly' ? price * 4 :
                    price * 12
                  )}/yr
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={!customerId || enroll.isPending}
        >
          {enroll.isPending ? 'Enrolling…' : `Enroll in ${tierDef.label} — ${formatDollars(price)}${CADENCE_PERIOD[cadence]}`}
        </Button>
      </div>
    </div>
  );
}
