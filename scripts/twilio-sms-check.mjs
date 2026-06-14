const sid = process.env.TWILIO_ACCOUNT_SID;
const tok = process.env.TWILIO_AUTH_TOKEN;
const auth = "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64");
const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json?PageSize=12`, {
  headers: { Authorization: auth },
});
const j = await r.json();
const msgs = j.messages || [];
console.log(`recent messages: ${msgs.length}`);
for (const m of msgs) {
  console.log(`${m.date_created} | to ${m.to} | from ${m.from} | status ${m.status} | err ${m.error_code ?? "-"}${m.error_message ? " | " + m.error_message : ""}`);
}
