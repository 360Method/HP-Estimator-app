/**
 * PortalRequest — Customer-facing "Book online / Request service" form.
 * Submits a service request to HP team, who then creates a lead.
 * Mobile-first, HP brand colors.
 */
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle,
  ChevronLeft,
  Calendar,
  Clock,
  Zap,
  CalendarDays,
  Camera,
  X,
  ImagePlus,
} from "lucide-react";

type Timeline = "asap" | "within_week" | "flexible";

const TIMELINE_OPTIONS: { value: Timeline; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: "asap", label: "As Soon As Possible", desc: "Urgent — I need this done quickly", icon: <Zap className="w-5 h-5" /> },
  { value: "within_week", label: "Within the Week", desc: "Flexible but within 7 days", icon: <Clock className="w-5 h-5" /> },
  { value: "flexible", label: "I'm Flexible", desc: "No rush — schedule at your convenience", icon: <CalendarDays className="w-5 h-5" /> },
];

const MAX_PHOTOS = 8;
const MAX_FILE_MB = 10;

export default function PortalRequest() {
  const [, navigate] = useLocation();
  const [description, setDescription] = useState("");
  const [timeline, setTimeline] = useState<Timeline>("flexible");
  const [address, setAddress] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Photo state
  const [photos, setPhotos] = useState<{ dataUrl: string; mimeType: string; name: string }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const meQuery = trpc.portal.me.useQuery();
  const customer = meQuery.data?.customer;

  const uploadPhotoMutation = trpc.portal.uploadPhoto.useMutation();

  const submitMutation = trpc.portal.submitServiceRequest.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const remaining = MAX_PHOTOS - photos.length;
    const toProcess = files.slice(0, remaining);

    toProcess.forEach((file) => {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${file.name} is too large (max ${MAX_FILE_MB}MB)`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setPhotos((prev) => [
          ...prev,
          { dataUrl, mimeType: file.type as any, name: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 10) {
      toast.error("Please describe the work needed (at least 10 characters).");
      return;
    }

    let photoUrls: string[] = [];

    if (photos.length > 0) {
      setUploadingPhotos(true);
      try {
        const results = await Promise.all(
          photos.map((p) =>
            uploadPhotoMutation.mutateAsync({ dataUrl: p.dataUrl, mimeType: p.mimeType as any })
          )
        );
        photoUrls = results.map((r) => r.url);
      } catch (err: any) {
        toast.error("Photo upload failed: " + (err?.message ?? "Unknown error"));
        setUploadingPhotos(false);
        return;
      }
      setUploadingPhotos(false);
    }

    submitMutation.mutate({
      description: description.trim(),
      timeline,
      address: address.trim() || undefined,
      photoUrls: photoUrls.length ? photoUrls : undefined,
    });
  };

  const isPending = uploadingPhotos || submitMutation.isPending;

  if (submitted) {
    return (
      <PortalLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Request Submitted!</h2>
          <p className="text-gray-500 mb-6 max-w-sm">
            We've received your request and will be in touch within 24 hours to schedule your appointment.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => navigate("/portal/home")}
              className="bg-[#c8922a] hover:bg-[#b07d24] text-white"
            >
              Back to Home
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/portal/messages")}
            >
              Message Us
            </Button>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate("/portal/home")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Home
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Request Service</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tell us what you need and we'll reach out to schedule an appointment.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              What work do you need done? <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a] resize-none"
              rows={5}
              placeholder="Describe the work you need. For example: 'Bathroom remodel — replace vanity, re-tile shower, and update lighting. About 80 sq ft.'"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/2000</p>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-gray-500" />
                Photos
                <span className="text-xs font-normal text-gray-400">(optional, up to {MAX_PHOTOS})</span>
              </label>
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#c8922a] hover:text-[#b07d24] transition-colors"
                >
                  <ImagePlus className="w-4 h-4" />
                  Add Photo
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            {photos.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg p-6 flex flex-col items-center gap-2 text-gray-400 hover:border-[#c8922a] hover:text-[#c8922a] transition-colors"
              >
                <Camera className="w-8 h-8" />
                <span className="text-sm">Tap to add photos</span>
                <span className="text-xs">JPEG, PNG, WebP — max {MAX_FILE_MB}MB each</span>
              </button>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {photos.map((photo, idx) => (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group">
                    <img
                      src={photo.dataUrl}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-[#c8922a] hover:text-[#c8922a] transition-colors"
                  >
                    <ImagePlus className="w-6 h-6" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              <Calendar className="w-4 h-4 inline mr-1.5 text-gray-500" />
              When do you need this done?
            </label>
            <div className="space-y-2">
              {TIMELINE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTimeline(opt.value)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                    timeline === opt.value
                      ? "border-[#c8922a] bg-amber-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      timeline === opt.value ? "bg-[#c8922a] text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {opt.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Address */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Service Address
              {customer?.address && (
                <span className="ml-2 text-xs font-normal text-gray-400">(leave blank to use your profile address)</span>
              )}
            </label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
              placeholder={customer?.address ?? "123 Main St, Vancouver, WA 98683"}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            {customer?.address && !address && (
              <p className="text-xs text-gray-400 mt-1">
                Will use: <span className="text-gray-600">{customer.address}</span>
              </p>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isPending || description.trim().length < 10}
            className="w-full bg-[#c8922a] hover:bg-[#b07d24] text-white font-semibold py-3 text-base"
          >
            {uploadingPhotos ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading photos...
              </>
            ) : submitMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Request"
            )}
          </Button>

          <p className="text-xs text-center text-gray-400">
            We'll contact you within 1 business day to confirm your appointment.
          </p>
        </form>
      </div>
    </PortalLayout>
  );
}
