import { describe, it, expect } from 'vitest';
import 'dotenv/config';

describe('Twilio API Key credentials', () => {
  it('should have TWILIO_API_KEY and TWILIO_API_SECRET set', () => {
    expect(process.env.TWILIO_API_KEY).toBeTruthy();
    expect(process.env.TWILIO_API_KEY).toMatch(/^SK/);
    expect(process.env.TWILIO_API_SECRET).toBeTruthy();
    expect(process.env.TWILIO_API_SECRET!.length).toBeGreaterThanOrEqual(32);
  });

  it('should validate API Key via Twilio API', async () => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const apiKey = process.env.TWILIO_API_KEY!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    // API Key lookup requires master credentials (Account SID + Auth Token), not the key itself
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Keys/${apiKey}.json`,
      { headers: { Authorization: `Basic ${credentials}` } }
    );

    expect(res.status).toBe(200);
    const data = await res.json() as { sid: string; friendly_name: string };
    expect(data.sid).toBe(apiKey);
    console.log(`[API Key] Name: ${data.friendly_name}`);
  }, 15000);

  it('should generate a valid Voice AccessToken', async () => {
    const { generateVoiceToken } = await import('./twilio');
    const token = generateVoiceToken('test-user');
    expect(token).toBeTruthy();
    // JWT has 3 parts separated by dots
    expect(token.split('.').length).toBe(3);
    // Header should decode to show alg and type
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
    expect(header.typ).toBe('JWT');
    console.log(`[Voice Token] Generated successfully, alg: ${header.alg}`);
  });
});
