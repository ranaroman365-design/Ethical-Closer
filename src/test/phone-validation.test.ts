import { describe, it, expect } from "vitest";
import { validatePhone, getPhoneError } from "@/lib/phone-validation";

describe("Phone Validation — Lead Quality Gate", () => {
  // T1: Empty phone → blocked
  it("T1: blocks empty phone", () => {
    const result = validatePhone("");
    expect(result.phone_valid).toBe(false);
    expect(result.phone_quality_status).toBe("missing");
    expect(getPhoneError("")).toBe("Telefonnummer ist erforderlich.");
  });

  // T2: Fake number 123456 → blocked
  it("T2: blocks fake number 123456", () => {
    const result = validatePhone("123456789");
    expect(result.phone_valid).toBe(false);
    expect(result.phone_quality_status).toBe("fake");
  });

  it("T2b: blocks repeated digits 000000000", () => {
    const result = validatePhone("000000000");
    expect(result.phone_valid).toBe(false);
  });

  it("T2c: blocks repeated digits 1111111111", () => {
    const result = validatePhone("1111111111");
    expect(result.phone_valid).toBe(false);
  });

  it("T2d: blocks 999999999", () => {
    const result = validatePhone("999999999");
    expect(result.phone_valid).toBe(false);
  });

  // T3: Valid German mobile number → accepted
  it("T3: accepts valid German mobile +49 170 1234567", () => {
    const result = validatePhone("+49 170 1234567");
    expect(result.phone_valid).toBe(true);
    expect(result.phone_quality_status).toBe("valid");
    expect(result.phone_normalized).toBe("+491701234567");
  });

  it("T3b: accepts German mobile without + prefix 0170 1234567", () => {
    const result = validatePhone("0170 1234567");
    expect(result.phone_valid).toBe(true);
    expect(result.phone_normalized).toBe("+491701234567");
  });

  it("rejects too-short numbers", () => {
    const result = validatePhone("12345");
    expect(result.phone_valid).toBe(false);
    expect(result.phone_quality_status).toBe("invalid");
  });

  it("rejects too-long numbers", () => {
    const result = validatePhone("+49123456789012345");
    expect(result.phone_valid).toBe(false);
    expect(result.phone_quality_status).toBe("invalid");
  });

  it("normalizes Austrian number", () => {
    const result = validatePhone("+43 660 1234567");
    expect(result.phone_valid).toBe(true);
    expect(result.phone_normalized).toBe("+436601234567");
  });

  it("getPhoneError returns null for valid phone", () => {
    expect(getPhoneError("+49 170 9876543")).toBeNull();
  });
});
