/**
 * AllowlistSettings — manage which emails can access the admin app.
 * If the list is empty, all authenticated users are allowed (open mode).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ShieldCheck, ShieldAlert, Mail } from "lucide-react";

export default function AllowlistSettings() {
  const utils = trpc.useUtils();
  const [newEmail, setNewEmail] = useState("");

  const { data: list = [], isLoading } = trpc.allowlist.list.useQuery();

  const addMutation = trpc.allowlist.add.useMutation({
    onSuccess: () => {
      setNewEmail("");
      utils.allowlist.list.invalidate();
      toast.success("Email added to allowlist");
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.allowlist.remove.useMutation({
    onSuccess: () => {
      utils.allowlist.list.invalidate();
      toast.success("Email removed from allowlist");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAdd = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    addMutation.mutate({ email });
  };

  const isOpenMode = list.length === 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Admin Access Allowlist</h2>
        <p className="text-sm text-gray-500 mt-1">
          Control which Google accounts can access the field estimator at{" "}
          <span className="font-medium text-gray-700">pro.handypioneers.com</span>.
        </p>
      </div>

      {/* Status banner */}
      <div
        className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
          isOpenMode
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-green-50 border-green-200 text-green-800"
        }`}
      >
        {isOpenMode ? (
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
        ) : (
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        )}
        <div>
          {isOpenMode ? (
            <>
              <span className="font-medium">Open mode</span> — the list is empty, so any
              authenticated user can access the app. Add at least one email to enable
              restriction.
            </>
          ) : (
            <>
              <span className="font-medium">Restricted</span> — only the{" "}
              {list.length} email{list.length !== 1 ? "s" : ""} below can access the app.
            </>
          )}
        </div>
      </div>

      {/* Add email */}
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="teammate@example.com"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newEmail.trim()) handleAdd();
          }}
          className="text-sm"
        />
        <Button
          onClick={handleAdd}
          disabled={!newEmail.trim() || addMutation.isPending}
          className="shrink-0"
        >
          {addMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          <span className="ml-1.5">Add</span>
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : list.length === 0 ? (
        <div className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
          No emails added yet — all authenticated users can access the app.
        </div>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
          {list.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-800 truncate">{entry.email}</span>
                {entry.addedBy && (
                  <span className="text-xs text-gray-400 hidden sm:inline">
                    · added by {entry.addedBy}
                  </span>
                )}
              </div>
              <button
                onClick={() => removeMutation.mutate({ email: entry.email })}
                disabled={removeMutation.isPending}
                className="ml-3 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40 shrink-0"
                title="Remove"
              >
                {removeMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Email matching is case-insensitive. Changes take effect immediately — no
        redeploy required.
      </p>
    </div>
  );
}
