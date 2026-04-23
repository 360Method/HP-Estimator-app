/**
 * BookingWizard — 5-step public booking form at /book
 * No login required. Mobile-first. HP brand colors.
 *
 * Step 1: Zip code check
 * Step 2: Service info (type, description, photos, timeline)
 * Step 3: Contact details
 * Step 4: Review & confirm
 * Step 5: Success → redirect to handypioneers.com/thankyou
 */
import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ChevronRight, ChevronLeft, Phone, MapPin, Camera, X, CheckCircle2, AlertCircle } from "lucide-react";

// ── Brand constants ────────────────────────────────────────────────────────────
const HP_PHONE = "(360) 334-4428";
const HP_GOLD = "#c8922a";
const SUCCESS_URL = "https://handypioneers.com/thankyou";
const MAX_PHOTOS = 5;
const MAX_DESCRIPTION = 2000;

// ── Types ──────────────────────────────────────────────────────────────────────
interface FormData {
  zip: string;
  serviceType: string;
  description: string;
  timeline: "ASAP" | "Within a week" | "Flexible" | "";
  photoUrls: string[];
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  smsConsent: boolean;
}

const INITIAL: FormData = {
  zip: "",
  serviceType: "General Inquiry / Custom Request",
  description: "",
  timeline: "",
  photoUrls: [],
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  street: "",
  unit: "",
  city: "",
  state: "WA",
  smsConsent: false,
};

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i + 1 === step ? 24 : 8,
            height: 8,
            background: i + 1 <= step ? HP_GOLD : "#d1d5db",
          }}
        />
      ))}
    </div>
  );
}

// ── Step 1: Zip code ───────────────────────────────────────────────────────────
function Step1Zip({
  form,
  setForm,
  onNext,
}: {
  form: FormData;
  setForm: (f: Partial<FormData>) => void;
  onNext: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [denied, setDenied] = useState(false);

  const checkZip = null; // trpc.booking.checkZip.useMutation

  const utils = trpc.useUtils();

  const handleCheck = async () => {
    const zip = form.zip.trim();
    if (zip.length < 5) {
      toast.error("Please enter a valid 5-digit zip code.");
      return;
    }
    setChecking(true);
    setDenied(false);
    try {
      const result = await utils.booking.checkZip.fetch({ zip });
      if (result.allowed) {
        onNext();
      } else {
        setDenied(true);
      }
    } catch {
      toast.error("Could not verify zip code. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-2xl font-bold text-gray-900">
          <MapPin className="w-6 h-6" style={{ color: HP_GOLD }} />
          Are we in your area?
        </div>
        <p className="text-gray-500 text-sm">Enter your zip code to check service availability.</p>
      </div>

      <div className="space-y-3">
        <Label htmlFor="zip" className="text-sm font-medium text-gray-700">
          Zip Code
        </Label>
        <Input
          id="zip"
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="98661"
          value={form.zip}
          onChange={(e) => {
            setForm({ zip: e.target.value });
            setDenied(false);
          }}
          onKeyDown={(e) => e.key === "Enter" && handleCheck()}
          className="text-lg text-center tracking-widest h-14"
        />
      </div>

      {denied && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-700 font-semibold">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            Outside our service area
          </div>
          <p className="text-sm text-red-600">
            We don't currently serve zip code <strong>{form.zip}</strong>. Give us a call — we may be able to help!
          </p>
          <a
            href={`tel:${HP_PHONE.replace(/\D/g, "")}`}
            className="flex items-center gap-2 text-sm font-semibold mt-1"
            style={{ color: HP_GOLD }}
          >
            <Phone className="w-4 h-4" />
            {HP_PHONE}
          </a>
        </div>
      )}

      <Button
        onClick={handleCheck}
        disabled={checking || form.zip.trim().length < 5}
        className="w-full h-12 text-base font-semibold"
        style={{ background: HP_GOLD, color: "#fff", border: "none" }}
      >
        {checking ? <Loader2 className="w-5 h-5 animate-spin" /> : "Check Availability"}
      </Button>
    </div>
  );
}

// ── Step 2: Service info ───────────────────────────────────────────────────────
function Step2Service({
  form,
  setForm,
  onNext,
  onBack,
  uploadPhoto,
  uploading,
}: {
  form: FormData;
  setForm: (f: Partial<FormData>) => void;
  onNext: () => void;
  onBack: () => void;
  uploadPhoto: (file: File) => Promise<string | null>;
  uploading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const remaining = MAX_PHOTOS - form.photoUrls.length;
    const toUpload = files.slice(0, remaining);
    for (const file of toUpload) {
      const url = await uploadPhoto(file);
      if (url) {
        setForm({ photoUrls: [...form.photoUrls, url] });
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const removePhoto = (idx: number) => {
    const updated = form.photoUrls.filter((_, i) => i !== idx);
    setForm({ photoUrls: updated });
  };

  const canProceed = form.timeline !== "";

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-gray-900">Tell us about your project</h2>
        <p className="text-gray-500 text-sm">Share details so we can prepare a great estimate.</p>
      </div>

      {/* Service type — fixed, single option */}
      <div className="space-y-1">
        <Label className="text-sm font-medium text-gray-700">Service Type</Label>
        <div
          className="rounded-lg border-2 px-4 py-3 text-sm font-medium"
          style={{ borderColor: HP_GOLD, color: "#1a1a1a", background: "#fffbf5" }}
        >
          General Inquiry / Custom Request
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <Label htmlFor="desc" className="text-sm font-medium text-gray-700">
          Project Description <span className="text-gray-400 font-normal">(optional)</span>
        </Label>
        <Textarea
          id="desc"
          placeholder="Describe what you need done — room dimensions, materials, access, anything helpful…"
          rows={4}
          maxLength={MAX_DESCRIPTION}
          value={form.description}
          onChange={(e) => setForm({ description: e.target.value })}
          className="resize-none"
        />
        <p className="text-xs text-gray-400 text-right">
          {form.description.length}/{MAX_DESCRIPTION}
        </p>
      </div>

      {/* Photos */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">
          Photos <span className="text-gray-400 font-normal">(up to {MAX_PHOTOS})</span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {form.photoUrls.map((url, idx) => (
            <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
              <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => removePhoto(idx)}
                className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
          {form.photoUrls.length < MAX_PHOTOS && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 transition-colors"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  <span className="text-xs mt-1">Add</span>
                </>
              )}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        <Label className="text-sm font-medium text-gray-700">
          Preferred Timeline <span className="text-red-500">*</span>
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {(["ASAP", "Within a week", "Flexible"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setForm({ timeline: opt })}
              className="rounded-lg border-2 px-2 py-3 text-sm font-medium transition-all"
              style={{
                borderColor: form.timeline === opt ? HP_GOLD : "#e5e7eb",
                background: form.timeline === opt ? "#fffbf5" : "#fff",
                color: form.timeline === opt ? "#1a1a1a" : "#6b7280",
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-11">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 h-11 font-semibold"
          style={{ background: HP_GOLD, color: "#fff", border: "none" }}
        >
          Continue <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 3: Contact details ────────────────────────────────────────────────────
function Step3Contact({
  form,
  setForm,
  onNext,
  onBack,
}: {
  form: FormData;
  setForm: (f: Partial<FormData>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const canProceed =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.phone.trim().length >= 7 &&
    form.email.trim().includes("@") &&
    form.street.trim() &&
    form.city.trim();

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-gray-900">Your contact info</h2>
        <p className="text-gray-500 text-sm">We'll use this to send your estimate and schedule your visit.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="fn" className="text-sm font-medium text-gray-700">
            First Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="fn"
            placeholder="Jane"
            value={form.firstName}
            onChange={(e) => setForm({ firstName: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ln" className="text-sm font-medium text-gray-700">
            Last Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="ln"
            placeholder="Smith"
            value={form.lastName}
            onChange={(e) => setForm({ lastName: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
          Phone <span className="text-red-500">*</span>
        </Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          placeholder="(360) 555-0100"
          value={form.phone}
          onChange={(e) => setForm({ phone: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="email" className="text-sm font-medium text-gray-700">
          Email <span className="text-red-500">*</span>
        </Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          placeholder="jane@example.com"
          value={form.email}
          onChange={(e) => setForm({ email: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="street" className="text-sm font-medium text-gray-700">
          Service Address <span className="text-red-500">*</span>
        </Label>
        <Input
          id="street"
          placeholder="123 Main St"
          value={form.street}
          onChange={(e) => setForm({ street: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1 space-y-1">
          <Label htmlFor="unit" className="text-sm font-medium text-gray-700">Unit</Label>
          <Input
            id="unit"
            placeholder="Apt 2"
            value={form.unit}
            onChange={(e) => setForm({ unit: e.target.value })}
          />
        </div>
        <div className="col-span-1 space-y-1">
          <Label htmlFor="city" className="text-sm font-medium text-gray-700">
            City <span className="text-red-500">*</span>
          </Label>
          <Input
            id="city"
            placeholder="Vancouver"
            value={form.city}
            onChange={(e) => setForm({ city: e.target.value })}
          />
        </div>
        <div className="col-span-1 space-y-1">
          <Label htmlFor="state" className="text-sm font-medium text-gray-700">State</Label>
          <Input
            id="state"
            placeholder="WA"
            maxLength={2}
            value={form.state}
            onChange={(e) => setForm({ state: e.target.value.toUpperCase() })}
          />
        </div>
      </div>

      {/* Zip is pre-filled from step 1 */}
      <div className="space-y-1">
        <Label className="text-sm font-medium text-gray-700">Zip Code</Label>
        <Input value={form.zip} readOnly className="bg-gray-50 text-gray-500" />
      </div>

      {/* SMS consent */}
      <div className="flex items-start gap-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
        <Checkbox
          id="sms"
          checked={form.smsConsent}
          onCheckedChange={(v) => setForm({ smsConsent: !!v })}
          className="mt-0.5"
        />
        <label htmlFor="sms" className="text-xs text-gray-600 leading-relaxed cursor-pointer">
          I consent to receive SMS text messages from Handy Pioneers regarding my service request, scheduling, and
          updates. Message & data rates may apply. Reply STOP to opt out.
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-11">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 h-11 font-semibold"
          style={{ background: HP_GOLD, color: "#fff", border: "none" }}
        >
          Review <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ── Step 4: Review ─────────────────────────────────────────────────────────────
function Step4Review({
  form,
  onSubmit,
  onBack,
  submitting,
}: {
  form: FormData;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
}) {
  const Row = ({ label, value }: { label: string; value: string }) =>
    value ? (
      <div className="flex justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
        <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
        <span className="text-sm text-gray-900 text-right">{value}</span>
      </div>
    ) : null;

  const address = [form.street, form.unit, form.city, form.state, form.zip].filter(Boolean).join(", ");

  return (
    <div className="space-y-5">
      <div className="text-center space-y-1">
        <h2 className="text-xl font-bold text-gray-900">Review your request</h2>
        <p className="text-gray-500 text-sm">Confirm everything looks right before submitting.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Project</span>
        </div>
        <div className="px-4">
          <Row label="Service" value={form.serviceType} />
          <Row label="Timeline" value={form.timeline} />
          {form.description && (
            <div className="py-2 border-b border-gray-100">
              <p className="text-sm text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{form.description}</p>
            </div>
          )}
          {form.photoUrls.length > 0 && (
            <div className="py-2">
              <p className="text-sm text-gray-500 mb-2">Photos ({form.photoUrls.length})</p>
              <div className="flex flex-wrap gap-2">
                {form.photoUrls.map((url, i) => (
                  <img key={i} src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Contact</span>
        </div>
        <div className="px-4">
          <Row label="Name" value={`${form.firstName} ${form.lastName}`} />
          <Row label="Phone" value={form.phone} />
          <Row label="Email" value={form.email} />
          <Row label="Address" value={address} />
          <Row label="SMS Consent" value={form.smsConsent ? "Yes" : "No"} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onBack} className="flex-1 h-11" disabled={submitting}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <Button
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 h-11 font-semibold"
          style={{ background: HP_GOLD, color: "#fff", border: "none" }}
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting…</>
          ) : (
            <>Submit Request <ChevronRight className="w-4 h-4 ml-1" /></>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Step 5: Success ────────────────────────────────────────────────────────────
function Step5Success() {
  // Redirect after a brief moment
  useState(() => {
    const t = setTimeout(() => {
      window.location.href = SUCCESS_URL;
    }, 2500);
    return () => clearTimeout(t);
  });

  return (
    <div className="text-center space-y-5 py-6">
      <div
        className="mx-auto w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: "#f0fdf4" }}
      >
        <CheckCircle2 className="w-10 h-10 text-green-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">Request Submitted!</h2>
        <p className="text-gray-500 text-sm max-w-xs mx-auto">
          We received your request and will be in touch soon. Redirecting you now…
        </p>
      </div>
      <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" />
    </div>
  );
}

// ── Main wizard ────────────────────────────────────────────────────────────────
export default function BookingWizard() {
  const [step, setStep] = useState(1);
  const [form, setFormState] = useState<FormData>(INITIAL);
  const [uploading, setUploading] = useState(false);

  const setForm = useCallback((partial: Partial<FormData>) => {
    setFormState((prev) => ({ ...prev, ...partial }));
  }, []);

  const submitMutation = trpc.booking.submit.useMutation({
    onSuccess: () => {
      setStep(5);
    },
    onError: (err) => {
      toast.error(err.message || "Submission failed. Please try again.");
    },
  });

  // Photo upload via tRPC uploads.uploadBookingPhoto (base64)
  const uploadBookingPhoto = trpc.uploads.uploadBookingPhoto.useMutation();

  const uploadPhoto = useCallback(
    async (file: File): Promise<string | null> => {
      if (file.size > 16 * 1024 * 1024) {
        toast.error("Photo must be under 16 MB.");
        return null;
      }
      setUploading(true);
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const { url } = await uploadBookingPhoto.mutateAsync({
          filename: file.name,
          mimeType: file.type,
          base64,
        });
        return url;
      } catch (e) {
        toast.error("Photo upload failed. Please try again.");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [uploadBookingPhoto],
  );

  const handleSubmit = () => {
    if (form.timeline === "") {
      toast.error("Please select a timeline.");
      return;
    }
    submitMutation.mutate({
      zip: form.zip,
      serviceType: form.serviceType,
      description: form.description,
      timeline: form.timeline as "ASAP" | "Within a week" | "Flexible",
      photoUrls: form.photoUrls,
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      email: form.email,
      street: form.street,
      unit: form.unit,
      city: form.city,
      state: form.state,
      smsConsent: form.smsConsent,
    });
  };

  const TOTAL_STEPS = 4; // step 5 is success, not counted in dots

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #1a2e1a 0%, #2d4a2d 100%)" }}>
      {/* Header */}
      <header className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="https://handypioneers.com/wp-content/uploads/2023/06/HP-Logo-Transparent.png"
            alt="Handy Pioneers"
            className="h-9 w-auto"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <span className="text-white font-bold text-lg hidden sm:block">Handy Pioneers</span>
        </div>
        <a
          href={`tel:${HP_PHONE.replace(/\D/g, "")}`}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full"
          style={{ background: "rgba(200,146,42,0.15)", color: HP_GOLD, border: `1px solid ${HP_GOLD}` }}
        >
          <Phone className="w-3.5 h-3.5" />
          {HP_PHONE}
        </a>
      </header>

      {/* Card */}
      <main className="flex-1 flex items-start justify-center px-4 py-6">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
          {step < 5 && <StepDots step={step} total={TOTAL_STEPS} />}

          {step === 1 && <Step1Zip form={form} setForm={setForm} onNext={() => setStep(2)} />}
          {step === 2 && (
            <Step2Service
              form={form}
              setForm={setForm}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
              uploadPhoto={uploadPhoto}
              uploading={uploading}
            />
          )}
          {step === 3 && (
            <Step3Contact form={form} setForm={setForm} onNext={() => setStep(4)} onBack={() => setStep(2)} />
          )}
          {step === 4 && (
            <Step4Review
              form={form}
              onSubmit={handleSubmit}
              onBack={() => setStep(3)}
              submitting={submitMutation.isPending}
            />
          )}
          {step === 5 && <Step5Success />}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-white/40">
        © {new Date().getFullYear()} Handy Pioneers · Vancouver, WA
      </footer>
    </div>
  );
}
