/**
 * DuplicateSuggestionBanner
 * ─────────────────────────
 * Shown inline inside new-customer / lead intake forms when the user types a
 * name, phone, or email that closely matches an existing customer record.
 *
 * Props:
 *   name, phone, email  — current form values (debounced by the parent)
 *   excludeId           — customer ID to exclude (used when editing an existing record)
 *   onUseExisting       — called with the selected customer ID when the user clicks "Use existing"
 *   onDismiss           — called when the user explicitly dismisses the banner
 */
import { useState, useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { AlertCircle, ChevronDown, ChevronUp, UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Props {
  name?: string;
  phone?: string;
  email?: string;
  excludeId?: string;
  onUseExisting: (customerId: string) => void;
  onDismiss?: () => void;
}

type SimilarCustomer = {
  id: string;
  displayName: string;
  email?: string | null;
  mobilePhone?: string | null;
  city?: string | null;
  state?: string | null;
  reason: string;
  score: number;
};

const SCORE_COLOR: Record<number, string> = {};
function scoreColor(score: number) {
  if (score >= 90) return 'bg-red-100 border-red-300 text-red-800';
  if (score >= 75) return 'bg-orange-100 border-orange-300 text-orange-800';
  return 'bg-yellow-100 border-yellow-300 text-yellow-800';
}

export default function DuplicateSuggestionBanner({
  name,
  phone,
  email,
  excludeId,
  onUseExisting,
  onDismiss,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when inputs change significantly
  const prevKey = useRef('');
  const key = `${name}|${phone}|${email}`;
  if (key !== prevKey.current) {
    prevKey.current = key;
    if (dismissed) setDismissed(false);
  }

  const hasInput = (name?.trim().length ?? 0) >= 3 || (phone?.replace(/\D/g, '').length ?? 0) >= 7 || (email?.trim().length ?? 0) >= 5;

  const { data, isFetching } = trpc.customers.findSimilar.useQuery(
    { name: name?.trim(), phone: phone?.trim(), email: email?.trim(), excludeId },
    {
      enabled: hasInput && !dismissed,
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    }
  );

  const matches = (data ?? []) as SimilarCustomer[];

  if (!hasInput || dismissed || matches.length === 0) return null;

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div className={`rounded-lg border overflow-hidden mb-3 ${scoreColor(matches[0]?.score ?? 0)}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium flex-1">
          {matches.length === 1
            ? 'Possible duplicate customer found'
            : `${matches.length} possible duplicate customers found`}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="p-0.5 rounded hover:bg-black/10 transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-0.5 rounded hover:bg-black/10 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Match list */}
      {expanded && (
        <div className="border-t border-current/20 divide-y divide-current/10 bg-white/60">
          {matches.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">{m.displayName}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0 border-current/30">
                    {m.reason}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                  {m.email && <span>{m.email}</span>}
                  {m.mobilePhone && <span>{m.mobilePhone}</span>}
                  {(m.city || m.state) && <span>{[m.city, m.state].filter(Boolean).join(', ')}</span>}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 bg-white hover:bg-primary hover:text-primary-foreground"
                onClick={() => onUseExisting(m.id)}
              >
                <UserCheck className="w-3.5 h-3.5" />
                Use existing
              </Button>
            </div>
          ))}
          <div className="px-3 py-2 text-xs text-muted-foreground bg-white/40">
            Not a match?{' '}
            <button type="button" className="underline hover:no-underline" onClick={handleDismiss}>
              Dismiss and create new
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
