/**
 * ServiceAreaSettings — Manage zip codes for the online booking wizard.
 * Zip codes in this list are the only ones accepted at /book.
 * Empty list = all zip codes accepted (open mode).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Loader2, Info } from "lucide-react";

export default function ServiceAreaSettings() {
  const [newZip, setNewZip] = useState("");

  const { data: zips, isLoading, refetch } = trpc.booking.listZipCodes.useQuery();

  const addMutation = trpc.booking.addZipCode.useMutation({
    onSuccess: () => {
      setNewZip("");
      refetch();
      toast.success("Zip code added.");
    },
    onError: (e) => toast.error(e.message || "Failed to add zip code."),
  });

  const removeMutation = trpc.booking.removeZipCode.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Zip code removed.");
    },
    onError: (e) => toast.error(e.message || "Failed to remove zip code."),
  });

  const handleAdd = () => {
    const zip = newZip.trim();
    if (zip.length < 5) {
      toast.error("Enter a valid 5-digit zip code.");
      return;
    }
    addMutation.mutate({ zip });
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Service Area — Zip Codes</h2>
        <p className="text-sm text-gray-500 mt-1">
          Control which zip codes can submit online requests. If the list is empty, all zip codes are accepted.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          <strong>Open mode:</strong> When the list is empty, the booking wizard accepts any zip code.
          Add at least one zip code to restrict requests to your service area.
        </p>
      </div>

      {/* Add form */}
      <div className="flex gap-2">
        <Input
          placeholder="e.g. 98661"
          value={newZip}
          onChange={(e) => setNewZip(e.target.value.replace(/\D/g, "").slice(0, 10))}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          maxLength={10}
          className="max-w-[160px]"
        />
        <Button
          onClick={handleAdd}
          disabled={addMutation.isPending || newZip.trim().length < 5}
          size="sm"
        >
          {addMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <><Plus className="w-4 h-4 mr-1" /> Add</>
          )}
        </Button>
      </div>

      {/* Zip code list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : !zips || zips.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
          <MapPin className="w-6 h-6 mx-auto mb-2 text-gray-300" />
          No zip codes added — all areas accepted (open mode).
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {zips.map((z) => (
            <div key={z.id} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="font-mono text-sm font-medium text-gray-900">{z.zip}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMutation.mutate({ zip: z.zip })}
                disabled={removeMutation.isPending}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        {zips && zips.length > 0
          ? `${zips.length} zip code${zips.length !== 1 ? "s" : ""} in service area.`
          : "Open mode — no restrictions."}
      </p>
    </div>
  );
}
