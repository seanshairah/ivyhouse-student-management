import crypto from "crypto";

/**
 * Paynow integration abstraction.
 *
 * In `development` mode (no real keys) this returns deterministic mock
 * responses so the full payment workflow is testable end-to-end. When real
 * PAYNOW_INTEGRATION_ID / PAYNOW_INTEGRATION_KEY are provided and
 * PAYNOW_MODE=live, the same functions talk to the real Paynow API — no
 * architectural changes required.
 */

const PAYNOW_INITIATE_URL = "https://www.paynow.co.zw/interface/initiatetransaction";

export interface PaynowConfig {
  integrationId: string;
  integrationKey: string;
  returnUrl: string;
  resultUrl: string;
  mode: "development" | "live";
}

export function getPaynowConfig(): PaynowConfig {
  return {
    integrationId: process.env.PAYNOW_INTEGRATION_ID || "",
    integrationKey: process.env.PAYNOW_INTEGRATION_KEY || "",
    returnUrl: process.env.PAYNOW_RETURN_URL || "http://localhost:3000/student/payments/return",
    resultUrl: process.env.PAYNOW_RESULT_URL || "http://localhost:3000/api/payments/paynow/result",
    mode:
      process.env.PAYNOW_MODE === "live" &&
      process.env.PAYNOW_INTEGRATION_ID &&
      process.env.PAYNOW_INTEGRATION_KEY
        ? "live"
        : "development",
  };
}

export interface InitiatePaymentInput {
  reference: string;
  amount: number;
  email: string;
  description: string;
}

export interface InitiatePaymentResult {
  ok: boolean;
  redirectUrl?: string;
  pollUrl?: string;
  providerRef?: string;
  error?: string;
  mode: "development" | "live";
}

// Paynow signs requests with a SHA512 hash of concatenated values + key.
function paynowHash(values: Record<string, string>, key: string): string {
  const concat = Object.values(values).join("") + key;
  return crypto.createHash("sha512").update(concat).digest("hex").toUpperCase();
}

function toUrlEncoded(data: Record<string, string>): string {
  return Object.entries(data)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

function parsePaynowResponse(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > -1) {
      out[line.slice(0, idx).trim().toLowerCase()] = decodeURIComponent(
        line.slice(idx + 1).trim(),
      );
    }
  }
  return out;
}

/** Create a Paynow payment (or a mock one in development). */
export async function createPaynowPayment(
  input: InitiatePaymentInput,
): Promise<InitiatePaymentResult> {
  const config = getPaynowConfig();

  if (config.mode === "development") {
    // Mock: route the user to our own simulated checkout page.
    const redirectUrl = `${process.env.APP_URL || "http://localhost:3000"}/student/payments/checkout?ref=${encodeURIComponent(
      input.reference,
    )}`;
    return {
      ok: true,
      mode: "development",
      redirectUrl,
      pollUrl: `mock://poll/${input.reference}`,
      providerRef: `MOCK-${input.reference}`,
    };
  }

  try {
    const values: Record<string, string> = {
      id: config.integrationId,
      reference: input.reference,
      amount: input.amount.toFixed(2),
      additionalinfo: input.description,
      returnurl: config.returnUrl,
      resulturl: config.resultUrl,
      authemail: input.email,
      status: "Message",
    };
    values.hash = paynowHash(values, config.integrationKey);

    const res = await fetch(PAYNOW_INITIATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: toUrlEncoded(values),
    });
    const parsed = parsePaynowResponse(await res.text());

    if (parsed.status?.toLowerCase() === "ok") {
      return {
        ok: true,
        mode: "live",
        redirectUrl: parsed.browserurl,
        pollUrl: parsed.pollurl,
        providerRef: parsed.paynowreference,
      };
    }
    return { ok: false, mode: "live", error: parsed.error || "Paynow error" };
  } catch (e) {
    return { ok: false, mode: "live", error: (e as Error).message };
  }
}

export interface VerifyResult {
  paid: boolean;
  status: string;
  raw?: Record<string, string>;
}

/** Poll Paynow (or simulate) to verify payment status. */
export async function verifyPaynowPayment(
  pollUrl: string,
): Promise<VerifyResult> {
  const config = getPaynowConfig();
  if (config.mode === "development" || pollUrl.startsWith("mock://")) {
    return { paid: true, status: "Paid" };
  }
  try {
    const res = await fetch(pollUrl);
    const parsed = parsePaynowResponse(await res.text());
    return {
      paid: parsed.status?.toLowerCase() === "paid",
      status: parsed.status || "Unknown",
      raw: parsed,
    };
  } catch (e) {
    return { paid: false, status: `Error: ${(e as Error).message}` };
  }
}

/** Parse a Paynow server-to-server result webhook payload. */
export function parsePaynowResult(
  body: Record<string, string>,
): { reference: string; paid: boolean; status: string } {
  return {
    reference: body.reference || "",
    paid: (body.status || "").toLowerCase() === "paid",
    status: body.status || "Unknown",
  };
}

export function paynowProviderStatus() {
  const config = getPaynowConfig();
  return {
    mode: config.mode,
    configured: Boolean(config.integrationId && config.integrationKey),
  };
}
