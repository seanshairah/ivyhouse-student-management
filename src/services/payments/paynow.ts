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
const PAYNOW_REMOTE_URL = "https://www.paynow.co.zw/interface/remotetransaction";

/** Paynow mobile-money expects the local MSISDN format, e.g. "0771234567". */
export function toLocalZwPhone(phone: string): string {
  let p = (phone || "").replace(/[^\d]/g, "");
  if (p.startsWith("263")) p = "0" + p.slice(3);
  else if (p.startsWith("7") && p.length === 9) p = "0" + p;
  return p;
}

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
  // Paynow returns a URL-encoded query string, e.g.
  //   status=Ok&browserurl=https%3A%2F%2F...&pollurl=...&hash=...
  // Some endpoints separate with newlines instead, so split on both.
  for (const pair of text.split(/[&\n\r]+/)) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim().toLowerCase();
    if (!key) continue;
    const rawVal = pair.slice(idx + 1).trim().replace(/\+/g, " ");
    let value = rawVal;
    try {
      value = decodeURIComponent(rawVal);
    } catch {
      /* leave value as-is if it isn't valid percent-encoding */
    }
    out[key] = value;
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
      authemail: process.env.PAYNOW_AUTH_EMAIL || input.email,
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
    return {
      ok: false,
      mode: "live",
      error: parsed.error || parsed.status || "Paynow error",
    };
  } catch (e) {
    return { ok: false, mode: "live", error: (e as Error).message };
  }
}

export interface InitiateMobileInput extends InitiatePaymentInput {
  phone: string;
  method?: "ecocash" | "onemoney" | "innbucks";
}

export interface InitiateMobileResult {
  ok: boolean;
  pollUrl?: string;
  providerRef?: string;
  instructions?: string;
  error?: string;
  mode: "development" | "live";
}

/**
 * Create a Paynow *mobile-money (Express)* payment — sends a USSD prompt
 * directly to the payer's phone (e.g. EcoCash). Returns a poll URL to check
 * status. In development mode this is mocked and auto-approves on poll.
 */
export async function createPaynowMobilePayment(
  input: InitiateMobileInput,
): Promise<InitiateMobileResult> {
  const config = getPaynowConfig();
  const method = input.method ?? "ecocash";

  if (config.mode === "development") {
    return {
      ok: true,
      mode: "development",
      pollUrl: `mock://poll/${input.reference}`,
      providerRef: `MOCK-${input.reference}`,
      instructions:
        "Development mode — no real prompt is sent; this auto-approves.",
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
      authemail: process.env.PAYNOW_AUTH_EMAIL || input.email,
      phone: toLocalZwPhone(input.phone),
      method,
      status: "Message",
    };
    values.hash = paynowHash(values, config.integrationKey);

    const res = await fetch(PAYNOW_REMOTE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: toUrlEncoded(values),
    });
    const parsed = parsePaynowResponse(await res.text());

    if (parsed.status?.toLowerCase() === "ok") {
      return {
        ok: true,
        mode: "live",
        pollUrl: parsed.pollurl,
        providerRef: parsed.paynowreference,
        instructions:
          parsed.instructions ||
          "Check your phone and enter your EcoCash PIN to approve the payment.",
      };
    }
    return {
      ok: false,
      mode: "live",
      error: parsed.error || parsed.status || "Paynow declined the request.",
    };
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
