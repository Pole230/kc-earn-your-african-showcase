import { createHash, randomInt } from "node:crypto";
export function generateVerificationCode() {
  return String(randomInt(100000, 1000000));
}

export function hashVerificationCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function normalizePhoneNumber(value: string) {
  const normalized = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error("Use an international phone number, for example +254712345678");
  }
  return normalized;
}

export async function sendVerificationSms(phone: string, code: string) {
  const username = process.env.AFRICAS_TALKING_USERNAME;
  const apiKey = process.env.AFRICAS_TALKING_API_KEY;
  if (!username || !apiKey) throw new Error("Phone verification is not configured");
  const response = await fetch("https://api.africastalking.com/version1/messaging", {
    method: "POST",
    headers: {
      apiKey,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      username,
      to: phone,
      message: `Your KC Earn verification code is ${code}. It expires in 10 minutes.`,
    }),
  });
  if (!response.ok) throw new Error("Could not send the verification SMS");
}

export async function sendVerificationEmail(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.VERIFICATION_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Email verification is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your KC Earn verification code",
      text: `Your KC Earn verification code is ${code}. It expires in 10 minutes.`,
    }),
  });
  if (!response.ok) throw new Error("Could not send the verification email");
}
