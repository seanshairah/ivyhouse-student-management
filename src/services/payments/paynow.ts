import crypto from "crypto";
import { platform } from "@/core/platform";
import { CURRENCY } from "@/core/billing/pricing";

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

/**
 * Which network each mobile-money rail actually runs on.
 *
 * EcoCash is Econet, OneMoney is NetOne. Sending an EcoCash prompt to a NetOne
 * number cannot succeed — but Paynow accepts the request, issues a poll URL,
 * and only then reports it "Cancelled" seconds later, which reads to the
 * student as if they declined something they never even saw. Catching the
 * mismatch here turns a mystery into a sentence they can act on.
 *
 * InnBucks is a wallet rather than a network rail, so no prefix rule applies.
 */
const NETWORK_PREFIXES: Record<string, { prefixes: string[]; network: string }> = {
  ecocash: { prefixes: ["077", "078"], network: "Econet" },
  onemoney: { prefixes: ["071"], network: "NetOne" },
};

/**
 * Is this number usable for the chosen rail?
 *
 * Deliberately only rejects what is definitely wrong — a well-formed number on
 * the right network still may not be a registered wallet, and only the network
 * itself can answer that. This is a cheap pre-check, not a guarantee.
 */
export function checkMobileNumber(
  phone: string,
  method: MobileMethod,
): { ok: true } | { ok: false; error: string } {
  const local = toLocalZwPhone(phone);
  if (local.length !== 10 || !local.startsWith("0")) {
    return {
      ok: false,
      error: "That doesn't look like a Zimbabwean mobile number. Enter it as 07XXXXXXXX.",
    };
  }
  const rail = NETWORK_PREFIXES[method];
  if (rail && !rail.prefixes.some((p) => local.startsWith(p))) {
    const label = method === "ecocash" ? "EcoCash" : "OneMoney";
    return {
      ok: false,
      error:
        `${label} only works on ${rail.network} numbers ` +
        `(${rail.prefixes.join(" or ")}). Check the number, or pay online instead.`,
    };
  }
  return { ok: true };
}

/**
 * A destination number safe to store and show back.
 *
 * Kept so a failed prompt can be diagnosed at all: when a payment came back
 * "Cancelled" seconds after being sent, the single most useful question is
 * "which number did we actually send it to" — and that was unanswerable,
 * because nothing recorded it. Masked rather than whole: enough to recognise a
 * wrong or placeholder number, not a fresh copy of every payer's phone number
 * sitting in the payments table.
 */
export function maskPhone(phone: string): string {
  const p = toLocalZwPhone(phone);
  if (p.length < 7) return "***";
  return `${p.slice(0, 3)}***${p.slice(-4)}`;
}

/**
 * A stable, non-reversible identifier for a destination number.
 *
 * Used as a rate-limit bucket so prompts aimed at one phone can be throttled
 * no matter which account sends them — without keeping a list of the phone
 * numbers being protected, which would hand an attacker who reached the
 * database exactly the thing the throttle exists to defend.
 */
/**
 * Does this look like filler rather than someone's actual number?
 *
 * Seeded and imported records carry numbers like 0771234567 — well-formed,
 * on the right network, and completely unreachable. Pre-filling one into the
 * payment dialog turns it into the default destination: the prompt goes
 * nowhere, the network rejects it instantly, and the student is told the
 * payment was "cancelled" by someone who never saw it. That is exactly how
 * the first live EcoCash test failed.
 *
 * Used ONLY to decide whether to pre-fill the field — never to block a number.
 * Someone whose real number happens to look tidy can still type it in, and
 * Paynow's own test numbers (0771111111 and friends) stay usable.
 */
export function looksLikePlaceholderPhone(phone: string | null | undefined): boolean {
  const local = toLocalZwPhone(phone ?? "");
  if (local.length !== 10) return true; // malformed is no better than filler
  const subscriber = local.slice(3); // drop the 07x network prefix

  if (/^(\d)\1+$/.test(subscriber)) return true; // 1111111, 0000000
  // Straight runs in either direction: 1234567, 7654321.
  const ascending = subscriber.split("").every((d, i, a) => i === 0 || +d === +a[i - 1] + 1);
  const descending = subscriber.split("").every((d, i, a) => i === 0 || +d === +a[i - 1] - 1);
  return ascending || descending;
}

export function phoneBucket(phone: string): string {
  return crypto
    .createHash("sha256")
    .update(toLocalZwPhone(phone))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Reserved and non-routable TLDs. Paynow validates the address it is given and
 * rejects these outright, which surfaces as "The authemail field is required
 * for remote transactions" — an error that reads as if we sent nothing.
 */
const UNDELIVERABLE_TLDS = ["test", "local", "localhost", "invalid", "example"];

function isDeliverableEmail(value: string | undefined | null): boolean {
  const email = (value ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const tld = email.split(".").pop() ?? "";
  return !UNDELIVERABLE_TLDS.includes(tld);
}

/**
 * The address Paynow is told to send its confirmation to.
 *
 * Paynow requires this on every remote (mobile-money) transaction and refuses
 * anything it considers undeliverable. Two rules apply:
 *
 *  1. While the merchant account is in TEST mode, Paynow only accepts the
 *     merchant's own registered email. That is what PAYNOW_AUTH_EMAIL is for —
 *     set it to the merchant address and every test transaction uses it.
 *  2. Otherwise use the payer's own address, so the confirmation reaches them —
 *     but only if it is actually deliverable. A seeded or placeholder address
 *     on a reserved TLD would be rejected and take the whole payment with it,
 *     so fall back to the platform's contact address rather than fail.
 */
export function resolveAuthEmail(payerEmail?: string | null): string {
  const configured = process.env.PAYNOW_AUTH_EMAIL?.trim();
  if (configured) return configured;
  if (isDeliverableEmail(payerEmail)) return payerEmail!.trim();
  return platform().contact.email;
}

/**
 * A second address to try when Paynow rejects the first one.
 *
 * Setting PAYNOW_AUTH_EMAIL to an address Paynow does not accept took the
 * entire web checkout down — it had been working using each payer's own
 * address, and one wrong environment variable silently broke every payment.
 * A misconfigured setting should degrade, not stop people paying, so on an
 * authemail rejection we fall back to the payer's own deliverable address and
 * try once more.
 *
 * Returns null when there is nothing different worth trying.
 */
function authEmailFallback(payerEmail: string | null | undefined, used: string): string | null {
  const candidates = [payerEmail?.trim(), platform().contact.email];
  for (const c of candidates) {
    if (c && c !== used && isDeliverableEmail(c)) return c;
  }
  return null;
}

/**
 * Did Paynow reject us over the authemail field, in a way a different address
 * could actually fix?
 *
 * In test mode Paynow requires the merchant's OWN registered address and says
 * so. Retrying with the payer's address cannot satisfy that, so a retry is a
 * wasted round-trip — the only fix is setting PAYNOW_AUTH_EMAIL correctly, or
 * the merchant account leaving test mode.
 */
function isAuthEmailRejection(raw: string | undefined): boolean {
  const s = (raw ?? "").toLowerCase();
  if (!s.includes("authemail")) return false;
  if (s.includes("test mode") || s.includes("must match")) return false;
  return true;
}

/**
 * Turn a Paynow API error into something a student can act on.
 *
 * These strings were being shown to students verbatim. "The authemail field is
 * required for remote transactions" tells a payer nothing, and worse, implies
 * they did something wrong when the cause is our configuration or the
 * merchant's account status.
 */
export function friendlyPaynowError(raw: string | undefined): string {
  const s = (raw ?? "").toLowerCase();

  // Test mode: Paynow accepts only the merchant's own registered address, and
  // says so explicitly. This is configuration, not something the payer did.
  if (s.includes("test mode") || (s.includes("authemail") && s.includes("match"))) {
    return (
      "Online payments are still in test mode with the payment provider, so " +
      "this can't be completed yet. Please pay at the office for now; no money " +
      "has left your account."
    );
  }
  if (s.includes("authemail")) {
    return (
      "Payments aren't set up correctly yet — the address this platform gives " +
      "the payment provider isn't accepted. Please tell the office; no money " +
      "has left your account."
    );
  }
  if (s.includes("testing") || s.includes("cannot accept payments")) {
    return (
      "Online payments are not live yet — the payment provider still has this " +
      "account in testing. Please pay at the office for now; no money has left " +
      "your account."
    );
  }
  if (s.includes("invalid") && s.includes("phone")) {
    return "That mobile number wasn't accepted. Check it and try again.";
  }
  if (s.includes("insufficient")) {
    return "There wasn't enough balance in the wallet to complete this payment.";
  }
  if (!raw) return "We couldn't start the payment. Please try again in a moment.";

  // Unrecognised: still don't leak raw API text to a student.
  return "We couldn't start the payment just now. Please try again, or contact the office if it keeps happening.";
}

/**
 * The only currency this platform bills, collects or reports in.
 *
 * Paynow does not take a currency on the wire — an integration IS a currency.
 * Each one is bound to a single merchant account, so which account the money
 * lands in is decided entirely by the integration ID we sign the request with.
 * Point PAYNOW_INTEGRATION_ID at a ZWG integration and every payment quietly
 * settles into a ZWG account while the whole interface still says "$".
 *
 * There is therefore nothing to send and nothing to negotiate; the only useful
 * guarantee is that the platform refuses to run against anything else. Rent and
 * transport are priced in USD, receipts are issued in USD, and the integration
 * has to be the USD one.
 */
export const PAYNOW_CURRENCY = CURRENCY;

export interface PaynowConfig {
  integrationId: string;
  integrationKey: string;
  returnUrl: string;
  resultUrl: string;
  mode: "development" | "live";
  /** Always "USD". Present so callers can label amounts from the config. */
  currency: typeof PAYNOW_CURRENCY;
}

export function getPaynowConfig(): PaynowConfig {
  // A currency-specific pair wins, so the USD integration can be set
  // explicitly and be obviously the USD one to whoever reads the environment
  // next. The generic names stay supported for existing deployments.
  const integrationId =
    process.env.PAYNOW_USD_INTEGRATION_ID || process.env.PAYNOW_INTEGRATION_ID || "";
  const integrationKey =
    process.env.PAYNOW_USD_INTEGRATION_KEY || process.env.PAYNOW_INTEGRATION_KEY || "";
  const hasCredentials = Boolean(integrationId && integrationKey);

  // Fail closed on a currency this platform does not price in. Changing this
  // variable cannot change where the money goes — only the integration can do
  // that — so a value other than USD means the environment believes something
  // that isn't true, and the honest response is to stop rather than to take
  // payments under it.
  const requested = (process.env.PAYNOW_CURRENCY || PAYNOW_CURRENCY).trim().toUpperCase();
  if (requested !== PAYNOW_CURRENCY) {
    throw new Error(
      `PAYNOW_CURRENCY is set to "${requested}". This platform prices, collects ` +
        `and receipts strictly in ${PAYNOW_CURRENCY}. Point PAYNOW_USD_INTEGRATION_ID / ` +
        `PAYNOW_USD_INTEGRATION_KEY at the USD integration in your Paynow ` +
        `dashboard — the integration is what selects the receiving account.`,
    );
  }

  // Fail closed in production.
  //
  // This used to silently fall back to "development" whenever the Paynow
  // credentials were missing — and in development mode verifyPaynowPayment()
  // reports every payment as Paid without contacting anyone. A production
  // deploy that lost its Paynow env vars would therefore have marked every
  // student's rent as settled for free, and looked healthy doing it.
  if (process.env.NODE_ENV === "production" && !hasCredentials) {
    throw new Error(
      "PAYNOW_INTEGRATION_ID / PAYNOW_INTEGRATION_KEY are not set. Refusing to " +
        "run in mock payment mode in production — mock mode settles every " +
        "payment as paid without taking money.",
    );
  }

  // returnUrl/resultUrl used to default straight to a literal localhost
  // address. That is invisible in every way that matters — the integration
  // request still succeeds, the student still reaches Paynow's checkout, the
  // payment still gets taken — right up until Paynow's servers try to POST the
  // result to a URL that only exists on a developer's laptop. APP_URL is
  // already the deployment's real public URL everywhere else in this codebase
  // (receipt links, password resets, application emails), so it is the right
  // fallback here too, ahead of the hardcoded localhost default.
  const appUrl = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  const returnUrl =
    process.env.PAYNOW_RETURN_URL ||
    (appUrl ? `${appUrl}/student/payments/return` : "http://localhost:3000/student/payments/return");
  const resultUrl =
    process.env.PAYNOW_RESULT_URL ||
    (appUrl ? `${appUrl}/api/payments/paynow/result` : "http://localhost:3000/api/payments/paynow/result");

  // Not fail-closed like the credentials check above: a payment initiated
  // under this can still be recovered by reconcileAndExpirePayments(), so
  // refusing to run entirely would be a worse outage than the bug it guards
  // against. Loud enough to find in the deploy's logs regardless.
  if (process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(resultUrl)) {
    console.error(
      "[paynow] resultUrl resolves to localhost in production — Paynow's " +
        "servers cannot reach it, so payments will only settle via the daily " +
        "reconciliation sweep, never immediately. Set APP_URL or PAYNOW_RESULT_URL.",
    );
  }

  return {
    integrationId,
    integrationKey,
    returnUrl,
    resultUrl,
    mode: process.env.PAYNOW_MODE === "live" && hasCredentials ? "live" : "development",
    currency: PAYNOW_CURRENCY,
  };
}

/**
 * Paynow does not append anything to `returnurl` when it redirects the
 * customer's browser back — confirmed by Paynow's own support staff on their
 * developer forum: "It is expected that you will set enough information to be
 * able to identify the transaction... returnurl: mywebsite.com/check/?myref=…".
 *
 * Every returnurl in this codebase used to be one fixed string, shared by
 * every transaction. The return page reads `?ref=` to know which payment to
 * verify; with nothing ever appended, it never had one, and could not settle
 * ANY payment via the browser return — production confirms this: across both
 * platforms exactly one payment has ever reached PAID, and only because it was
 * force-reconciled by hand, three hours after the student paid.
 */
function returnUrlFor(baseUrl: string, reference: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}ref=${encodeURIComponent(reference)}`;
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
  /** Student-facing message. Safe to display. */
  error?: string;
  /** Paynow's own wording, for logs and the audit trail — never shown to a student. */
  providerError?: string;
  /** True when the outcome is uncertain (network/timeout) — NOT a hard decline. */
  ambiguous?: boolean;
  mode: "development" | "live";
}

// Paynow signs requests with a SHA512 hash of concatenated values + key.
function paynowHash(values: Record<string, string>, key: string): string {
  const concat = Object.values(values).join("") + key;
  return crypto.createHash("sha512").update(concat).digest("hex").toUpperCase();
}

/**
 * Verify the hash Paynow puts on data it sends US.
 *
 * We were signing our outbound requests but never checking the signature on
 * anything coming back, so a poll response was trusted purely because it
 * arrived over TLS. Paynow builds the hash from every field except `hash`
 * itself, concatenated in order, with the integration key appended.
 *
 * Returns:
 *   "valid"    — hash present and correct
 *   "invalid"  — hash present and wrong: treat the payload as hostile
 *   "absent"   — no hash field; caller decides (we log and fall back to TLS)
 *
 * Compared in constant time so this can't be used as a timing oracle.
 */
export function verifyPaynowHash(
  payload: Record<string, string>,
  key: string,
): "valid" | "invalid" | "absent" {
  const provided = payload.hash;
  if (!provided) return "absent";
  if (!key) return "absent";

  const signed: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k.toLowerCase() === "hash") continue;
    signed[k] = v;
  }

  const expected = paynowHash(signed, key);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided.toUpperCase(), "utf8");
  if (a.length !== b.length) return "invalid";
  return crypto.timingSafeEqual(a, b) ? "valid" : "invalid";
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
  input: InitiatePaymentInput & { authEmailOverride?: string },
  retried = false,
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
      returnurl: returnUrlFor(config.returnUrl, input.reference),
      resulturl: config.resultUrl,
      authemail: input.authEmailOverride ?? resolveAuthEmail(input.email),
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
    const providerError = parsed.error || parsed.status || "Paynow error";

    // One retry with a different address if that is what it objected to.
    if (isAuthEmailRejection(providerError) && !retried) {
      const fallback = authEmailFallback(input.email, values.authemail);
      if (fallback) {
        console.warn("[paynow] authemail rejected, retrying with payer address", {
          rejected: values.authemail,
        });
        return createPaynowPayment({ ...input, authEmailOverride: fallback }, true);
      }
    }

    return {
      ok: false,
      mode: "live",
      error: friendlyPaynowError(providerError),
      providerError,
    };
  } catch (e) {
    // Network/timeout: the request MAY have reached Paynow. Ambiguous, not failed.
    return { ok: false, ambiguous: true, mode: "live", error: (e as Error).message };
  }
}

/** Mobile-money rails Paynow can push a USSD prompt to. */
export type MobileMethod = "ecocash" | "onemoney" | "innbucks";

export interface InitiateMobileInput extends InitiatePaymentInput {
  phone: string;
  method?: MobileMethod;
}

export interface InitiateMobileResult {
  ok: boolean;
  pollUrl?: string;
  providerRef?: string;
  instructions?: string;
  /** Student-facing message. Safe to display. */
  error?: string;
  /** Paynow's own wording, for logs and the audit trail — never shown to a student. */
  providerError?: string;
  /** True when the outcome is uncertain (network/timeout) — NOT a hard decline. */
  ambiguous?: boolean;
  mode: "development" | "live";
}

/**
 * Create a Paynow *mobile-money (Express)* payment — sends a USSD prompt
 * directly to the payer's phone (e.g. EcoCash). Returns a poll URL to check
 * status. In development mode this is mocked and auto-approves on poll.
 */
export async function createPaynowMobilePayment(
  input: InitiateMobileInput & { authEmailOverride?: string },
  retried = false,
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
      // Express (EcoCash/OneMoney) never redirects the browser — Paynow POSTs
      // straight to resulturl — but a per-transaction returnurl is harmless to
      // send and keeps this identical to the web path for any method that does.
      returnurl: returnUrlFor(config.returnUrl, input.reference),
      resulturl: config.resultUrl,
      authemail: input.authEmailOverride ?? resolveAuthEmail(input.email),
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
    const providerError =
      parsed.error || parsed.status || "Paynow declined the request.";

    // Same one-shot retry as the web flow: a wrong PAYNOW_AUTH_EMAIL must not
    // stop people paying when the payer's own address would be accepted.
    if (isAuthEmailRejection(providerError) && !retried) {
      const fallback = authEmailFallback(input.email, values.authemail);
      if (fallback) {
        console.warn("[paynow] authemail rejected, retrying with payer address", {
          rejected: values.authemail,
        });
        return createPaynowMobilePayment({ ...input, authEmailOverride: fallback }, true);
      }
    }

    return {
      ok: false,
      mode: "live",
      error: friendlyPaynowError(providerError),
      providerError,
    };
  } catch (e) {
    // Network/timeout: the prompt MAY have been sent. Ambiguous, not failed.
    return { ok: false, ambiguous: true, mode: "live", error: (e as Error).message };
  }
}

export type PaynowOutcome =
  | "paid"
  | "pending"
  | "processing"
  | "cancelled"
  | "refunded"
  | "failed";

/**
 * Map a raw Paynow status string to a coarse outcome. Anything we don't
 * explicitly recognise as settled stays "pending" — we NEVER treat an unknown
 * status as paid, so a payment can only be marked paid on an explicit Paynow
 * "Paid"/"Delivered"/"Awaiting Delivery" (money received) status.
 */
export function classifyPaynowStatus(raw: string): PaynowOutcome {
  const s = (raw || "").toLowerCase();
  if (s.includes("paid") || s.includes("awaiting delivery") || s.includes("delivered"))
    return "paid";
  if (s.includes("refund") || s.includes("revers")) return "refunded";
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("disput") || s.includes("fail") || s.includes("declin"))
    return "failed";
  if (s.includes("process")) return "processing";
  // "Sent", "Created", "Pending" or anything unrecognised → not yet paid.
  return "pending";
}

export interface VerifyResult {
  paid: boolean;
  status: string;
  outcome: PaynowOutcome;
  raw?: Record<string, string>;
  /**
   * Did Paynow actually answer, with something we could trust?
   *
   * A network failure and a genuine "not paid yet" both come back as
   * `outcome: "pending"`, which is the right call for a student watching a
   * spinner — but not for anything that writes a payment off. Cancelling a
   * payment because we could not reach Paynow would discard money that has in
   * fact been collected, so a caller about to do that must be able to tell the
   * two apart.
   */
  reachable: boolean;
}

/** Poll Paynow (or simulate) to verify payment status. */
export async function verifyPaynowPayment(
  pollUrl: string,
): Promise<VerifyResult> {
  const config = getPaynowConfig();
  if (config.mode === "development") {
    return { paid: true, status: "Paid", outcome: "paid", reachable: true };
  }
  // A mock/empty poll URL in LIVE mode cannot be verified against Paynow —
  // never treat it as paid, or we'd settle a payment nobody actually made.
  if (!pollUrl || pollUrl.startsWith("mock://")) {
    return { paid: false, status: "Unverifiable", outcome: "pending", reachable: false };
  }
  try {
    const res = await fetch(pollUrl);
    const parsed = parsePaynowResponse(await res.text());
    const status = parsed.status || "Unknown";

    // The poll response is what promotes a payment to PAID, so its signature is
    // the one that matters most. A wrong hash means the body did not come from
    // Paynow — refuse to act on it rather than settling on a forged "Paid".
    const signature = verifyPaynowHash(parsed, config.integrationKey);
    if (signature === "invalid") {
      console.error("[paynow] poll response failed hash verification", {
        pollUrl,
        status,
      });
      return {
        paid: false,
        status: "Signature verification failed",
        outcome: "pending",
        raw: parsed,
        // Unsigned or wrongly signed: we have no trustworthy answer at all.
        reachable: false,
      };
    }
    if (signature === "absent") {
      // Paynow normally signs poll responses. Missing means an unexpected
      // payload shape, so note it — but TLS still authenticated the origin, and
      // failing hard here would strand real payments.
      console.warn("[paynow] poll response carried no hash", { pollUrl, status });
    }

    const outcome = classifyPaynowStatus(status);
    return { paid: outcome === "paid", status, outcome, raw: parsed, reachable: true };
  } catch (e) {
    return {
      paid: false,
      status: `Error: ${(e as Error).message}`,
      outcome: "pending",
      reachable: false,
    };
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
