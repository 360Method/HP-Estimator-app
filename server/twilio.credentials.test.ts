import { describe, it, expect } from 'vitest';
import 'dotenv/config';

describe('Twilio credentials', () => {
  it('should have all required env vars set', () => {
    expect(process.env.TWILIO_ACCOUNT_SID).toBeTruthy();
    expect(process.env.TWILIO_ACCOUNT_SID).toMatch(/^AC/);
    expect(process.env.TWILIO_AUTH_TOKEN).toBeTruthy();
    expect(process.env.TWILIO_AUTH_TOKEN?.length).toBeGreaterThanOrEqual(32);
    expect(process.env.TWILIO_PHONE_NUMBER).toBeTruthy();
    expect(process.env.TWILIO_PHONE_NUMBER).toMatch(/^\+1/);
  });

  it('should authenticate with Twilio API', async () => {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const credentials = Buffer.from(`${sid}:${token}`).toString('base64');

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    expect(res.status).toBe(200);
    const data = await res.json() as { sid: string; status: string };
    expect(data.sid).toBe(sid);
    expect(data.status).toBe('active');
  }, 15000);
});
