/**
 * DataMigrationPage — guided first-login data import wizard.
 * Steps: 1) Import Customers → 2) Import Jobs → 3) Verify & Done
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Upload, Users, Briefcase, BarChart3, Loader2, ChevronRight, Download, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// ── RFC 4180-compliant CSV parser (same as CustomersListPage) ─────────────────
function parseCsvFields(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      i++;
      let val = '';
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      fields.push(val.trim());
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i).trim()); break; }
      fields.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return fields;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvFields(lines[0]).map(h => h.replace(/^"|"$/g, '').toLowerCase().trim());
  return lines.slice(1).map(line => {
    const vals = parseCsvFields(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

// ── Column mappings ───────────────────────────────────────────────────────────
const CUSTOMER_COL_MAP: Record<string, string> = {
  'display name': 'displayName', 'name': 'displayName', 'full name': 'displayName',
  'first name': 'firstName', 'last name': 'lastName',
  'company': 'company', 'company name': 'company',
  'email': 'email', 'email address': 'email',
  'mobile': 'mobilePhone', 'mobile phone': 'mobilePhone', 'phone': 'mobilePhone', 'cell': 'mobilePhone',
  'home phone': 'homePhone', 'work phone': 'workPhone',
  'street': 'street', 'address': 'street', 'street address': 'street',
  'city': 'city', 'state': 'state', 'zip': 'zip', 'postal code': 'zip',
  'customer type': 'customerType', 'type': 'customerType',
  'lead source': 'leadSource', 'source': 'leadSource', 'how did you hear': 'leadSource',
  'notes': 'notes', 'tags': 'tags',
};

const JOB_COL_MAP: Record<string, string> = {
  // HouseCall Pro columns
  'job number': 'jobNumber', 'job #': 'jobNumber', 'job id': 'jobNumber',
  'customer': 'customerName', 'client': 'customerName', 'customer name': 'customerName',
  'job title': 'title', 'title': 'title', 'description': 'title', 'job description': 'title',
  'status': 'stage', 'job status': 'stage',
  'total': 'value', 'total price': 'value', 'amount': 'value', 'price': 'value',
  'scheduled': 'scheduledDate', 'scheduled date': 'scheduledDate', 'start date': 'scheduledDate',
  'end date': 'scheduledEndDate', 'completed': 'wonAt', 'completed date': 'wonAt',
  'notes': 'notes', 'work notes': 'notes',
  'type': 'area', 'record type': 'area',
};

// ── HouseCall Pro stage → HP stage mapping ────────────────────────────────────
function mapHcpStage(hcpStatus: string, area: string): string {
  const s = hcpStatus.toLowerCase().trim();
  if (area === 'job') {
    if (s.includes('complete') || s.includes('done') || s.includes('finished')) return 'Job Complete';
    if (s.includes('active') || s.includes('in progress') || s.includes('scheduled')) return 'Active Job';
    if (s.includes('cancel')) return 'Cancelled';
    return 'Active Job';
  }
  if (area === 'estimate') {
    if (s.includes('approved') || s.includes('won')) return 'Estimate Approved';
    if (s.includes('sent')) return 'Estimate Sent';
    return 'Estimate Draft';
  }
  return 'New Lead';
}

function mapArea(raw: string): 'lead' | 'estimate' | 'job' {
  const s = raw.toLowerCase().trim();
  if (s.includes('estimate') || s.includes('quote')) return 'estimate';
  if (s.includes('lead') || s.includes('request')) return 'lead';
  return 'job';
}

// ── Steps ─────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

interface DataMigrationPageProps {
  embedded?: boolean;
}

export default function DataMigrationPage({ embedded = false }: DataMigrationPageProps = {}) {
  const [step, setStep] = useState<Step>(1);

  // ── Step 1: Customers ──────────────────────────────────────────────────────
  const customerFileRef = useRef<HTMLInputElement>(null);
  const [customerRows, setCustomerRows] = useState<Record<string, string>[] | null>(null);
  const [customerResult, setCustomerResult] = useState<ImportResult | null>(null);
  const importCustomersMutation = trpc.customers.importCsv.useMutation({
    onSuccess: (res) => {
      setCustomerResult(res);
      toast.success(`Customers imported: ${res.created} created, ${res.updated} updated, ${res.skipped} skipped`);
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  function handleCustomerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const raw = parseCsv(text);
      // Remap headers
      const mapped = raw.map(row => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          const field = CUSTOMER_COL_MAP[k] ?? k;
          out[field] = v;
        }
        return out;
      });
      setCustomerRows(mapped);
    };
    reader.readAsText(file);
  }

  function handleImportCustomers() {
    if (!customerRows) return;
    importCustomersMutation.mutate({ rows: customerRows as any });
  }

  // ── Step 2: Jobs ──────────────────────────────────────────────────────────
  const jobFileRef = useRef<HTMLInputElement>(null);
  const [jobRows, setJobRows] = useState<Record<string, string>[] | null>(null);
  const [jobResult, setJobResult] = useState<ImportResult | null>(null);
  const importJobsMutation = trpc.opportunities.importCsv.useMutation({
    onSuccess: (res) => {
      setJobResult(res);
      toast.success(`Jobs imported: ${res.created} created, ${res.updated} updated, ${res.skipped} skipped`);
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  function handleJobFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const raw = parseCsv(text);
      const mapped = raw.map(row => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          const field = JOB_COL_MAP[k] ?? k;
          out[field] = v;
        }
        return out;
      });
      setJobRows(mapped);
    };
    reader.readAsText(file);
  }

  function handleImportJobs() {
    if (!jobRows) return;
    const rows = jobRows.map(r => {
      const area = r.area ? mapArea(r.area) : 'job';
      const stage = r.stage ? mapHcpStage(r.stage, area) : undefined;
      const value = r.value ? parseFloat(r.value.replace(/[$,]/g, '')) : undefined;
      return {
        customerName: r.customerName || undefined,
        area,
        stage,
        title: r.title || undefined,
        value: isNaN(value as number) ? undefined : value,
        jobNumber: r.jobNumber || undefined,
        notes: r.notes || undefined,
        scheduledDate: r.scheduledDate || undefined,
        scheduledEndDate: r.scheduledEndDate || undefined,
        wonAt: r.wonAt || undefined,
      };
    });
    importJobsMutation.mutate({ rows: rows as any });
  }

  // ── Template downloads ────────────────────────────────────────────────────
  function downloadCustomerTemplate() {
    const csv = 'Display Name,First Name,Last Name,Company,Email,Mobile,Street,City,State,Zip,Customer Type,Lead Source,Notes,Tags\n"John Smith","John","Smith","Smith Remodeling","john@example.com","360-555-0100","123 Main St","Vancouver","WA","98660","homeowner","Referral","Good customer","vip"';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'customers-import-template.csv';
    a.click();
  }

  function downloadJobTemplate() {
    const csv = 'Job Number,Customer,Job Title,Status,Total,Scheduled Date,End Date,Notes\n"JOB-001","John Smith","Exterior Paint","Completed","2500.00","2024-03-01","2024-03-03","Full exterior repaint"\n"JOB-002","Jane Doe","Deck Repair","Active","1800.00","2024-04-15","","Deck board replacement"';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'jobs-import-template.csv';
    a.click();
  }

  // ── Verify step data ──────────────────────────────────────────────────────
  const customerCountQuery = trpc.customers.list.useQuery({ limit: 1 }, { enabled: step === 3 });
  const jobCountQuery = trpc.opportunities.list.useQuery({ limit: 1 }, { enabled: step === 3 });

  const progress = step === 1 ? 33 : step === 2 ? 66 : 100;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start py-12 px-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Data Migration</h1>
          <p className="text-muted-foreground text-sm">Import your existing clients and job history to get started.</p>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className={step >= 1 ? 'text-primary font-medium' : ''}>1. Customers</span>
            <span className={step >= 2 ? 'text-primary font-medium' : ''}>2. Jobs</span>
            <span className={step >= 3 ? 'text-primary font-medium' : ''}>3. Verify</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* ── Step 1: Import Customers ── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Import Customers</CardTitle>
                  <CardDescription>Upload a CSV from HouseCall Pro, Google Contacts, or any CRM.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Supported columns (case-insensitive):</p>
                <p className="font-mono leading-relaxed">Display Name, First Name, Last Name, Company, Email, Mobile, Street, City, State, Zip, Customer Type, Lead Source, Notes, Tags</p>
                <p className="text-muted-foreground/70 mt-1">HouseCall Pro exports are supported automatically.</p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadCustomerTemplate} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Download template
                </Button>
                <Button variant="outline" size="sm" onClick={() => customerFileRef.current?.click()} className="gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Choose CSV file
                </Button>
                <input ref={customerFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCustomerFile} />
              </div>

              {customerRows && (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{customerRows.length} rows detected</span>
                    <Badge variant="secondary">Ready to import</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground max-h-28 overflow-y-auto space-y-0.5">
                    {customerRows.slice(0, 5).map((r, i) => (
                      <div key={i} className="truncate">
                        {r.displayName || `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || '(unnamed)'} — {r.email || 'no email'}
                      </div>
                    ))}
                    {customerRows.length > 5 && <div className="text-muted-foreground/60">…and {customerRows.length - 5} more</div>}
                  </div>
                </div>
              )}

              {customerResult && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{customerResult.created} created · {customerResult.updated} updated · {customerResult.skipped} skipped</span>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                  Skip this step
                </Button>
                <div className="flex gap-2">
                  {customerRows && !customerResult && (
                    <Button onClick={handleImportCustomers} disabled={importCustomersMutation.isPending} size="sm">
                      {importCustomersMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</> : 'Import Customers'}
                    </Button>
                  )}
                  {(customerResult || !customerRows) && (
                    <Button onClick={() => setStep(2)} size="sm" className="gap-1.5">
                      Next: Import Jobs <ChevronRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Import Jobs ── */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Import Jobs</CardTitle>
                  <CardDescription>Upload job history from HouseCall Pro or any job management system.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Supported columns (case-insensitive):</p>
                <p className="font-mono leading-relaxed">Job Number, Customer, Job Title, Status, Total, Scheduled Date, End Date, Notes</p>
                <div className="flex items-start gap-1.5 mt-2 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p>Jobs are matched to customers by name. Import customers first for best results.</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={downloadJobTemplate} className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Download template
                </Button>
                <Button variant="outline" size="sm" onClick={() => jobFileRef.current?.click()} className="gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Choose CSV file
                </Button>
                <input ref={jobFileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleJobFile} />
              </div>

              {jobRows && (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{jobRows.length} rows detected</span>
                    <Badge variant="secondary">Ready to import</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground max-h-28 overflow-y-auto space-y-0.5">
                    {jobRows.slice(0, 5).map((r, i) => (
                      <div key={i} className="truncate">
                        {r.title || r.jobNumber || '(untitled)'} — {r.customerName || 'unknown customer'}
                      </div>
                    ))}
                    {jobRows.length > 5 && <div className="text-muted-foreground/60">…and {jobRows.length - 5} more</div>}
                  </div>
                </div>
              )}

              {jobResult && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{jobResult.created} created · {jobResult.updated} updated · {jobResult.skipped} skipped</span>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
                  Skip this step
                </Button>
                <div className="flex gap-2">
                  {jobRows && !jobResult && (
                    <Button onClick={handleImportJobs} disabled={importJobsMutation.isPending} size="sm">
                      {importJobsMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing…</> : 'Import Jobs'}
                    </Button>
                  )}
                  {(jobResult || !jobRows) && (
                    <Button onClick={() => setStep(3)} size="sm" className="gap-1.5">
                      Next: Verify <ChevronRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Verify ── */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Verify Your Data</CardTitle>
                  <CardDescription>Review what was imported before going live.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {customerResult ? customerResult.created + customerResult.updated : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Customers imported</div>
                </div>
                <div className="border border-border rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {jobResult ? jobResult.created + jobResult.updated : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Jobs imported</div>
                </div>
              </div>

              {(customerResult?.skipped ?? 0) > 0 || (jobResult?.skipped ?? 0) > 0 ? (
                <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Some rows were skipped</p>
                    <p className="text-xs mt-0.5">
                      {(customerResult?.skipped ?? 0) > 0 && `${customerResult!.skipped} customers skipped (missing required fields). `}
                      {(jobResult?.skipped ?? 0) > 0 && `${jobResult!.skipped} jobs skipped (customer not found — import customers first).`}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Data migration complete. You can re-run imports at any time from the Customers page.</span>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => { window.location.href = '/'; }}
                  className="gap-1.5"
                >
                  Go to Dashboard <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Back navigation */}
        {step > 1 && (
          <div className="text-center">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
