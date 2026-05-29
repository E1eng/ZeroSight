import { describe, expect, it } from "vitest";

import { MARKET_LIST, MARKET_METADATA } from "@/lib/markets";

describe("Market metadata", () => {
  it("has entries for every market key", () => {
    for (const key of MARKET_LIST) {
      expect(MARKET_METADATA[key]).toBeDefined();
    }
  });

  it("contains numeric assetIndex values", () => {
    for (const key of MARKET_LIST) {
      expect(typeof MARKET_METADATA[key].assetIndex).toBe("number");
    }
  });

  it("contains numeric category IDs", () => {
    for (const key of MARKET_LIST) {
      expect(typeof MARKET_METADATA[key].category).toBe("number");
    }
  });

  it("contains feedAddress strings starting with 0x", () => {
    for (const key of MARKET_LIST) {
      expect(MARKET_METADATA[key].feedAddress).toMatch(/^0x[0-9a-fA-F]+$/);
    }
  });

  it("contains non-empty coingeckoId strings", () => {
    for (const key of MARKET_LIST) {
      expect(MARKET_METADATA[key].coingeckoId.length).toBeGreaterThan(0);
    }
  });
});
