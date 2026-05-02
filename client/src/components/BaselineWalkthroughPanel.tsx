import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ImagePlus,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc';

type Condition = 'good' | 'monitor' | 'needs_attention' | 'urgent';
type Severity = 'low' | 'medium' | 'high' | 'critical';
type Timeframe = 'wait' | 'soon' | 'now';
type Priority = 'red' | 'yellow' | 'green';

type BaselinePhoto = {
  id: string;
  name: string;
  previewUrl: string;
  caption: string;
};

type BaselineFinding = {
  id: string;
  section: string;
  title: string;
  condition: Condition;
  severity: Severity;
  timeframe: Timeframe;
  impact: string[];
  notes: string;
  photos: BaselinePhoto[];
  needsSpecialist: boolean;
  createOpportunity: boolean;
  approved: boolean;
  ai?: {
    priority: Priority;
    timeframe: Timeframe;
    confidence: number;
    consultantSummary: string;
    customerSummary: string;
    recommendedAction: string;
    reviewRequired: boolean;
    reviewReason: string;
    qualityFlags: string[];
  };
};

const SECTIONS = [
  'Property Snapshot',
  'Exterior Envelope',
  'Roof / Gutters / Drainage',
  'Windows / Doors / Openings',
  'Interior Condition',
  'Plumbing / Water Risk',
  'Electrical / Safety',
  'HVAC / Comfort',
  'Crawlspace / Attic / Structure',
  'Customer Goals',
];

const IMPACTS = ['Safety', 'Water intrusion', 'Comfort', 'Appearance', 'Efficiency', 'Property value'];

const priorityClass: Record<Priority, string> = {
  red: 'border-rose-200 bg-rose-50 text-rose-700',
  yellow: 'border-amber-200 bg-amber-50 text-amber-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

function conditionLabel(condition: Condition) {
  return condition.replace('_', ' ');
}

function qualityScore(findings: BaselineFinding[]) {
  if (findings.length === 0) return 0;
  let score = 35;
  score += Math.min(25, findings.length * 4);
  score += Math.min(20, findings.filter(f => f.notes.trim()).length * 4);
  score += Math.min(10, findings.filter(f => f.photos.length > 0).length * 2);
  score += Math.min(10, findings.filter(f => f.approved).length * 3);
  return Math.min(100, score);
}

function makeFinding(section: string): BaselineFinding {
  return {
    id: nanoid(),
    section,
    title: '',
    condition: 'monitor',
    severity: 'medium',
    timeframe: 'soon',
    impact: [],
    notes: '',
    photos: [],
    needsSpecialist: false,
    createOpportunity: false,
    approved: false,
  };
}

type Props = {
  customerName: string;
  propertyLabel: string;
  propertyAddress: string;
};

export default function BaselineWalkthroughPanel({ customerName, propertyLabel, propertyAddress }: Props) {
  const [activeSection, setActiveSection] = useState(SECTIONS[0]);
  const [findings, setFindings] = useState<BaselineFinding[]>([makeFinding(SECTIONS[0])]);
  const [consultantSummary, setConsultantSummary] = useState('');
  const baselineAi = trpc.aiBrain.prioritizeBaselineFindings.useMutation();

  const sectionFindings = findings.filter(f => f.section === activeSection);
  const score = qualityScore(findings);
  const counts = useMemo(() => {
    const approved = findings.filter(f => f.approved).length;
    const red = findings.filter(f => f.ai?.priority === 'red').length;
    const yellow = findings.filter(f => f.ai?.priority === 'yellow').length;
    const green = findings.filter(f => f.ai?.priority === 'green').length;
    return { approved, red, yellow, green };
  }, [findings]);

  const updateFinding = (id: string, patch: Partial<BaselineFinding>) => {
    setFindings(current => current.map(f => f.id === id ? { ...f, ...patch, approved: patch.approved ?? false } : f));
  };

  const addFinding = (section = activeSection) => {
    setFindings(current => [...current, makeFinding(section)]);
  };

  const removeFinding = (id: string) => {
    setFindings(current => current.filter(f => f.id !== id));
  };

  const attachPhotos = (findingId: string, files: FileList | null) => {
    if (!files?.length) return;
    const photos = Array.from(files).map(file => ({
      id: nanoid(),
      name: file.name,
      previewUrl: URL.createObjectURL(file),
      caption: '',
    }));
    setFindings(current => current.map(f => f.id === findingId ? { ...f, photos: [...f.photos, ...photos], approved: false } : f));
  };

  const runAi = async () => {
    const readyFindings = findings.filter(f => f.title.trim() || f.notes.trim());
    if (readyFindings.length === 0) {
      toast.info('Add at least one finding title or note before asking AI to prioritize.');
      return;
    }
    const result = await baselineAi.mutateAsync({
      customerName,
      propertyAddress,
      findings: readyFindings.map(f => ({
        id: f.id,
        section: f.section,
        title: f.title || `${f.section} finding`,
        condition: f.condition,
        severity: f.severity,
        timeframe: f.timeframe,
        impact: f.impact,
        notes: f.notes,
        photoCount: f.photos.length,
        needsSpecialist: f.needsSpecialist,
        createOpportunity: f.createOpportunity,
      })),
    });
    setConsultantSummary(result.executiveSummary);
    setFindings(current => current.map(f => {
      const ai = result.findings.find(item => item.findingId === f.id);
      return ai ? {
        ...f,
        approved: false,
        ai: {
          priority: ai.priority,
          timeframe: ai.timeframe,
          confidence: ai.confidence,
          consultantSummary: ai.consultantSummary,
          customerSummary: ai.customerSummary,
          recommendedAction: ai.recommendedAction,
          reviewRequired: ai.reviewRequired,
          reviewReason: ai.reviewReason,
          qualityFlags: ai.qualityFlags,
        },
      } : f;
    }));
    toast.success('AI prioritization is ready for consultant review.');
  };

  const finalize = () => {
    const unapproved = findings.filter(f => (f.title.trim() || f.notes.trim()) && !f.approved);
    if (unapproved.length > 0) {
      toast.error('Approve or edit every finding before finalizing the baseline.');
      return;
    }
    toast.success('Baseline marked ready for customer-facing roadmap review.');
  };

  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Consultant Baseline Walkthrough</p>
            <h4 className="mt-1 text-base font-semibold">{propertyLabel}</h4>
            <p className="mt-1 text-sm text-muted-foreground">{propertyAddress || 'No property address set'}</p>
          </div>
          <Badge variant="outline" className={score >= 80 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}>
            Quality {score}/100
          </Badge>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-lg border bg-background px-2 py-2">
            <p className="text-base font-bold">{findings.length}</p>
            <p className="text-[10px] text-muted-foreground">Findings</p>
          </div>
          <div className="rounded-lg border bg-background px-2 py-2">
            <p className="text-base font-bold text-rose-600">{counts.red}</p>
            <p className="text-[10px] text-muted-foreground">Red</p>
          </div>
          <div className="rounded-lg border bg-background px-2 py-2">
            <p className="text-base font-bold text-amber-600">{counts.yellow}</p>
            <p className="text-[10px] text-muted-foreground">Yellow</p>
          </div>
          <div className="rounded-lg border bg-background px-2 py-2">
            <p className="text-base font-bold text-emerald-600">{counts.approved}</p>
            <p className="text-[10px] text-muted-foreground">Approved</p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[260px_1fr]">
        <div className="border-b p-3 lg:border-b-0 lg:border-r">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible">
            {SECTIONS.map(section => {
              const count = findings.filter(f => f.section === section).length;
              return (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`min-w-[180px] rounded-lg border px-3 py-2 text-left text-sm transition-colors lg:min-w-0 lg:w-full ${
                    activeSection === section ? 'border-primary bg-primary/5 text-primary' : 'bg-background hover:bg-muted'
                  }`}
                >
                  <span className="font-medium">{section}</span>
                  <span className="float-right text-xs">{count}</span>
                </button>
              );
            })}
          </div>
          <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => addFinding()}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Finding
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Guided standard
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Capture enough context for AI to prioritize, then approve or edit every output before the customer sees it.
            </p>
          </div>

          {sectionFindings.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">No findings in this section</p>
              <Button size="sm" className="mt-3" onClick={() => addFinding()}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add first finding
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {sectionFindings.map(finding => (
                <div key={finding.id} className="rounded-xl border p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Input
                        value={finding.title}
                        onChange={event => updateFinding(finding.id, { title: event.target.value })}
                        placeholder="Finding title, e.g. gutter pulling away over patio"
                        className="font-medium"
                      />
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeFinding(finding.id)} aria-label="Remove finding">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="text-xs font-medium text-muted-foreground">Condition</span>
                      <select className="mt-1 field-input w-full text-sm" value={finding.condition} onChange={event => updateFinding(finding.id, { condition: event.target.value as Condition })}>
                        <option value="good">Good</option>
                        <option value="monitor">Monitor</option>
                        <option value="needs_attention">Needs attention</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-muted-foreground">Severity</span>
                      <select className="mt-1 field-input w-full text-sm" value={finding.severity} onChange={event => updateFinding(finding.id, { severity: event.target.value as Severity })}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-muted-foreground">Timeframe</span>
                      <select className="mt-1 field-input w-full text-sm" value={finding.timeframe} onChange={event => updateFinding(finding.id, { timeframe: event.target.value as Timeframe })}>
                        <option value="now">Now</option>
                        <option value="soon">Soon</option>
                        <option value="wait">Wait</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground">Customer impact</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {IMPACTS.map(impact => {
                        const active = finding.impact.includes(impact);
                        return (
                          <button
                            key={impact}
                            type="button"
                            onClick={() => updateFinding(finding.id, {
                              impact: active ? finding.impact.filter(i => i !== impact) : [...finding.impact, impact],
                            })}
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${active ? 'border-primary bg-primary/10 text-primary' : 'bg-background text-muted-foreground'}`}
                          >
                            {impact}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label className="mt-3 block">
                    <span className="text-xs font-medium text-muted-foreground">Field notes</span>
                    <Textarea
                      rows={3}
                      value={finding.notes}
                      onChange={event => updateFinding(finding.id, { notes: event.target.value })}
                      placeholder="What you saw, where it is, why it matters, and what the customer said."
                      className="mt-1"
                    />
                  </label>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <input type="checkbox" checked={finding.needsSpecialist} onChange={event => updateFinding(finding.id, { needsSpecialist: event.target.checked })} />
                      Specialist review recommended
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <input type="checkbox" checked={finding.createOpportunity} onChange={event => updateFinding(finding.id, { createOpportunity: event.target.checked })} />
                      Create opportunity after approval
                    </label>
                  </div>

                  <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Camera className="h-3.5 w-3.5" />
                        Photos
                      </p>
                      <label className="inline-flex cursor-pointer items-center rounded-md border bg-white px-3 py-1.5 text-xs font-medium hover:bg-muted">
                        <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                        Add photos
                        <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={event => attachPhotos(finding.id, event.target.files)} />
                      </label>
                    </div>
                    {finding.photos.length > 0 && (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {finding.photos.map(photo => (
                          <div key={photo.id} className="overflow-hidden rounded-lg border bg-white">
                            <img src={photo.previewUrl} alt={photo.name} className="h-24 w-full object-cover" />
                            <input
                              value={photo.caption}
                              onChange={event => {
                                const caption = event.target.value;
                                updateFinding(finding.id, {
                                  photos: finding.photos.map(p => p.id === photo.id ? { ...p, caption } : p),
                                });
                              }}
                              className="w-full border-t px-2 py-1 text-xs outline-none"
                              placeholder="Caption"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {finding.photos.length === 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">Add photos for proof, customer clarity, and better AI quality checks.</p>
                    )}
                  </div>

                  {finding.ai && (
                    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={priorityClass[finding.ai.priority]}>{finding.ai.priority}</Badge>
                        <Badge variant="outline">{finding.ai.timeframe}</Badge>
                        <Badge variant="secondary">{Math.round(finding.ai.confidence * 100)}% confidence</Badge>
                        {finding.approved && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Approved</Badge>}
                      </div>
                      <label className="mt-3 block">
                        <span className="text-xs font-medium text-muted-foreground">Customer-facing summary</span>
                        <Textarea
                          rows={3}
                          value={finding.ai.customerSummary}
                          onChange={event => updateFinding(finding.id, { ai: { ...finding.ai!, customerSummary: event.target.value } })}
                          className="mt-1 bg-white"
                        />
                      </label>
                      <label className="mt-3 block">
                        <span className="text-xs font-medium text-muted-foreground">Recommended action</span>
                        <Textarea
                          rows={2}
                          value={finding.ai.recommendedAction}
                          onChange={event => updateFinding(finding.id, { ai: { ...finding.ai!, recommendedAction: event.target.value } })}
                          className="mt-1 bg-white"
                        />
                      </label>
                      {finding.ai.qualityFlags.length > 0 && (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Quality flags
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-amber-800">
                            {finding.ai.qualityFlags.map(flag => <li key={flag}>- {flag}</li>)}
                          </ul>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => updateFinding(finding.id, { approved: true })}>
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateFinding(finding.id, { approved: false })}>
                          Mark needs edit
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                  <Bot className="h-3.5 w-3.5" />
                  AI prioritization review
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  AI ranks findings and drafts customer wording. Consultant approval remains required before finalizing.
                </p>
              </div>
              <Button onClick={runAi} disabled={baselineAi.isPending}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                {baselineAi.isPending ? 'Prioritizing...' : 'Prioritize findings'}
              </Button>
            </div>
            {baselineAi.data?.consultantReviewChecklist && (
              <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consultant audit checklist</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {baselineAi.data.consultantReviewChecklist.map(item => <li key={item}>- {item}</li>)}
                </ul>
              </div>
            )}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-muted-foreground">Baseline executive summary</span>
              <Textarea
                rows={4}
                value={consultantSummary}
                onChange={event => setConsultantSummary(event.target.value)}
                placeholder="AI will draft this after prioritization. Consultant can edit before finalizing."
                className="mt-1"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={finalize}>
                <ClipboardCheck className="mr-1.5 h-4 w-4" />
                Finalize baseline review
              </Button>
              <Button variant="outline" onClick={() => toast.info('Permanent baseline saving and PDF generation will be wired to the database in the next slice.')}>
                Generate report draft
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
