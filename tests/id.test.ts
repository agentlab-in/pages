import { describe, expect, it } from "vitest";
import { assertValidId, generateId, isValidId } from "../src/lib/id.js";

describe("id", () => {
  it("generates lowercase alphanumeric of requested length", () => {
    const id = generateId(8);
    expect(id).toHaveLength(8);
    expect(isValidId(id)).toBe(true);
  });

  it("accepts valid ids", () => {
    expect(isValidId("abc123")).toBe(true);
    expect(assertValidId("AbC9")).toBe("abc9");
  });

  it("rejects invalid ids", () => {
    expect(isValidId("ab")).toBe(false);
    expect(isValidId("has-dash")).toBe(false);
    expect(() => assertValidId("../x")).toThrow(/Invalid page id/);
  });
});
