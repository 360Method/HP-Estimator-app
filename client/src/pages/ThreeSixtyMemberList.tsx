/**
 * 360 Method — Member List Page
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, Crown, Star, Shield } from 'lucide-react';
import { formatDollars, type MemberTier } from '../../../shared/threeSixtyTiers';
import ThreeSixtyMemberDetail from './ThreeSixtyMemberDetail';

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

  const { data: memberships, isLoading } = trpc.threeSixty.memberships.list.useQuery();

  if (selectedId !== null) {
    return (
      <ThreeSixtyMemberDetail
        membershipId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const filtered = (memberships ?? []).filter(m =>
    search === '' ||
    m.tier.includes(search.toLowerCase()) ||
    m.status.includes(search.toLowerCase()) ||
    String(m.id).includes(search)
  );

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
          placeholder="Search by tier, status, or ID…"
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
            return (
              <Card
                key={m.id}
                className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedId(m.id)}
              >
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <TierIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${TIER_BADGE[m.tier as MemberTier]}`}>
                    {m.tier.charAt(0).toUpperCase() + m.tier.slice(1)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Membership #{m.id}</div>
                    <div className="text-xs text-muted-foreground">
                      Started {new Date(m.startDate).toLocaleDateString()} ·
                      Renews {new Date(m.renewalDate).toLocaleDateString()} ·
                      Labor bank: {formatDollars(m.laborBankBalance ?? 0)}
                    </div>
                  </div>
                  <Badge
                    variant={m.status === 'active' ? 'default' : 'secondary'}
                    className="text-xs shrink-0"
                  >
                    {m.status}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
