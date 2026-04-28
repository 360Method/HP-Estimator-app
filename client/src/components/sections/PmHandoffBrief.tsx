// ============================================================
// PmHandoffBrief — handoff summary delivered to the Project Manager
// ------------------------------------------------------------
// Shown when a sale is signed (opportunity area transitions to 'job').
// Packages everything the PM needs to own execution without going back
// to the Consultant: contact, communication preferences, accepted scope,
// timeline, crew needs, and consultant notes.
// ============================================================

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClipboardList, CalendarDays, Users, Phone, Mail, FileText, Briefcase, ChevronRight } from 'lucide-react';
import type { Opportunity, Customer } from '@/lib/types';
import { trpc } from '@/lib/trpc';

interface Props {
  opportunity: Opportunity;
  customer?: Customer;
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDollar(n?: number) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function PmHandoffBrief({ opportunity, customer }: Props) {
  const { data: history = [] } = trpc.opportunities.pipelineHistory.useQuery(
    { opportunityId: opportunity.id, limit: 10 },
    { refetchOnWindowFocus: false },
  );

  const signedEvent = history.find((e: any) => e.eventType === 'sale_signed');

  const prefs = customer?.sendNotifications ? 'Opted in to email + SMS' : 'Email only';
  const phone = customer?.mobilePhone || customer?.homePhone || customer?.workPhone || '—';
  const email = customer?.email || '—';

  // Parse consultant notes if present in opportunity.notes
  const notesBlock = opportunity.notes ?? '';
  const consultantNotes = notesBlock.length > 0 ? notesBlock : 'No consultant notes recorded. Reach out to the Consultant before scheduling kickoff.';

  // Pull tasks / scope if present on the opportunity
  const tasks = (opportunity.tasks as any) || [];
  const scopeLabel = opportunity.title || 'Project scope';

  return (
    <div className="space-y-4">
      {/* Role-specific header */}
      <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="w-4 h-4 text-orange-700" />
          <span className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Project Manager — Handoff Brief
          </span>
        </div>
        <p className="text-sm text-orange-900/80">
          The sale is signed. From here, you own execution through completion — scheduling, crew, materials, customer communication, and sign-off. Everything below is what the Consultant captured during discovery.
        </p>
      </div>

      {/* Customer contact + communication preferences */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Customer contact &amp; preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-1.5">
            <span className="text-muted-foreground">Homeowner</span>
            <span className="font-medium">{customer?.displayName || '—'}</span>
            <span className="text-muted-foreground">Phone</span>
            <span className="font-mono">{phone}</span>
            <span className="text-muted-foreground">Email</span>
            <span className="font-mono text-xs">{email}</span>
            <span className="text-muted-foreground">Preferences</span>
            <span>{prefs}</span>
            <span className="text-muted-foreground">Address</span>
            <span>{[customer?.street, customer?.city, customer?.state, customer?.zip].filter(Boolean).join(', ') || '—'}</span>
          </div>
        </CardContent>
      </Card>

      {/* Accepted scope */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Scope accepted
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {fmtDollar(opportunity.value)}
            </Badge>
            <div className="flex-1">
              <div className="font-medium">{scopeLabel}</div>
              {opportunity.jobNumber && (
                <div className="text-xs text-muted-foreground">Job #{opportunity.jobNumber}</div>
              )}
            </div>
          </div>
          {tasks.length > 0 && (
            <ul className="mt-2 space-y-1 pl-4">
              {tasks.slice(0, 10).map((t: any, i: number) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <span>{t.title || t.label || String(t)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Timeline committed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Timeline committed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5">
            <span className="text-muted-foreground">Scheduled start</span>
            <span className="font-medium">{fmtDate(opportunity.scheduledDate)}</span>
            <span className="text-muted-foreground">Scheduled end</span>
            <span className="font-medium">{fmtDate(opportunity.scheduledEndDate)}</span>
            <span className="text-muted-foreground">Sale signed</span>
            <span className="font-medium">{fmtDate(signedEvent?.createdAt instanceof Date ? signedEvent.createdAt.toISOString() : (signedEvent?.createdAt ?? opportunity.wonAt ?? null))}</span>
          </div>
          {!opportunity.scheduledDate && (
            <p className="text-[11px] text-muted-foreground mt-2">
              No start date yet — add one in Schedule before confirming crew.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Crew required */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Crew required
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <div className="text-muted-foreground mb-1.5">Assigned to</div>
          <div className="font-medium">
            {opportunity.assignedTo || 'Not yet assigned — set crew in Schedule'}
          </div>
          {opportunity.scheduleNotes && (
            <div className="mt-3">
              <div className="text-muted-foreground text-xs mb-1">Schedule notes</div>
              <div className="text-xs whitespace-pre-wrap bg-muted/40 p-2 rounded">{opportunity.scheduleNotes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consultant notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Consultant notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm whitespace-pre-wrap bg-muted/40 p-3 rounded text-muted-foreground">
            {consultantNotes}
          </div>
        </CardContent>
      </Card>

      {/* Deep link to scheduling */}
      <div className="flex gap-2">
        <Button
          onClick={() => {
            window.location.href = `/?section=schedule&opportunity=${opportunity.id}`;
          }}
          className="flex-1"
        >
          <CalendarDays className="w-4 h-4 mr-2" />
          Open in Schedule
        </Button>
      </div>
    </div>
  );
}
