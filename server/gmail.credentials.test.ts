/**
 * Gmail credentials validation test
 * Verifies GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are set and can produce an OAuth2 client.
 */
import { describe, it, expect } from "vitest";
import "dotenv/config";

describe("Gmail credentials", () => {
  it("GMAIL_CLIENT_ID is set", () => {
    expect(process.env.GMAIL_CLIENT_ID).toBeTruthy();
  });

  it("GMAIL_CLIENT_SECRET is set", () => {
    expect(process.env.GMAIL_CLIENT_SECRET).toBeTruthy();
  });

  it("isGmailConfigured returns true when both vars are set", async () => {
    const { isGmailConfigured } = await import("./gmail");
    expect(isGmailConfigured()).toBe(true);
  }, 15000);

  it("getOAuth2Client builds without throwing when credentials are set", async () => {
    const { getOAuth2Client } = await import("./gmail");
    expect(() => getOAuth2Client()).not.toThrow();
  });
});
