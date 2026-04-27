import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "./AdminShell";
import { DepartmentSlug, STATUS_CLASS, STATUS_LABEL, departmentLabel, formatUsd } from "./constants";

export default function DepartmentDetail() {
  const [, params] = useRoute("/admin/departments/:slug");
  const slug = params?.slug as DepartmentSlug | undefined;

  const q = trpc.kpis.department.useQuery({ slug: slug! }, { enabled: !!slug });

  if (!slug) {
    return (
      <AdminShell>
        <div>Department not specified.</div>
      </AdminShell>
    );
  }

  const data = q.data;

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{departmentLabel(slug)}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Department-level KPIs and the agent seats that report them.
          </p>
        </div>

        <Card className="p-4">
          <h2 className="font-medium mb-3">Department metrics</h2>
          {data?.department?.length ? (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-2 font-medium">Key</th>
                  <th className="text-right p-2 font-medium">Value</th>
                  <th className="text-left p-2 font-medium">Unit</th>
                  <th className="text-left p-2 font-medium">Period</th>
                </tr>
              </thead>
              <tbody>
                {data.department.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="p-2">{m.key}</td>
                    <td className="p-2 text-right tabular-nums">{Number(m.value).toFixed(2)}</td>
                    <td className="p-2">{m.unit}</td>
                    <td className="p-2">{m.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              No department rollups yet. Seat metrics roll up here daily at 6am Pacific.
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-medium mb-3">Agents in this department</h2>
          {(data?.agents ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No agents in this department yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-2 font-medium">Seat</th>
                  <th className="text-left p-2 font-medium">Role</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-right p-2 font-medium">Cap</th>
                </tr>
              </thead>
              <tbody>
                {data!.agents.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="p-2">
                      <Link href={`/admin/ai-agents/${a.id}`}>
                        <span className="font-medium cursor-pointer hover:underline">{a.seatName}</span>
                      </Link>
                      {a.isDepartmentHead && <Badge variant="outline" className="ml-2">Head</Badge>}
                    </td>
                    <td className="p-2 text-muted-foreground">{a.role}</td>
                    <td className="p-2">
                      <Badge variant="outline" className={STATUS_CLASS[a.status]}>
                        {STATUS_LABEL[a.status] ?? a.status}
                      </Badge>
                    </td>
                    <td className="p-2 text-right tabular-nums">{formatUsd(Number(a.costCapDailyUsd))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-medium mb-3">Seat-level KPIs (latest)</h2>
          {(data?.seatMetrics ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No seat metrics recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-2 font-medium">Seat</th>
                  <th className="text-left p-2 font-medium">Key</th>
                  <th className="text-right p-2 font-medium">Value</th>
                  <th className="text-left p-2 font-medium">Unit</th>
                </tr>
              </thead>
              <tbody>
                {data!.seatMetrics.map((m) => {
                  const a = data!.agents.find((x) => x.id === m.scopeId);
                  return (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="p-2">{a?.seatName ?? `#${m.scopeId}`}</td>
                      <td className="p-2">{m.key}</td>
                      <td className="p-2 text-right tabular-nums">{Number(m.value).toFixed(2)}</td>
                      <td className="p-2">{m.unit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
