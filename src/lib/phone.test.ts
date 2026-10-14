import { describe, it, expect } from "vitest";
import { normalizePhone, toE164 } from "./phone";

describe("normalizePhone", () => {
  it("strips leading + and spaces", () => {
    expect(normalizePhone("+962 5X XXX XXX")).toBe("9625XXXXXXX");
  });
  it("rejects empty input", () => {
    expect(() => normalizePhone("")).toThrow();
  });
});

describe("toE164", () => {
  it("combines country code and national number", () => {
    expect(toE164("966", "0500000001")).toBe("966500000001");
  });
  it("does not double country code", () => {
    expect(toE164("966", "966500000001")).toBe("966500000001");
  });
  it("drops trunk prefix", () => {
    expect(toE164("44", "02071234567")).toBe("442071234567");
  });
});
