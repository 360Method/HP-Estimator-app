import { useState } from "react";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ClipboardList, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

function formatDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function formatTime(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function PortalAppointments() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const { data, isLoading } = trpc.portal.getAppointments.useQuery();

  // Reschedule request state
  const [rescheduleAppt, setRescheduleAppt] = useState<null | { id: number; title: string; scheduledAt: Date }>(null);
  const [rescheduleNote, setRescheduleNote] = useState("");
  const sendMessageMutation = trpc.portal.sendMessage.useMutation({
    onSuccess: () => {
      toast.success("Reschedule request sent. We'll be in touch shortly.");
      setRescheduleAppt(null);
      setRescheduleNote("");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRescheduleSubmit = () => {
    if (!rescheduleAppt) return;
    const apptDate = formatDate(rescheduleAppt.scheduledAt);
    const body = `I'd like to request a reschedule for my appointment on ${apptDate} (${rescheduleAppt.title}).${rescheduleNote ? `\n\nAdditional notes: ${rescheduleNote}` : ""}`;
    sendMessageMutation.mutate({ body });
  };

  const now = Date.now();
  const appointments = data ?? [];
  const upcoming = appointments.filter((a: typeof appointments[0]) => new Date(a.scheduledAt).getTime() >= now);
  const past = appointments.filter((a: typeof appointments[0]) => new Date(a.scheduledAt).getTime() < now);
  const list = tab === "upcoming" ? upcoming : past;

  return (
    <PortalLayout>
      <div className="p-6 max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <p className="text-xs text-gray-400 mb-1">Customer Portal &rsaquo; Appointments</p>
        <h1 className="text-3xl font-light text-gray-900 mb-6">Appointments</h1>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "upcoming" | "past")}>
          <TabsList className="bg-transparent border-b border-gray-200 rounded-none p-0 h-auto mb-0">
            <TabsTrigger
              value="upcoming"
              className="rounded-none border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=inactive]:border-transparent text-sm font-medium px-4 pb-2"
            >
              UPCOMING
            </TabsTrigger>
            <TabsTrigger
              value="past"
              className="rounded-none border-b-2 data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=inactive]:border-transparent text-sm font-medium px-4 pb-2"
            >
              PAST
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-0">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <ClipboardList className="w-16 h-16 mb-4 text-gray-300" />
                <p className="text-base">No appointments</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-md overflow-hidden mt-4">
                {/* Table header */}
                <div className="hidden md:grid md:grid-cols-[1fr_1fr_1fr_2fr_1fr_2fr_auto] bg-white border-b border-gray-200 text-xs font-semibold text-gray-600 px-4 py-3 gap-2">
                  <span>Date</span>
                  <span>Time</span>
                  <span>Type</span>
                  <span>Address</span>
                  <span>Tech</span>
                  <span>Service</span>
                  <span />
                </div>
                {list.map((appt) => (
                  <div
                    key={appt.id}
                    className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_2fr_1fr_2fr_auto] gap-1 md:gap-2 px-4 py-3 border-b border-gray-100 last:border-0 text-sm text-gray-700 hover:bg-gray-50 items-center"
                  >
                    <span className="font-medium">{formatDate(appt.scheduledAt)}</span>
                    <span>{formatTime(appt.scheduledAt)}</span>
                    <span className="capitalize">{appt.type ?? "Service"}</span>
                    <span className="text-gray-500">{appt.address ?? "—"}</span>
                    <span>{appt.techName ?? "—"}</span>
                    <span>{appt.title ?? "—"}</span>
                    {tab === "upcoming" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1 whitespace-nowrap"
                        onClick={() => setRescheduleAppt({ id: appt.id, title: appt.title, scheduledAt: new Date(appt.scheduledAt as any) })}
                      >
                        <RefreshCw className="w-3 h-3" /> Reschedule
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 text-right mt-3">
              Page 1 of {Math.max(1, Math.ceil(list.length / 10))}
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Reschedule Request Modal */}
      <Dialog open={!!rescheduleAppt} onOpenChange={(open) => { if (!open) { setRescheduleAppt(null); setRescheduleNote(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Reschedule</DialogTitle>
          </DialogHeader>
          {rescheduleAppt && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Requesting reschedule for <strong>{rescheduleAppt.title}</strong> on{" "}
                <strong>{formatDate(rescheduleAppt.scheduledAt)}</strong> at{" "}
                <strong>{formatTime(rescheduleAppt.scheduledAt)}</strong>.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Preferred dates / notes (optional)</label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  placeholder="e.g. Any morning next week works for me..."
                  value={rescheduleNote}
                  onChange={(e) => setRescheduleNote(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setRescheduleAppt(null); setRescheduleNote(""); }}>Cancel</Button>
                <Button
                  onClick={handleRescheduleSubmit}
                  disabled={sendMessageMutation.isPending}
                  className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white"
                >
                  {sendMessageMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Request"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
