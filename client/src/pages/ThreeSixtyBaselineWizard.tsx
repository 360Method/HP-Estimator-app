/**
 * ThreeSixtyBaselineWizard
 * Step-through form for documenting all 8 home systems for a 360° member.
 * Each step covers one system: brand/model, install year, condition, notes,
 * last service date, lifespan estimate, replacement cost, and photos.
 */
import { useState, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Upload,
  X,
  Thermometer,
  Home,
  Droplets,
  Zap,
  Building2,
  PaintBucket,
  LayoutDashboard,
  Microwave,
} from 'lucide-react';
import { toast } from 'sonner';

const SYSTEMS = [
  { key: 'hvac', label: 'HVAC', icon: Thermometer, description: 'Heating, ventilation & air conditioning' },
  { key: 'roof', label: 'Roof', icon: Home, description: 'Roofing materials, gutters & drainage' },
  { key: 'plumbing', label: 'Plumbing', icon: Droplets, description: 'Water supply, drains & fixtures' },
  { key: 'electrical', label: 'Electrical', icon: Zap, description: 'Panel, wiring & outlets' },
  { key: 'foundation', label: 'Foundation', icon: Building2, description: 'Structural foundation & basement' },
  { key: 'exterior_siding', label: 'Exterior & Siding', icon: PaintBucket, description: 'Siding, windows, doors & paint' },
  { key: 'interior', label: 'Interior', icon: LayoutDashboard, description: 'Floors, walls, ceilings & insulation' },
  { key: 'appliances', label: 'Appliances', icon: Microwave, description: 'Major appliances & water heater' },
] as const;

type SystemKey = typeof SYSTEMS[number]['key'];

interface SystemFormData {
  id?: number;
  brandModel: string;
  installYear: string;
  condition: 'good' | 'fair' | 'poor' | 'critical';
  conditionNotes: string;
  lastServiceDate: string;
  nextServiceDate: string;
  estimatedLifespanYears: string;
  replacementCostEstimate: string;
  photoUrls: string[];
}

const defaultForm = (): SystemFormData => ({
  brandModel: '',
  installYear: '',
  condition: 'good',
  conditionNotes: '',
  lastServiceDate: '',
  nextServiceDate: '',
  estimatedLifespanYears: '',
  replacementCostEstimate: '',
  photoUrls: [],
});

const CONDITION_COLORS: Record<string, string> = {
  good: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  fair: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  poor: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
};

interface Props {
  membershipId: number;
  customerId: string;
  onBack: () => void;
  onComplete: () => void;
}

export default function ThreeSixtyBaselineWizard({ membershipId, customerId, onBack, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [forms, setForms] = useState<Record<SystemKey, SystemFormData>>(
    Object.fromEntries(SYSTEMS.map((s) => [s.key, defaultForm()])) as Record<SystemKey, SystemFormData>
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: existing } = trpc.threeSixty.propertySystems.list.useQuery({ membershipId });

  // Pre-fill forms from existing data
  const [prefilled, setPrefilled] = useState(false);
  if (existing && !prefilled) {
    const updated = { ...forms };
    for (const sys of existing) {
      const key = sys.systemType as SystemKey;
      updated[key] = {
        id: sys.id,
        brandModel: sys.brandModel ?? '',
        installYear: sys.installYear?.toString() ?? '',
        condition: sys.condition,
        conditionNotes: sys.conditionNotes ?? '',
        lastServiceDate: sys.lastServiceDate ?? '',
        nextServiceDate: sys.nextServiceDate ?? '',
        estimatedLifespanYears: sys.estimatedLifespanYears?.toString() ?? '',
        replacementCostEstimate: sys.replacementCostEstimate?.toString() ?? '',
        photoUrls: sys.photoUrls ? JSON.parse(sys.photoUrls) : [],
      };
    }
    setForms(updated);
    setPrefilled(true);
  }

  const upsert = trpc.threeSixty.propertySystems.upsert.useMutation();
  const uploadPhoto = trpc.threeSixty.propertySystems.uploadPhoto.useMutation();

  const currentSystem = SYSTEMS[step];
  const currentForm = forms[currentSystem.key];

  function updateField<K extends keyof SystemFormData>(field: K, value: SystemFormData[K]) {
    setForms((prev) => ({
      ...prev,
      [currentSystem.key]: { ...prev[currentSystem.key], [field]: value },
    }));
  }

  async function saveCurrentStep() {
    const form = forms[currentSystem.key];
    try {
      await upsert.mutateAsync({
        id: form.id,
        membershipId,
        customerId,
        systemType: currentSystem.key,
        brandModel: form.brandModel || undefined,
        installYear: form.installYear ? parseInt(form.installYear) : undefined,
        condition: form.condition,
        conditionNotes: form.conditionNotes || undefined,
        lastServiceDate: form.lastServiceDate || undefined,
        nextServiceDate: form.nextServiceDate || undefined,
        estimatedLifespanYears: form.estimatedLifespanYears
          ? parseInt(form.estimatedLifespanYears)
          : undefined,
        replacementCostEstimate: form.replacementCostEstimate || undefined,
        photoUrls: form.photoUrls,
      });
      utils.threeSixty.propertySystems.list.invalidate({ membershipId });
    } catch {
      toast.error('Failed to save system data');
      return false;
    }
    return true;
  }

  async function handleNext() {
    const ok = await saveCurrentStep();
    if (!ok) return;
    if (step < SYSTEMS.length - 1) {
      setStep((s) => s + 1);
    } else {
      toast.success('Property baseline documented!');
      onComplete();
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo must be under 5 MB');
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const result = await uploadPhoto.mutateAsync({
          membershipId,
          systemType: currentSystem.key,
          dataUrl,
          fileName: file.name,
        });
        updateField('photoUrls', [...currentForm.photoUrls, result.url]);
        toast.success('Photo uploaded');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Photo upload failed');
      setUploading(false);
    }
  }

  function removePhoto(url: string) {
    updateField('photoUrls', currentForm.photoUrls.filter((u) => u !== url));
  }

  const Icon = currentSystem.icon;
  const progress = ((step + 1) / SYSTEMS.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">Property Baseline Wizard</div>
          <div className="text-xs text-muted-foreground">
            Step {step + 1} of {SYSTEMS.length}
          </div>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {Math.round(progress)}%
        </Badge>
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="h-1 rounded-none" />

      {/* Step nav pills */}
      <div className="px-4 py-3 flex gap-1.5 overflow-x-auto no-scrollbar">
        {SYSTEMS.map((sys, i) => {
          const hasData = forms[sys.key].brandModel || forms[sys.key].conditionNotes;
          return (
            <button
              key={sys.key}
              onClick={() => setStep(i)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                i === step
                  ? 'bg-primary text-primary-foreground border-primary'
                  : hasData
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-muted text-muted-foreground border-border'
              }`}
            >
              {sys.label}
            </button>
          );
        })}
      </div>

      {/* Form */}
      <div className="px-4 pb-32">
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            {/* System header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold">{currentSystem.label}</h2>
                <p className="text-xs text-muted-foreground">{currentSystem.description}</p>
              </div>
            </div>

            {/* Condition selector */}
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Current Condition
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['good', 'fair', 'poor', 'critical'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => updateField('condition', c)}
                    className={`py-2 px-3 rounded-lg border text-sm font-medium capitalize transition-all ${
                      currentForm.condition === c
                        ? CONDITION_COLORS[c] + ' ring-2 ring-offset-1 ring-current'
                        : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    {c === 'good' ? '✓ Good' : c === 'fair' ? '⚠ Fair' : c === 'poor' ? '⚡ Poor' : '🚨 Critical'}
                  </button>
                ))}
              </div>
            </div>

            {/* Brand / Model */}
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Brand / Model
              </label>
              <Input
                placeholder="e.g. Carrier 2-ton, Owens Corning Duration…"
                value={currentForm.brandModel}
                onChange={(e) => updateField('brandModel', e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Install year + lifespan */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Install Year
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 2015"
                  value={currentForm.installYear}
                  onChange={(e) => updateField('installYear', e.target.value)}
                  className="text-sm"
                  min={1900}
                  max={new Date().getFullYear()}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Est. Lifespan (yrs)
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 20"
                  value={currentForm.estimatedLifespanYears}
                  onChange={(e) => updateField('estimatedLifespanYears', e.target.value)}
                  className="text-sm"
                  min={1}
                  max={100}
                />
              </div>
            </div>

            {/* Service dates */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Last Service Date
                </label>
                <Input
                  type="date"
                  value={currentForm.lastServiceDate}
                  onChange={(e) => updateField('lastServiceDate', e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Next Service Due
                </label>
                <Input
                  type="date"
                  value={currentForm.nextServiceDate}
                  onChange={(e) => updateField('nextServiceDate', e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            {/* Replacement cost */}
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Est. Replacement Cost ($)
              </label>
              <Input
                type="number"
                placeholder="e.g. 8500"
                value={currentForm.replacementCostEstimate}
                onChange={(e) => updateField('replacementCostEstimate', e.target.value)}
                className="text-sm"
                min={0}
              />
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Condition Notes
              </label>
              <Textarea
                placeholder="Describe current condition, known issues, recent repairs…"
                value={currentForm.conditionNotes}
                onChange={(e) => updateField('conditionNotes', e.target.value)}
                className="text-sm resize-none"
                rows={3}
              />
            </div>

            {/* Photos */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Photos
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {currentForm.photoUrls.map((url) => (
                  <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                    <img src={url} alt="system" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(url)}
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Upload className="w-4 h-4 mb-0.5" />
                  <span className="text-[9px]">{uploading ? '…' : 'Add'}</span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fixed bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t px-4 py-3 flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => step > 0 ? setStep((s) => s - 1) : onBack()}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        <Button
          className="flex-1"
          onClick={handleNext}
          disabled={upsert.isPending}
        >
          {step === SYSTEMS.length - 1 ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-1" />
              {upsert.isPending ? 'Saving…' : 'Finish'}
            </>
          ) : (
            <>
              {upsert.isPending ? 'Saving…' : 'Next'}
              <ChevronRight className="w-4 h-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
