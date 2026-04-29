import { describe, it, expect } from "vitest";
import {
  encodeReplyToken,
  decodeReplyToken,
  extractReplyTokenFromSubject,
  injectReplyTokenIntoSubject,
  buildPortalThreadUrl,
} from "./replyToken";

describe("replyToken", () => {
  it("round-trips opportunityId + customerId through base64url", () => {
    const payload = { opportunityId: "opp_abc123", customerId: "cust_xyz789" };
    const token = encodeReplyToken(payload);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeReplyToken(token)).toEqual(payload);
  });

  it("rejects tokens that don't contain the opp|customer separator", () => {
    expect(decodeReplyToken("")).toBeNull();
    expect(decodeReplyToken(Buffer.from("noseparator").toString("base64url"))).toBeNull();
    expect(decodeReplyToken(Buffer.from("|trailing").toString("base64url"))).toBeNull();
    expect(decodeReplyToken(Buffer.from("leading|").toString("base64url"))).toBeNull();
  });

  it("survives nanoid-style ids that contain underscores or dashes", () => {
    const payload = { opportunityId: "abc_DEF-12", customerId: "xyz-987_ab" };
    expect(decodeReplyToken(encodeReplyToken(payload))).toEqual(payload);
  });

  it("extracts the token from a stamped subject", () => {
    const token = encodeReplyToken({ opportunityId: "opp_1", customerId: "cust_1" });
    const subject = `Re: Your roadmap is ready [#${token}]`;
    expect(extractReplyTokenFromSubject(subject)).toBe(token);
  });

  it("returns null when no token is in the subject", () => {
    expect(extractReplyTokenFromSubject("Re: Your roadmap is ready")).toBeNull();
    expect(extractReplyTokenFromSubject(null)).toBeNull();
    expect(extractReplyTokenFromSubject(undefined)).toBeNull();
  });

  it("injects the token without double-stamping", () => {
    const token = encodeReplyToken({ opportunityId: "opp_1", customerId: "cust_1" });
    const subject = "Your roadmap is ready";
    const stamped = injectReplyTokenIntoSubject(subject, token);
    expect(stamped).toBe(`${subject} [#${token}]`);
    // Idempotent: re-stamping doesn't add a second token.
    expect(injectReplyTokenIntoSubject(stamped, token)).toBe(stamped);
  });

  it("builds portal thread URLs against the configured origin", () => {
    const url = buildPortalThreadUrl("abc123", "https://client.example.com");
    expect(url).toBe("https://client.example.com/portal/communications/abc123");
    // Trailing slash on origin is normalized.
    expect(buildPortalThreadUrl("abc123", "https://client.example.com/")).toBe(
      "https://client.example.com/portal/communications/abc123",
    );
  });
});
