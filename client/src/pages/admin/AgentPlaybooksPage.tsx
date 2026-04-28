// ============================================================
// AgentPlaybooksPage — operator-editable cadence definitions.
// Marcin tunes timing + voice prompts here without a redeploy.
// ============================================================

import { useEffect, useState } from "react";
import { Loader2, Save, Trash2, Plus, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Step {
  key: string;
  channel: "sms" | "email";
  delayMinutes: number;
  label: string;
  voicePrompt: string;
}

interface VoiceRules {
  bannedWords: string[];
  tone: string;
  formality: string;
  brand?: string;
}

export default function AgentPlaybooksPage() {
  const list = trpc.nurturerPlaybooks.list.useQuery();
  const [activeKey, setActiveKey] = useState<string>("roadmap_followup");

  useEffect(() => {
    if (list.data && list.data.length > 0 && !list.data.find((p) => p.key === activeKey)) {
      setActiveKey(list.data[0].key);
    }
  }, [list.data, activeKey]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Lead Nurturer</p>
        <h1 className="mt-2 text-3xl font-semibold text-stone-900">Playbooks</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Each playbook is a cadence of touchpoints. Edit timings, voice prompts, and banned words. Changes apply on the next scheduled draft generation — no redeploy.
        </p>
      </header>

      {list.isLoading && <Spinner />}
      {!list.isLoading && (!list.data || list.data.length === 0) && (
        <p className="text-sm text-stone-500">No playbooks yet. The default <code>roadmap_followup</code> seeds at first boot.</p>
      )}

      {list.data && list.data.length > 0 && (
        <div className="grid grid-cols-[200px_1fr] gap-6">
          <nav className="space-y-1">
            {list.data.map((p) => (
              <button
                key={p.key}
                onClick={() => setActiveKey(p.key)}
                className={`block w-full rounded px-3 py-2 text-left text-sm ${
                  activeKey === p.key ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                {p.displayName}
                <span className="block text-[10px] uppercase tracking-wide opacity-70">{p.key}</span>
              </button>
            ))}
          </nav>
          <PlaybookEditor key={activeKey} playbookKey={activeKey} />
        </div>
      )}
    </div>
  );
}

function PlaybookEditor({ playbookKey }: { playbookKey: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.nurturerPlaybooks.get.useQuery({ key: playbookKey });
  const update = trpc.nurturerPlaybooks.update.useMutation({
    onSuccess: () => {
      toast.success("Playbook saved");
      utils.nurturerPlaybooks.get.invalidate({ key: playbookKey });
      utils.nurturerPlaybooks.list.invalidate();
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });

  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [steps, setSteps] = useState<Step[]>([]);
  const [voiceRules, setVoiceRules] = useState<VoiceRules>({
    bannedWords: [],
    tone: "",
    formality: "",
  });

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.displayName);
    setDescription(data.description ?? "");
    setEnabled(data.enabled);
    try {
      const parsed = JSON.parse(data.stepsJson);
      if (Array.isArray(parsed)) setSteps(parsed);
    } catch {
      setSteps([]);
    }
    if (data.voiceRulesJson) {
      try {
        setVoiceRules(JSON.parse(data.voiceRulesJson));
      } catch {
        // keep defaults
      }
    }
  }, [data]);

  if (isLoading || !data) return <Spinner />;

  const save = () => {
    update.mutate({
      key: playbookKey,
      displayName,
      description,
      enabled,
      steps,
      voiceRules,
    });
  };

  const addStep = () => {
    setSteps((s) => [
      ...s,
      {
        key: `step_${s.length + 1}`,
        channel: "email",
        delayMinutes: 24 * 60,
        label: "New step",
        voicePrompt: "",
      },
    ]);
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
            Enabled
          </label>
        </div>
      </div>

      <div className="mt-4">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-stone-500">Steps</h2>
      <ul className="mt-3 space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="rounded border border-stone-200 p-4">
            <div className="grid grid-cols-[1fr_140px_140px_36px] gap-3">
              <div>
                <Label>Label</Label>
                <Input
                  value={step.label}
                  onChange={(e) => updateStep(setSteps, i, { label: e.target.value })}
                />
              </div>
              <div>
                <Label>Key</Label>
                <Input
                  value={step.key}
                  onChange={(e) => updateStep(setSteps, i, { key: e.target.value })}
                />
              </div>
              <div>
                <Label>Channel</Label>
                <select
                  value={step.channel}
                  onChange={(e) => updateStep(setSteps, i, { channel: e.target.value as "sms" | "email" })}
                  className="h-9 w-full rounded border border-stone-300 bg-white px-2 text-sm"
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <button
                aria-label="Remove step"
                onClick={() => setSteps((s) => s.filter((_, j) => j !== i))}
                className="mt-6 flex h-9 w-9 items-center justify-center rounded text-stone-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label>Fires after</Label>
                <DelayInput
                  minutes={step.delayMinutes}
                  onChange={(m) => updateStep(setSteps, i, { delayMinutes: m })}
                />
              </div>
              <div className="flex items-end text-xs text-stone-500">
                {step.channel === "email" ? <Mail className="mr-1 h-3 w-3" /> : <MessageSquare className="mr-1 h-3 w-3" />}
                Sent {humanDelay(step.delayMinutes)} after Roadmap delivery
              </div>
            </div>
            <div className="mt-3">
              <Label>Voice prompt (Claude reads this when generating)</Label>
              <Textarea
                rows={3}
                value={step.voicePrompt}
                onChange={(e) => updateStep(setSteps, i, { voicePrompt: e.target.value })}
              />
            </div>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" className="mt-3" onClick={addStep}>
        <Plus className="mr-1 h-3 w-3" />
        Add step
      </Button>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-stone-500">Voice rules</h2>
      <div className="mt-3 grid gap-4">
        <div>
          <Label>Banned words (comma-separated)</Label>
          <Input
            value={voiceRules.bannedWords.join(", ")}
            onChange={(e) =>
              setVoiceRules((v) => ({
                ...v,
                bannedWords: e.target.value
                  .split(",")
                  .map((w) => w.trim())
                  .filter(Boolean),
              }))
            }
          />
        </div>
        <div>
          <Label>Tone</Label>
          <Input value={voiceRules.tone} onChange={(e) => setVoiceRules((v) => ({ ...v, tone: e.target.value }))} />
        </div>
        <div>
          <Label>Formality</Label>
          <Textarea
            rows={2}
            value={voiceRules.formality}
            onChange={(e) => setVoiceRules((v) => ({ ...v, formality: e.target.value }))}
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={save} disabled={update.isPending}>
          <Save className="mr-1 h-3 w-3" />
          {update.isPending ? "Saving…" : "Save playbook"}
        </Button>
      </div>
    </div>
  );
}

function updateStep(setSteps: React.Dispatch<React.SetStateAction<Step[]>>, idx: number, patch: Partial<Step>) {
  setSteps((s) => s.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
}

function DelayInput({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const [value, unit] = splitDelay(minutes);
  return (
    <div className="flex gap-2">
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(joinDelay(Number(e.target.value), unit))}
        className="flex-1"
      />
      <select
        value={unit}
        onChange={(e) => onChange(joinDelay(value, e.target.value as "m" | "h" | "d"))}
        className="rounded border border-stone-300 bg-white px-2 text-sm"
      >
        <option value="m">min</option>
        <option value="h">hr</option>
        <option value="d">days</option>
      </select>
    </div>
  );
}

function splitDelay(minutes: number): [number, "m" | "h" | "d"] {
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) return [minutes / (24 * 60), "d"];
  if (minutes >= 60 && minutes % 60 === 0) return [minutes / 60, "h"];
  return [minutes, "m"];
}

function joinDelay(value: number, unit: "m" | "h" | "d"): number {
  if (unit === "d") return value * 24 * 60;
  if (unit === "h") return value * 60;
  return value;
}

function humanDelay(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (24 * 60))}d`;
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 py-12 text-stone-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}
