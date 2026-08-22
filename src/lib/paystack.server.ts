import { createHmac, timingSafeEqual } from "node:crypto";
import type { WelcomePayoutProvider } from "@/lib/welcome-payout.server";

const PAYSTACK_API = "https://api.paystack.co";

type PaystackResponse<T> = { status: boolean; message: string; data: T };
type BankResolution = { account_name: string; account_number: string };
type TransferRecipient = { recipient_code: string; name: string };
type Transfer = { transfer_code: string; reference: string; status: string };

export class PaystackApiError extends Error {}

function secretKey(): string {
  const value = process.env.PAYSTACK_SECRET_KEY;
  if (!value) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return value;
}

async function paystackRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PAYSTACK_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Paystack network request failed");
  }
  const payload = (await response.json().catch(() => null)) as PaystackResponse<T> | null;
  if (!response.ok || !payload?.status) {
    throw new PaystackApiError(
      `Paystack request failed: ${payload?.message ?? `HTTP ${response.status}`}`,
    );
  }
  return payload.data;
}

export function validateNigerianBankDetails(bankCode: string, accountNumber: string) {
  if (!/^\d{3}$/.test(bankCode)) throw new Error("A valid Nigerian bank code is required");
  if (!/^\d{10}$/.test(accountNumber))
    throw new Error("A valid 10-digit account number is required");
}

export async function verifyPaystackTransfersAvailable(): Promise<void> {
  await paystackRequest<{ balance: number; currency: string }>("/balance");
  await paystackRequest<unknown>("/transfer?perPage=1");
}

export async function resolvePaystackRecipient(input: { bankCode: string; accountNumber: string }) {
  validateNigerianBankDetails(input.bankCode, input.accountNumber);
  const account = await paystackRequest<BankResolution>(
    `/bank/resolve?account_number=${encodeURIComponent(input.accountNumber)}&bank_code=${encodeURIComponent(input.bankCode)}`,
  );
  const recipient = await paystackRequest<TransferRecipient>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: account.account_name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "NGN",
    }),
  });
  return {
    accountName: account.account_name,
    recipientReference: recipient.recipient_code,
    accountLast4: input.accountNumber.slice(-4),
    accountMask: `${"*".repeat(6)}${input.accountNumber.slice(-4)}`,
    bankCode: input.bankCode,
  };
}

export function createPaystackProvider(): WelcomePayoutProvider {
  return {
    name: "paystack",
    resolveBankAccount: resolvePaystackRecipient,
    async initiateTransfer(input) {
      const transfer = await paystackRequest<Transfer>("/transfer", {
        method: "POST",
        body: JSON.stringify({
          source: "balance",
          amount: Math.round(input.amount * 100),
          recipient: input.recipientReference,
          currency: input.currency,
          reference: input.reference,
          reason: "KC Earn welcome bonus",
        }),
      });
      return {
        providerReference: transfer.transfer_code || transfer.reference,
        status: "PROCESSING",
      };
    },
  };
}

export function verifyPaystackWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const actual = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}
