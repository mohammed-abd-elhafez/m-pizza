import { describe, expect, it } from "vitest";
import { cleanText } from "../src/domain/text";
import { placeOrderSchema } from "../src/http/schemas";

describe("cleanText", () => {
  it("removes bidi overrides, zero-width and control characters but keeps normal text, Arabic and newlines", () => {
    expect(cleanText("ring‮ twice‬")).toBe("ring twice");
    expect(cleanText("a⁦b⁩c​d‏e﻿f")).toBe("abcdef");
    expect(cleanText("line1\nline2\ttab")).toBe("line1\nline2 tab");
    expect(cleanText("beep\u0007\u0000\u001B[31mred")).toBe("beep[31mred");
    expect(cleanText("بجوار مسجد النور - الدور ٣")).toBe("بجوار مسجد النور - الدور ٣");
    expect(cleanText("🍕 extra cheese")).toBe("🍕 extra cheese");
  });

  it("normalises Unicode and collapses runaway whitespace", () => {
    expect(cleanText("é")).toBe("é");
    expect(cleanText("a      b\n\n\n\n\nc")).toBe("a b\n\nc");
  });
});

describe("order text fields are cleaned at the boundary", () => {
  const base = {
    service: "delivery",
    location: { lat: 30.05, lng: 31.23 },
    paymentMethod: "cod",
    lines: [{ qty: 1, halves: [{ half: "whole", itemId: 1, sizeId: 1 }] }],
  };

  it("cleans the landmark, the order note and line notes", () => {
    const parsed = placeOrderSchema.parse({
      ...base,
      address: { landmark: "Next to‮ the mosque", building: "5​" },
      note: "ring‮ twice",
      lines: [{ qty: 1, note: "no⁦ onions", halves: [{ half: "whole", itemId: 1, sizeId: 1 }] }],
    });
    expect(parsed.address?.landmark).toBe("Next to the mosque");
    expect(parsed.address?.building).toBe("5");
    expect(parsed.note).toBe("ring twice");
    expect(parsed.lines[0]?.note).toBe("no onions");
  });

  it("rejects text that is empty once invisible characters are removed", () => {
    expect(() => placeOrderSchema.parse({ ...base, address: { landmark: "​​​​" } })).toThrow();
  });
});
