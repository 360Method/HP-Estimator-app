#!/usr/bin/env node
/**
 * Live end-to-end smoke test for the Roadmap Generator / Priority Translation
 * pipeline. POSTs a fixture PDF at the production endpoint, then polls for the
 * worker to advance status to draft_awaiting_review (or completed). Marcin
 * reviews the draft via /admin/roadmap-reviews before it ships to the customer.
 *
 * Run:
 *   node scripts/test-roadmap-generator.mjs
 *
 * Env overrides:
 *   BASE_URL           default https://pro.handypioneers.com
 *   FIXTURE_PATH       default scripts/fixtures/sample-inspection.pdf
 *   TEST_EMAIL         default roadmap-test+${ts}@handypioneers.com
 *   TEST_PHONE         default 360-217-9444
 *   POLL_TIMEOUT_MS    default 90000
 *   POLL_INTERVAL_MS   default 3000
 *   TERMINAL_STATUSES  default draft_awaiting_review,completed,failed
 */

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, "") || "https://pro.handypioneers.com";
const FIXTURE_PATH = process.env.FIXTURE_PATH || "scripts/fixtures/sample-inspection.pdf";
const TEST_EMAIL = process.env.TEST_EMAIL || `roadmap-test+${Date.now()}@handypioneers.com`;
const TEST_PHONE = process.env.TEST_PHONE || "360-217-9444";
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS || 90_000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 3_000);
const TERMINAL_STATUSES = (process.env.TERMINAL_STATUSES || "draft_awaiting_review,completed,failed")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;

async function main() {
  const fixtureAbs = path.resolve(process.cwd(), FIXTURE_PATH);
  if (!existsSync(fixtureAbs)) {
    console.log(
      `[skip] Fixture not found at ${fixtureAbs}.\n` +
        `       Drop a sample inspection PDF at that path (or set FIXTURE_PATH=...) and rerun.\n` +
        `       The fixture is intentionally .gitignored — we don't commit customer PDFs.`,
    );
    process.exit(0);
  }
  const fileStat = await stat(fixtureAbs);
  console.log(`[setup] Using fixture: ${fixtureAbs} (${(fileStat.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`[setup] Target: ${BASE_URL}/api/roadmap-generator/submit`);

  const pdf = await readFile(fixtureAbs);
  const form = new FormData();
  form.set(
    "report_pdf",
    new Blob([pdf], { type: "application/pdf" }),
    path.basename(fixtureAbs),
  );
  form.set("firstName", "Roadmap");
  form.set("lastName", "SmokeTest");
  form.set("email", TEST_EMAIL);
  form.set("phone", TEST_PHONE);
  form.set("propertyAddress", "8107 NE 14th St, Vancouver, WA 98664");
  form.set("notes", "Automated smoke test — safe to ignore.");
  form.set("source", "roadmap_generator_smoke_test");

  const t0 = Date.now();
  const submitRes = await fetch(`${BASE_URL}/api/roadmap-generator/submit`, {
    method: "POST",
    body: form,
  });
  const submitMs = Date.now() - t0;

  if (submitRes.status !== 200) {
    const body = await submitRes.text().catch(() => "<unreadable>");
    console.error(`[fail] HTTP ${submitRes.status} on submit (${fmt(submitMs)}):`);
    console.error(body.slice(0, 1000));
    process.exit(1);
  }

  const submitJson = await submitRes.json();
  console.log(`[submit] HTTP 200 in ${fmt(submitMs)} — translationId=${submitJson.id}`);

  const translationId = submitJson.id;
  if (!translationId) {
    console.error("[fail] Submit response missing translation id:", submitJson);
    process.exit(1);
  }

  const pollStart = Date.now();
  let lastStatus = submitJson.status;
  while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
    const statusRes = await fetch(`${BASE_URL}/api/trpc/priorityTranslation.getStatus?input=${encodeURIComponent(JSON.stringify({ id: translationId }))}`, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    if (statusRes.status === 200) {
      const payload = await statusRes.json().catch(() => null);
      const row = payload?.result?.data ?? payload?.[0]?.result?.data;
      if (row?.status) {
        if (row.status !== lastStatus) {
          console.log(`[poll]  t=${fmt(Date.now() - pollStart)}  status=${row.status}`);
          lastStatus = row.status;
        }
        if (TERMINAL_STATUSES.includes(row.status)) {
          const totalMs = Date.now() - t0;
          if (row.status === "failed") {
            console.error(`[fail] Worker reported status=failed after ${fmt(totalMs)}: ${row.failureReason ?? "(no reason)"}`);
            process.exit(1);
          }
          console.log(`[ok]   Reached terminal status "${row.status}" in ${fmt(totalMs)} total.`);
          if (row.status === "draft_awaiting_review") {
            console.log(`       Next step: Marcin reviews at ${BASE_URL}/admin/roadmap-reviews`);
          }
          process.exit(0);
        }
      }
    } else if (statusRes.status === 401 || statusRes.status === 403) {
      console.log(`[poll]  Status endpoint is auth-gated (HTTP ${statusRes.status}). Skipping polling loop.`);
      console.log(`[ok]   Submit succeeded; verify processing in DB or /admin/roadmap-reviews.`);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.error(
    `[fail] Timed out after ${fmt(POLL_TIMEOUT_MS)} waiting for terminal status. ` +
      `Last seen: ${lastStatus}. Check worker logs.`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[crash]", err?.stack ?? err);
  process.exit(1);
});
