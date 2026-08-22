import { describe, expect, it } from "vitest";
import { getWelcomePayoutProvider, isWelcomePayoutEligible } from "@/lib/welcome-payout.server";

const eligible = {
  phoneVerified: true,
  emailVerified: true,
  bankVerified: true,
  consented: true,
  hasNotBeenPaid: true,
  payoutEnabled: true,
  budgetAvailable: true,
};

describe("welcome payout safety boundary", () => {
  it.each([
    "phoneVerified",
    "emailVerified",
    "bankVerified",
    "consented",
    "hasNotBeenPaid",
    "payoutEnabled",
    "budgetAvailable",
  ])("rejects when %s is absent", (condition) => {
    expect(isWelcomePayoutEligible({ ...eligible, [condition]: false })).toBe(false);
  });

  it("allows only a fully verified, consented, funded account", () => {
    expect(isWelcomePayoutEligible(eligible)).toBe(true);
  });

  it("fails closed when no real provider is configured", () => {
    expect(() => getWelcomePayoutProvider()).toThrow(
      "No approved welcome payout provider is configured",
    );
  });
});
