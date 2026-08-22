import { createPaystackProvider } from "@/lib/paystack.server";

export type WelcomePayoutProvider = {
  name: string;
  resolveBankAccount: (input: { bankCode: string; accountNumber: string }) => Promise<{
    accountName: string;
    recipientReference: string;
  }>;
  initiateTransfer: (input: {
    recipientReference: string;
    amount: number;
    currency: "NGN";
    reference: string;
  }) => Promise<{
    providerReference: string;
    status: "PROCESSING";
  }>;
};

export function getWelcomePayoutProvider(): WelcomePayoutProvider {
  if (process.env.WELCOME_PAYOUT_PROVIDER !== "paystack") {
    throw new Error(
      process.env.WELCOME_PAYOUT_PROVIDER
        ? `Provider ${process.env.WELCOME_PAYOUT_PROVIDER} is not implemented`
        : "No approved welcome payout provider is configured",
    );
  }

  return createPaystackProvider();
}

export function isWelcomePayoutEligible(input: {
  phoneVerified: boolean;
  emailVerified: boolean;
  bankVerified: boolean;
  consented: boolean;
  hasNotBeenPaid: boolean;
  payoutEnabled: boolean;
  budgetAvailable: boolean;
}) {
  return Object.values(input).every(Boolean);
}
