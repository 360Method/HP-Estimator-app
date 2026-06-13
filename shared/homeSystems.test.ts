import { describe, expect, it } from "vitest";
import { HOME_SYSTEMS, homeSystemLabel, isHomeSystemKey, normalizeToSystem } from "./homeSystems";

describe("homeSystems taxonomy", () => {
  it("every key is unique and recognized", () => {
    const keys = HOME_SYSTEMS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(isHomeSystemKey(key)).toBe(true);
    expect(isHomeSystemKey("garage_band")).toBe(false);
  });

  it("passes exact keys through", () => {
    expect(normalizeToSystem("roof")).toBe("roof");
    expect(normalizeToSystem("site_drainage")).toBe("site_drainage");
  });

  it("snaps free text onto the right system", () => {
    expect(normalizeToSystem("Roof and Gutters")).toBe("roof");
    expect(normalizeToSystem("Moss on the north shingles")).toBe("roof");
    expect(normalizeToSystem("Water heater nearing end of life")).toBe("plumbing");
    expect(normalizeToSystem("GFCI outlets missing in bathroom")).toBe("electrical");
    expect(normalizeToSystem("Furnace filter overdue")).toBe("hvac");
    expect(normalizeToSystem("Foundation crack in crawl space")).toBe("structural");
    expect(normalizeToSystem("Standing water along the driveway")).toBe("site_drainage");
  });

  it("never fails: unknown or empty text lands on other", () => {
    expect(normalizeToSystem("")).toBe("other");
    expect(normalizeToSystem(null)).toBe("other");
    expect(normalizeToSystem(undefined)).toBe("other");
    expect(normalizeToSystem("quantum flux capacitor")).toBe("other");
  });

  it("labels resolve for both audiences", () => {
    expect(homeSystemLabel("roof")).toBe("Roof and gutters");
    expect(homeSystemLabel("structural", "customer")).toBe("Structure and foundation");
  });
});
