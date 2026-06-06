// One-off: retry a roadmap submission through the Stewardship orchestrator.
// Usage: railway run -s HP-Estimator-app -- node scripts/retry-roadmap.mjs <translationId>
const id = process.argv[2];
if (!id) {
  console.error("usage: node scripts/retry-roadmap.mjs <translationId>");
  process.exit(1);
}
const res = await fetch("https://pro.handypioneers.com/api/trpc/priorityTranslation.process", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: { id, workerKey: process.env.INTERNAL_WORKER_KEY, pipeline: "roadmap" } }),
});
console.log("status:", res.status);
console.log((await res.text()).slice(0, 300));
