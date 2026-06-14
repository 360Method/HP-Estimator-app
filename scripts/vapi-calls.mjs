const KEY = process.env.VAPI_API_KEY;
const AID = "595194ca-2b0e-4a76-add7-f566f37f498b";
const r = await fetch(`https://api.vapi.ai/call?assistantId=${AID}&limit=3`, {
  headers: { Authorization: `Bearer ${KEY}` },
});
const calls = await r.json();
if (!Array.isArray(calls)) {
  console.log("Non-array response:", JSON.stringify(calls).slice(0, 800));
  process.exit(0);
}
console.log(`Found ${calls.length} call(s)\n`);
for (const c of calls) {
  console.log("=====================================");
  console.log("callId:", c.id);
  console.log("status:", c.status, "| endedReason:", c.endedReason);
  console.log("started:", c.startedAt, "ended:", c.endedAt);
  if (c.error) console.log("ERROR:", JSON.stringify(c.error).slice(0, 800));
  const msgs = c.messages || c.artifact?.messages || [];
  console.log(`--- last messages (${msgs.length} total) ---`);
  for (const m of msgs.slice(-14)) {
    const role = m.role || m.type || "?";
    let txt = m.message ?? m.content ?? "";
    if (m.toolCalls) txt = "TOOLCALL " + JSON.stringify(m.toolCalls).slice(0, 240);
    if (role === "tool_calls") txt = "TOOLCALL " + JSON.stringify(m.toolCalls || m).slice(0, 240);
    if (role === "tool_call_result") txt = "RESULT " + JSON.stringify(m.result ?? m).slice(0, 240);
    console.log(`  ${role}: ${String(txt).slice(0, 220)}`);
  }
}
