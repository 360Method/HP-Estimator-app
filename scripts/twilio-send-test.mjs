const sid = process.env.TWILIO_ACCOUNT_SID;
const tok = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_PHONE_NUMBER;
const msgSvc = process.env.TWILIO_MESSAGING_SERVICE_SID;
const to = process.argv[2] || "+18157933243";
console.log("from:", from, "| messagingService:", msgSvc || "(none)", "| to:", to);

const body = new URLSearchParams({ To: to, Body: "Handy Pioneers test message." });
if (msgSvc) body.set("MessagingServiceSid", msgSvc);
else body.set("From", from);

const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
  method: "POST",
  headers: {
    Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body,
});
const j = await r.json();
console.log("HTTP", r.status);
console.log("status:", j.status, "| sid:", j.sid, "| error_code:", j.code ?? j.error_code, "| msg:", j.message ?? j.error_message);
