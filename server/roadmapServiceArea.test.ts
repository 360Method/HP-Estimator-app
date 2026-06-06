/**
 * Server-side roadmap service-area gate — the barrier that keeps out-of-area
 * submissions from burning Claude runs. DB unavailable → constant fallback.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null), // forces the Clark County constant path
}));

import {
  isRoadmapZipServed,
  normalizeZip,
  CLARK_COUNTY_ZIPS,
} from "./lib/priorityTranslation/serviceArea";

describe("normalizeZip", () => {
  it("extracts 5-digit ZIPs from messy input", () => {
    expect(normalizeZip("98661")).toBe("98661");
    expect(normalizeZip(" 98661-1234 ")).toBe("98661");
    expect(normalizeZip("123 NE Main St, Vancouver, WA 98661")).toBe("98661");
    expect(normalizeZip("Vancouver WA")).toBeNull();
    expect(normalizeZip("")).toBeNull();
    expect(normalizeZip(null)).toBeNull();
    expect(normalizeZip(undefined)).toBeNull();
  });
});

describe("isRoadmapZipServed (constant fallback path)", () => {
  it("serves Clark County ZIPs", async () => {
    expect(await isRoadmapZipServed("98661")).toBe(true);
    expect(await isRoadmapZipServed("98683")).toBe(true);
  });

  it("rejects out-of-area ZIPs (Portland, Beverly Hills, Seattle)", async () => {
    expect(await isRoadmapZipServed("97201")).toBe(false);
    expect(await isRoadmapZipServed("90210")).toBe(false);
    expect(await isRoadmapZipServed("98101")).toBe(false);
  });

  it("rejects missing or unparseable ZIPs — never generate for an address we can't place", async () => {
    expect(await isRoadmapZipServed(null)).toBe(false);
    expect(await isRoadmapZipServed("")).toBe(false);
    expect(await isRoadmapZipServed("somewhere nice")).toBe(false);
  });

  it("constant mirrors the client list size (24 Clark County ZIPs)", () => {
    expect(CLARK_COUNTY_ZIPS.size).toBe(24);
  });
});
