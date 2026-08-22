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
    status: "PROCESSING" | "PAID";
  }>;
};

export function getWelcomePayoutProvider(): WelcomePayoutProvider {
  throw new Error(
    process.env.WELCOME_PAYOUT_PROVIDER
      ? `Provider ${process.env.WELCOME_PAYOUT_PROVIDER} is not implemented`
      : "No approved welcome payout provider is configured",
  );
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
