// ============================================================
// ConsultantBrief — expert prep panel for the Consultant role
// ------------------------------------------------------------
// Handy Pioneers rule: a Consultant is an expert advisor, never a
// salesperson. This view is written accordingly — there is no
// pitch language, no "conversion tactics," no urgency prompts.
// The homeowner has already invited us into their home; our job
// is to look, explain what we see, and help them make a good
// decision on their timeline.
// ============================================================

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Home, ClipboardList, FileText, MessageCircle, Send, UserCheck } from 'lucide-react';
import type { Opportunity, Customer } from '@/lib/types';
import { trpc } from '@/lib/trpc';

interface Props {
  opportunity: Opportunity;
  customer?: Customer;
}

// A structured outline that frames the visit as a walkthrough, not a pitch.
// Each bullet is descriptive language — "show, explain, ask" — never "close".
const WALKTHROUGH_OUTLINE = [
  {
    title: 'Greet and set the tone',
    detail: "Thank them for inviting you in. Tell them what to expect: you'll walk the home, share what you see, and answer their questions. No timeline pressure.",
  },
  {
    title: 'Listen first',
    detail: "Ask what brought them to reach out today. Let them finish the sentence before you speak. The most valuable minute of the visit is the one where you don't talk.",
  },
  {
    title: 'Walk the systems',
    detail: 'Touch every system on the Living Health Record — exterior, roof, plumbing, electrical, HVAC. Narrate what you see in plain language. Flag NOW / SOON / WAIT as you go.',
  },
  {
    title: 'Teach one thing they did not know',
    detail: 'Every home has a non-obvious finding. Show it, explain why it matters, and let them decide what to do with it. This is what separates an expert from a salesperson.',
  },
  {
    title: 'Share the findings',
    detail: "Summarize aloud before you leave: what's good, what needs attention, what can wait. Ask if the priorities feel right to them.",
  },
  {
    title: 'Set expectations for the written scope',
    detail: "Tell them when they'll see the written scope of work. That's where we translate today's conversation into clear next steps — on their timeline, not ours.",
  },
];

export default function ConsultantBrief({ opportunity, customer }: Props) {
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  const { data: history = [] } = trpc.opportunities.pipelineHistory.useQuery(
    { opportunityId: opportunity.id, limit: 10 },
    { refetchOnWindowFocus: false },
  );

  const advance = trpc.opportunities.advanceStage.useMutation();

  const propertyAddress = customer
    ? [customer.street, customer.unit, customer.city, customer.state, customer.zip].filter(Boolean).join(', ')
    : '—';

  const handleSendScope = async () => {
    await advance.mutateAsync({
      opportunityId: opportunity.id,
      toStage: 'Scope Drafted',
      toArea: 'estimate',
    });
    setSaved(true);
  };

  return (
    <div className="space-y-4">
      {/* Role-specific header — makes role obvious, no sales framing */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <UserCheck className="w-4 h-4 text-violet-700" />
          <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Consultant — Expert Walkthrough
          </span>
        </div>
        <p className="text-sm text-violet-900/80">
          You are visiting as an expert advisor. Your role is to look, listen, and educate. Everything you record here becomes part of the homeowner's Living Health Record — a reference they can come back to on their own timeline.
        </p>
      </div>

      {/* Property + prior context */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Home className="w-4 h-4" />
            Property &amp; prior context
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Address</span>
            <span className="font-medium">{propertyAddress}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Homeowner</span>
            <span className="font-medium">{customer?.displayName || `${customer?.firstName ?? ''} ${customer?.lastName ?? ''}`.trim() || '—'}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Lead source</span>
            <span className="font-medium">{customer?.leadSource || 'Direct inquiry'}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-24 shrink-0">Nurturer notes</span>
            <span className="text-muted-foreground italic">
              {opportunity.notes ? opportunity.notes.slice(0, 200) + (opportunity.notes.length > 200 ? '…' : '') : 'None yet — the Nurturer did not leave a handoff note.'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Recent history from the nurturer */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            Prior touchpoints
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No recorded touchpoints yet. The nurturer may have spoken by phone — check the Inbox thread for this homeowner before you arrive.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {history.slice(0, 5).map((e: any) => (
                <li key={e.id} className="flex items-start gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {String(e.eventType).replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-muted-foreground">
                    {e.fromStage ? `${e.fromStage} → ${e.toStage ?? '?'}` : e.toStage ?? ''}
                  </span>
                  <span className="ml-auto text-muted-foreground/60 shrink-0">
                    {new Date(e.createdAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Suggested walkthrough outline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Walkthrough outline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {WALKTHROUGH_OUTLINE.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-muted text-foreground text-xs font-bold">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">{step.title}</div>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Consultant notes pad */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Findings captured during the visit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe what you saw. Systems, condition, priorities (NOW / SOON / WAIT), and any context the homeowner shared."
            className="w-full min-h-[180px] p-3 text-sm border border-border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setNotes(notes + '\n\n— NOW:\n— SOON:\n— WAIT:\n')}>
              Insert NOW / SOON / WAIT
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={handleSendScope}
              disabled={advance.isPending || saved}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {saved ? 'Scope in draft' : 'Send written scope of work'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sending moves this opportunity to the Estimate stage. A written scope gives the homeowner a reference they can consider on their timeline — there is no pressure to decide today.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
