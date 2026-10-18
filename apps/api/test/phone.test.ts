import { describe, expect, it } from "vitest";
import { normalizeEgyptPhone } from "../src/domain/phone";

describe("normalizeEgyptPhone", () => {
  it.each([
    ["01012345678", "+201012345678"],
    ["+201112345678", "+201112345678"],
    ["201212345678", "+201212345678"],
    ["0100 123 4567", "+201001234567"],
    ["010-1234-5678", "+201012345678"],
    ["٠١٠١٢٣٤٥٦٧٨", "+201012345678"],
  ])("normalizes %s", (raw, expected) => {
    expect(normalizeEgyptPhone(raw)).toBe(expected);
  });

  it.each(["", "0991234567", "010123456", "0101234567890", "abc", "+441012345678", "01312345678"])(
    "rejects %s",
    (raw) => {
      expect(normalizeEgyptPhone(raw)).toBeNull();
    },
  );
});
