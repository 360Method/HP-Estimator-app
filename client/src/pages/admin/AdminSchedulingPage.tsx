/**
 * AdminSchedulingPage — operator view of slots + bookings.
 * Block/unblock slots, glance at upcoming bookings.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AdminShell } from "./AdminShell";
import { Loader2 } from "lucide-react";

function fmtDay(d: Date) {
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminSchedulingPage() {
  const [tab, setTab] = useState<"slots" | "bookings">("slots");
  const utils = trpc.useUtils();
  const slotsQ = trpc.scheduling.listAllSlots.useQuery({ limit: 1000 });
  const bookingsQ = trpc.scheduling.listBookings.useQuery({ upcomingOnly: true, limit: 200 });

  const setBlocked = trpc.scheduling.setSlotBlocked.useMutation({
    onSuccess: () => {
      utils.scheduling.listAllSlots.invalidate();
      toast.success("Slot updated.");
    },
    onError: (err) => toast.error(err.message),
  });

  const slots = slotsQ.data ?? [];
  const bookings = bookingsQ.data ?? [];

  // Group slots by Pacific calendar day
  const grouped = new Map<string, typeof slots>();
  for (const s of slots) {
    const day = new Date(s.startAt).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const arr = grouped.get(day) ?? [];
    arr.push(s);
    grouped.set(day, arr);
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Scheduling</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Operator-facing view of availability windows and upcoming visits. Block individual
            slots when you're unavailable.
          </p>
        </div>

        <div className="flex gap-2 text-sm">
          <Button
            variant={tab === "slots" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("slots")}
          >
            Availability ({slots.length})
          </Button>
          <Button
            variant={tab === "bookings" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("bookings")}
          >
            Upcoming bookings ({bookings.length})
          </Button>
        </div>

        {tab === "slots" ? (
          slotsQ.isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin inline" />
            </div>
          ) : slots.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              No availability slots yet.
            </Card>
          ) : (
            <div className="space-y-4">
              {Array.from(grouped.entries()).map(([day, daySlots]) => (
                <Card key={day} className="p-4">
                  <p className="text-sm font-medium mb-3">{fmtDay(new Date(daySlots[0].startAt))}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {daySlots.map((s: any) => {
                      const isBooked = s.bookedCount >= s.capacity;
                      return (
                        <div
                          key={s.id}
                          className={`rounded-md border p-2 text-xs ${
                            s.blocked
                              ? "bg-gray-100 border-gray-300 text-gray-500"
                              : isBooked
                                ? "bg-amber-50 border-amber-300"
                                : "bg-white border-gray-200"
                          }`}
                        >
                          <div className="font-medium">{fmtTime(new Date(s.startAt))}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {s.blocked ? "blocked" : isBooked ? "booked" : "open"}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1 h-6 text-[11px] w-full"
                            disabled={setBlocked.isPending}
                            onClick={() =>
                              setBlocked.mutate({ id: s.id, blocked: !s.blocked })
                            }
                          >
                            {s.blocked ? "Unblock" : "Block"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : bookingsQ.isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin inline" />
          </div>
        ) : bookings.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">No upcoming bookings.</Card>
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">Customer</th>
                  <th className="text-left p-3 font-medium">Visit type</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Booked</th>
                  <th className="text-left p-3 font-medium">Confirmation</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b: any) => (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="p-3">#{b.id}</td>
                    <td className="p-3 font-mono text-xs">{b.customerId}</td>
                    <td className="p-3">{b.visitType}</td>
                    <td className="p-3">
                      <Badge variant="outline">{b.status}</Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(b.createdAt as never).toLocaleString()}
                    </td>
                    <td className="p-3 font-mono text-xs">{b.confirmationCode ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
