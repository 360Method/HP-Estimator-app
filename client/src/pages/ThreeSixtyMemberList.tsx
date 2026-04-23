/**
 * 360 Method — Member List Page
 * Shows customer name, property address, tier, status, and labor bank.
 * Provides "View Customer Profile" navigation back to the customer.
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, Crown, Star, Shield, User, MapPin, ExternalLink } from 'lucide-react';
import { formatDollars, TIER_DEFINITIONS, type MemberTier } from '../../../shared/threeSixtyTiers';
import ThreeSixtyMemberDetail from './ThreeSixtyMemberDetail';
import { useEstimator } from '@/contexts/EstimatorContext';

const TIER_ICONS: Record<MemberTier, React.ElementType> = {
  bronze: Shield,
  silver: Star,
  gold: Crown,
};

const TIER_BADGE: Record<MemberTier, string> = {
  bronze: 'bg-amber-100 text-amber-800 border-amber-300',
  silver: 'bg-slate-100 text-slate-700 border-slate-300',
  gold: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};

interface Props {
  onBack: () => void;
}

export default function ThreeSixtyMemberList({ onBack }: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { setActiveCustomer, setSection } = useEstimator();

  const { data: memberships, isLoading } = trpc.threeSixty.memberships.list.useQuery();

  if (selectedId !== null) {
    return (
      <ThreeSixtyMemberDetail
        membershipId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const filtered = (memberships ?? []).filter(m => {
    if (search === '') return true;
    const q = search.toLowerCase();
    const name = (m as any).customerName ?? '';
    const street = (m as any).propertyStreet ?? '';
    const city = (m as any).propertyCity ?? '';
    return (
      name.toLowerCase().includes(q) ||
      street.toLowerCase().includes(q) ||
      city.toLowerCase().includes(q) ||
      m.tier.includes(q) ||
      m.status.includes(q) ||
      String(m.id).includes(q)
    );
  });

  const handleViewCustomer = (e: React.MouseEvent, m: any) => {
    e.stopPropagation();
    if (m.hpCustomerId) {
      setActiveCustomer(m.hpCustomerId, 'direct');
      setSection('customer');
      // Deep-link to the 360° tab inside the customer profile
      setTimeout(() => {
        const el = document.querySelector('[data-tab="membership360"]') as HTMLElement | null;
        el?.click();
      }, 150);
    }
  };

  // Primary card click → go directly to customer profile 360° tab
  const handleCardClick = (m: any) => {
    if (m.hpCustomerId) {
      setActiveCustomer(m.hpCustomerId, 'direct');
      setSection('customer');
      setTimeout(() => {
        const el = document.querySelector('[data-tab="membership360"]') as HTMLElement | null;
        el?.click();
      }, 150);
    } else {
      setSelectedId(m.id);
    }
  };

  return (
    <div className="container py-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">All Members</h1>
          <p className="text-sm text-muted-foreground">{memberships?.length ?? 0} total memberships</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, address, tier, or status…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">No memberships found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(m => {
            const TierIcon = TIER_ICONS[m.tier as MemberTier];
            const customerName = (m as any).customerName as string | undefined;
            const propertyStreet = (m as any).propertyStreet as string | undefined;
            const propertyCity = (m as any).propertyCity as string | undefined;
            const propertyLabel = (m as any).propertyLabel as string | undefined;
            const propertyLine = [propertyStreet, propertyCity].filter(Boolean).join(', ');
            return (
              <Card
                key={m.id}
                className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleCardClick(m)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    {/* Tier icon */}
                    <div className="mt-0.5 shrink-0">
                      <TierIcon className="w-4 h-4 text-muted-foreground" />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      {/* Customer name (primary) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {customerName ? (
                          <span className="text-sm font-semibold">{customerName}</span>
                        ) : (
                          <span className="text-sm font-medium text-muted-foreground">Membership #{m.id}</span>
                        )}
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TIER_BADGE[m.tier as MemberTier]}`}>
                          {TIER_DEFINITIONS[m.tier as MemberTier]?.label ?? m.tier}
                        </span>
                        <Badge
                          variant={m.status === 'active' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {m.status}
                        </Badge>
                      </div>

                      {/* Property address */}
                      {propertyLine && (
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {propertyLabel && propertyLabel !== 'Home' ? `${propertyLabel} — ` : ''}
                            {propertyLine}
                          </span>
                        </div>
                      )}

                      {/* Meta row */}
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Membership #{m.id} · Started {new Date(m.startDate).toLocaleDateString()} ·
                        Renews {new Date(m.renewalDate).toLocaleDateString()} ·
                        Labor bank: <span className="font-medium text-emerald-700">{formatDollars(m.laborBankBalance ?? 0)}</span>
                      </div>
                    </div>

                    {/* View customer profile button */}
                    {(m as any).hpCustomerId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        onClick={e => handleViewCustomer(e, m)}
                        title="Open customer profile"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Profile</span>
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
