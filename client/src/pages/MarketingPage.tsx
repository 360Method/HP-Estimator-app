// ============================================================
// MarketingPage — Campaigns, automations, review requests
// ============================================================

import React, { useState } from 'react';
import { Megaphone, Mail, MessageSquare, Star, Users, TrendingUp, Send, Clock, ChevronRight, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  type: 'email' | 'sms';
  status: 'draft' | 'scheduled' | 'sent' | 'active';
  audience: string;
  sentCount: number;
  openRate?: number;
  scheduledAt?: string;
  createdAt: string;
}

interface Automation {
  id: string;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
  runCount: number;
}

// ── Sample data ──────────────────────────────────────────────

const SAMPLE_CAMPAIGNS: Campaign[] = [
  {
    id: 'c1',
    name: 'Spring Deck & Fence Promo',
    type: 'email',
    status: 'sent',
    audience: 'All customers',
    sentCount: 142,
    openRate: 38,
    createdAt: '2026-03-15T10:00:00Z',
  },
  {
    id: 'c2',
    name: 'Past Clients — Summer Check-In',
    type: 'sms',
    status: 'scheduled',
    audience: 'Jobs closed > 6 months ago',
    sentCount: 0,
    scheduledAt: '2026-04-20T09:00:00Z',
    createdAt: '2026-04-08T08:00:00Z',
  },
  {
    id: 'c3',
    name: 'New Homeowner Welcome',
    type: 'email',
    status: 'draft',
    audience: 'New customers (last 30 days)',
    sentCount: 0,
    createdAt: '2026-04-05T14:00:00Z',
  },
];

const SAMPLE_AUTOMATIONS: Automation[] = [
  {
    id: 'a1',
    name: 'Review Request — 3 Days After Job Close',
    trigger: 'Job marked complete',
    action: 'Send SMS with Google review link',
    enabled: true,
    runCount: 47,
  },
  {
    id: 'a2',
    name: 'Estimate Follow-Up — 48 Hours',
    trigger: 'Estimate sent, no response',
    action: 'Send follow-up SMS',
    enabled: true,
    runCount: 23,
  },
  {
    id: 'a3',
    name: 'Win-Back — 12 Months Inactive',
    trigger: 'Customer last job > 12 months ago',
    action: 'Send email with seasonal promo',
    enabled: false,
    runCount: 8,
  },
  {
    id: 'a4',
    name: 'Birthday Discount',
    trigger: 'Customer birthday (if on file)',
    action: 'Send SMS with 10% off coupon',
    enabled: false,
    runCount: 3,
  },
];

// ── Status badge ─────────────────────────────────────────────

const STATUS_COLORS: Record<Campaign['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  sent: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  active: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Review request panel ──────────────────────────────────────

function ReviewRequestPanel() {
  const [sending, setSending] = useState(false);

  const handleSendReviewRequest = () => {
    setSending(true);
    setTimeout(() => {
      setSending(false);
      toast.success('Review request sent via SMS');
    }, 1200);
  };

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" />
          Review Requests
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Avg Rating', value: '4.9', sub: '38 reviews' },
            { label: 'Google', value: '4.9★', sub: '38 reviews' },
            { label: 'GBP', value: '—', sub: 'Connect GBP' },
          ].map(stat => (
            <div key={stat.label} className="rounded-lg bg-muted/40 p-3 text-center">
              <div className="text-lg font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
              <div className="text-xs text-muted-foreground">{stat.sub}</div>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Send a Google review request to a customer after job completion.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSendReviewRequest}
              disabled={sending}
            >
              {sending
                ? <span className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />
                : <Send className="w-3 h-3" />}
              Send Review Request
            </Button>
            <Button size="sm" variant="outline" onClick={() => toast.info('Automation settings — coming soon')}>
              <Zap className="w-3 h-3 mr-1" /> Auto-Send Settings
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'automations' | 'reviews'>('campaigns');
  const [automations, setAutomations] = useState(SAMPLE_AUTOMATIONS);

  const toggleAutomation = (id: string) => {
    setAutomations(prev =>
      prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a)
    );
    const a = automations.find(x => x.id === id);
    if (a) toast.success(`${a.name} ${a.enabled ? 'disabled' : 'enabled'}`);
  };

  const TABS = [
    { id: 'campaigns' as const, label: 'Campaigns', icon: Megaphone },
    { id: 'automations' as const, label: 'Automations', icon: Zap },
    { id: 'reviews' as const, label: 'Reviews', icon: Star },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Marketing</h1>
              <p className="text-xs text-muted-foreground">Campaigns, automations, and review management</p>
            </div>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => toast.info('Campaign builder — coming soon')}
          >
            <Plus className="w-4 h-4" />
            New Campaign
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { icon: Users, label: 'Total Contacts', value: '142', color: 'text-blue-600' },
            { icon: Mail, label: 'Emails Sent (MTD)', value: '89', color: 'text-emerald-600' },
            { icon: MessageSquare, label: 'SMS Sent (MTD)', value: '53', color: 'text-violet-600' },
            { icon: TrendingUp, label: 'Avg Open Rate', value: '38%', color: 'text-amber-600' },
          ].map(stat => (
            <div key={stat.label} className="rounded-lg bg-muted/40 p-3 flex items-center gap-3">
              <stat.icon className={`w-5 h-5 ${stat.color} shrink-0`} />
              <div>
                <div className="text-base font-bold">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-5xl space-y-4">

        {/* ── Campaigns tab ── */}
        {activeTab === 'campaigns' && (
          <div className="space-y-3">
            {SAMPLE_CAMPAIGNS.map(campaign => (
              <Card key={campaign.id} className="border border-border hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        campaign.type === 'email'
                          ? 'bg-blue-100 dark:bg-blue-900/30'
                          : 'bg-green-100 dark:bg-green-900/30'
                      }`}>
                        {campaign.type === 'email'
                          ? <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          : <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{campaign.name}</span>
                          <Badge className={`text-xs ${STATUS_COLORS[campaign.status]}`}>
                            {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {campaign.audience}
                          {campaign.scheduledAt && (
                            <> · <Clock className="w-3 h-3 inline mx-0.5" />Scheduled {fmtDate(campaign.scheduledAt)}</>
                          )}
                          {campaign.status === 'sent' && (
                            <> · {campaign.sentCount} sent · {campaign.openRate}% open rate</>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs gap-1"
                      onClick={() => toast.info('Campaign editor — coming soon')}
                    >
                      Edit <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Megaphone className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">Create your next campaign</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Email and SMS campaigns to past clients, seasonal promos, and win-back sequences.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => toast.info('Campaign builder — coming soon')}
              >
                <Plus className="w-3.5 h-3.5" /> New Campaign
              </Button>
            </div>
          </div>
        )}

        {/* ── Automations tab ── */}
        {activeTab === 'automations' && (
          <div className="space-y-3">
            {automations.map(automation => (
              <Card key={automation.id} className="border border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        automation.enabled
                          ? 'bg-violet-100 dark:bg-violet-900/30'
                          : 'bg-muted'
                      }`}>
                        <Zap className={`w-4 h-4 ${automation.enabled ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{automation.name}</span>
                          <Badge className={`text-xs ${automation.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-muted text-muted-foreground'}`}>
                            {automation.enabled ? 'Active' : 'Paused'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Trigger: {automation.trigger} · Action: {automation.action}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Run {automation.runCount} times
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleAutomation(automation.id)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          automation.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            automation.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Reviews tab ── */}
        {activeTab === 'reviews' && (
          <ReviewRequestPanel />
        )}

      </div>
    </div>
  );
}
