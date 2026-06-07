// Read-only: print the recent roadmap pipeline snapshot (statuses, failure
// reasons, stored-PDF presence). Same auth pattern as retry-roadmap.mjs — the
// worker key rides in via injected env, never on the command line.
// Usage: railway run -s HP-Estimator-app -- node scripts/roadmap-snapshot.mjs [limit]
const key = process.env.INTERNAL_WORKER_KEY;
if (!key) {
  console.error("INTERNAL_WORKER_KEY not in env — run under `railway run -s HP-Estimator-app`");
  process.exit(1);
}
const limit = Number(process.argv[2] || 15);
const res = await fetch("https://pro.handypioneers.com/api/admin/roadmap-diagnostic", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ workerKey: key, limit }),
});
if (res.status !== 200) {
  console.error("HTTP", res.status, (await res.text()).slice(0, 300));
  process.exit(1);
}
const { snapshot } = await res.json();
for (const r of snapshot.recentTranslations) {
  console.log(
    [
      r.createdAt,
      r.status.padEnd(10),
      r.id,
      `pdf=${r.hasPdfStoragePath ? "stored" : "none"}`,
      `url=${r.hasReportUrl ? "yes" : "no"}`,
      r.deliveredAt ? `delivered=${r.deliveredAt}` : "",
      r.failureReason ? `FAIL: ${String(r.failureReason).slice(0, 160)}` : "",
    ].join("  "),
  );
}
