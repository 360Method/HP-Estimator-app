import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AdminShell } from "./AdminShell";

export default function AiAgentTasks() {
  const [filter, setFilter] = useState<"awaiting_approval" | "all">("awaiting_approval");
  const utils = trpc.useUtils();
  const tasksQ = trpc.aiAgents.listTasks.useQuery({
    status: filter === "all" ? undefined : "awaiting_approval",
    limit: 100,
  });
  const approve = trpc.aiAgents.approveTask.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.listTasks.invalidate();
      toast.success(
        `Approved. Executed ${res.executed} tool call${res.executed === 1 ? "" : "s"}.${
          res.errors.length ? ` Errors: ${res.errors.join("; ")}` : ""
        }`
      );
    },
    onError: (err) => toast.error(err.message),
  });
  const reject = trpc.aiAgents.rejectTask.useMutation({
    onSuccess: () => {
      utils.aiAgents.listTasks.invalidate();
      toast.success("Rejected.");
    },
  });

  const tasks = tasksQ.data ?? [];

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Approval Queue</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Runs parked awaiting human approval. Customer-facing outputs always land here first.
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Button
              variant={filter === "awaiting_approval" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("awaiting_approval")}
            >
              Awaiting approval
            </Button>
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              All tasks
            </Button>
          </div>
        </div>

        {tasks.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">Nothing pending.</Card>
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left p-3 font-medium">Task</th>
                  <th className="text-left p-3 font-medium">Agent</th>
                  <th className="text-left p-3 font-medium">Trigger</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Created</th>
                  <th className="text-right p-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="p-3">#{t.id}</td>
                    <td className="p-3">{t.seatName}</td>
                    <td className="p-3 text-xs">{t.triggerType}</td>
                    <td className="p-3">
                      <Badge variant="outline">{t.status}</Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(t.createdAt as never).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      {t.status === "awaiting_approval" && (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" onClick={() => approve.mutate({ taskId: t.id })}>
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reject.mutate({ taskId: t.id })}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </td>
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
