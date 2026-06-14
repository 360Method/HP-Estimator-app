/**
 * Verify our Anthropic key works, then register it as a Vapi credential so the
 * assistant's Claude calls use our key (fixes providerfault-anthropic-llm-failed).
 * Idempotent: reuses an existing anthropic credential if present.
 * Prints the credential id (safe) — never the key.
 */
const VKEY = process.env.VAPI_API_KEY;
const AKEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.VAPI_MODEL || "claude-3-5-sonnet-20241022";

if (!VKEY) { console.error("VAPI_API_KEY missing"); process.exit(1); }
if (!AKEY) { console.error("ANTHROPIC_API_KEY missing in this env"); process.exit(1); }

async function vapi(method, path, body) {
  const r = await fetch(`https://api.vapi.ai${path}`, {
    method,
    headers: { Authorization: `Bearer ${VKEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

// 1. Prove our key + model are valid against Anthropic directly.
const test = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { "x-api-key": AKEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
  body: JSON.stringify({ model: MODEL, max_tokens: 16, messages: [{ role: "user", content: "say ok" }] }),
});
console.log(`Anthropic direct test (${MODEL}): HTTP ${test.status}`);
if (test.status !== 200) {
  console.error("  ", JSON.stringify(await test.json().catch(() => "")).slice(0, 400));
  console.error("  -> model id or key rejected by Anthropic. Fix VAPI_MODEL before continuing.");
  process.exit(1);
}
console.log("  Anthropic key + model OK.");

// 2. Reuse or create the Vapi anthropic credential.
const list = await vapi("GET", "/credential");
const arr = Array.isArray(list.json) ? list.json : list.json?.results || [];
let cred = arr.find((c) => c.provider === "anthropic");
if (cred) {
  console.log(`Existing anthropic credential: ${cred.id}`);
} else {
  const created = await vapi("POST", "/credential", { provider: "anthropic", apiKey: AKEY });
  if (created.status >= 300) {
    console.error("Failed to create credential:", created.status, JSON.stringify(created.json).slice(0, 400));
    process.exit(1);
  }
  cred = created.json;
  console.log(`Created anthropic credential: ${cred.id}`);
}
console.log(`\nCREDENTIAL_ID=${cred.id}`);
