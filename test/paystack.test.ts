import { describe, expect, it } from "vitest";
import { validateNigerianBankDetails, verifyPaystackWebhookSignature } from "@/lib/paystack.server";

describe("Paystack payout safety boundary", () => {
  it("requires Nigerian bank codes and ten-digit account numbers", () => {
    expect(() => validateNigerianBankDetails("044", "0123456789")).not.toThrow();
    expect(() => validateNigerianBankDetails("44", "0123456789")).toThrow();
    expect(() => validateNigerianBankDetails("044", "123")).toThrow();
  });

  it("rejects unsigned webhooks", () => {
    expect(verifyPaystackWebhookSignature("{}", null)).toBe(false);
  });
});
