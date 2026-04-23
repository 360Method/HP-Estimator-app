import { describe, it, expect } from 'vitest';
import 'dotenv/config';

describe('Twilio TwiML App SID', () => {
  it('should have TWILIO_TWIML_APP_SID set and matching AP prefix', () => {
    expect(process.env.TWILIO_TWIML_APP_SID).toBeTruthy();
    expect(process.env.TWILIO_TWIML_APP_SID).toMatch(/^AP/);
  });

  it('should resolve the TwiML App via Twilio API', async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const appSid = process.env.TWILIO_TWIML_APP_SID!;
    const credentials = Buffer.from(`${sid}:${token}`).toString('base64');

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Applications/${appSid}.json`,
      { headers: { Authorization: `Basic ${credentials}` } }
    );

    expect(res.status).toBe(200);
    const data = await res.json() as { sid: string; friendly_name: string };
    expect(data.sid).toBe(appSid);
    console.log(`[TwiML App] Name: ${data.friendly_name}`);
  }, 15000);
});
