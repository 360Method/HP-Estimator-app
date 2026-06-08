import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmailViaResend } from "./resend";

// Capture the JSON payload POSTed to Resend without hitting the network.
function mockResendFetch() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ id: "test-id" }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastPayload(fetchMock: ReturnType<typeof vi.fn>): any {
  const call = fetchMock.mock.calls.at(-1);
  return JSON.parse((call?.[1] as RequestInit).body as string);
}

describe("sendEmailViaResend staging email guard", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    delete process.env.RAILWAY_SERVICE_NAME;
    delete process.env.EMAIL_SAFE_MODE;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.EMAIL_SAFE_MODE;
    delete process.env.RAILWAY_SERVICE_NAME;
  });

  it("passes recipients through untouched when safe mode is off", async () => {
    const fetchMock = mockResendFetch();
    await sendEmailViaResend({ to: "real.customer@example.com", subject: "Your roadmap" });
    const payload = lastPayload(fetchMock);
    expect(payload.to).toEqual(["real.customer@example.com"]);
    expect(payload.subject).toBe("Your roadmap");
  });

  it("redirects external recipients to the sink and prefixes the subject in safe mode", async () => {
    process.env.EMAIL_SAFE_MODE = "1";
    const fetchMock = mockResendFetch();
    await sendEmailViaResend({ to: "real.customer@example.com", subject: "Your magic link" });
    const payload = lastPayload(fetchMock);
    expect(payload.to).toEqual(["staging-sink@handypioneers.com"]);
    expect(payload.subject).toBe("[STAGING → real.customer@example.com] Your magic link");
  });

  it("lets internal @handypioneers.com recipients through in safe mode", async () => {
    process.env.EMAIL_SAFE_MODE = "1";
    const fetchMock = mockResendFetch();
    await sendEmailViaResend({ to: "staging+42@handypioneers.com", subject: "Notice" });
    const payload = lastPayload(fetchMock);
    expect(payload.to).toEqual(["staging+42@handypioneers.com"]);
    expect(payload.subject).toBe("[STAGING] Notice");
  });

  it("guards cc and bcc, keeping internal and redirecting external", async () => {
    process.env.EMAIL_SAFE_MODE = "1";
    const fetchMock = mockResendFetch();
    await sendEmailViaResend({
      to: "help@handypioneers.com",
      cc: ["outside@gmail.com", "team@handypioneers.com"],
      bcc: "audit@yahoo.com",
      subject: "Mixed",
    });
    const payload = lastPayload(fetchMock);
    expect(payload.to).toEqual(["help@handypioneers.com"]);
    expect(payload.cc).toEqual(["team@handypioneers.com", "staging-sink@handypioneers.com"]);
    expect(payload.bcc).toEqual(["staging-sink@handypioneers.com"]);
    expect(payload.subject).toContain("outside@gmail.com");
    expect(payload.subject).toContain("audit@yahoo.com");
  });

  it("auto-enables safe mode when RAILWAY_SERVICE_NAME names a staging service", async () => {
    process.env.RAILWAY_SERVICE_NAME = "hp-estimator-staging";
    const fetchMock = mockResendFetch();
    await sendEmailViaResend({ to: "real.customer@example.com", subject: "Hi" });
    const payload = lastPayload(fetchMock);
    expect(payload.to).toEqual(["staging-sink@handypioneers.com"]);
  });

  it("EMAIL_SAFE_MODE=0 overrides staging auto-detection", async () => {
    process.env.RAILWAY_SERVICE_NAME = "hp-estimator-staging";
    process.env.EMAIL_SAFE_MODE = "0";
    const fetchMock = mockResendFetch();
    await sendEmailViaResend({ to: "real.customer@example.com", subject: "Hi" });
    const payload = lastPayload(fetchMock);
    expect(payload.to).toEqual(["real.customer@example.com"]);
  });
});
