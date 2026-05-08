import { describe, expect, it } from "vitest";
import { normalizePhoneForTwilio } from "./twilio";

describe("normalizePhoneForTwilio", () => {
  it("normalizes 10 digit US numbers", () => {
    expect(normalizePhoneForTwilio("360-838-6731")).toBe("+13608386731");
  });

  it("normalizes 11 digit US numbers", () => {
    expect(normalizePhoneForTwilio("1 (360) 838-6731")).toBe("+13608386731");
  });

  it("keeps valid E.164 numbers", () => {
    expect(normalizePhoneForTwilio("+13608386731")).toBe("+13608386731");
  });

  it("rejects invalid numbers", () => {
    expect(() => normalizePhoneForTwilio("12345")).toThrow(/valid E\.164/);
  });
});
