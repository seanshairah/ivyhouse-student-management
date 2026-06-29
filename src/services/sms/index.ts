import { prisma } from "@/lib/prisma";
import { MessageStatus } from "@prisma/client";
import { renderTemplate } from "@/lib/utils";
import { SMS_TEMPLATES } from "@/constants/messages";

export interface SmsResult {
  ok: boolean;
  provider: string;
  error?: string;
}

/**
 * Provider adapter contract. New providers (SMS Pop, Twilio, Africa's Talking,
 * etc.) implement this interface — the rest of the app never depends on a
 * specific vendor.
 */
export interface SmsProvider {
  name: string;
  isConfigured(): boolean;
  send(to: string, body: string): Promise<SmsResult>;
  /** Optional: send one identical message to many recipients in a single call. */
  sendBulk?(to: string[], body: string): Promise<SmsResult>;
}

/**
 * Normalise a phone number to the MSISDN format SMS Pop expects
 * (country code + number, no '+'), e.g. "+263 77 111 1111" -> "263771111111",
 * "0771234567" -> "263771234567".
 */
export function normalizeZwPhone(phone: string): string {
  let p = (phone || "").replace(/[^\d]/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "263" + p.slice(1);
  else if (p.startsWith("7") && p.length === 9) p = "263" + p;
  return p;
}

// ── SMS Pop adapter (https://smspop.co.zw) ────────────────────
const smsPopProvider: SmsProvider = {
  name: "smspop",
  isConfigured() {
    return Boolean(process.env.SMSPOP_API_KEY && process.env.SMSPOP_SENDER_ID);
  },
  async send(to, body) {
    return this.sendBulk!([to], body);
  },
  async sendBulk(to, body) {
    const base = process.env.SMSPOP_BASE_URL || "https://smspop.co.zw/api";
    const contacts = to.map(normalizeZwPhone).filter(Boolean).join(", ");
    try {
      const res = await fetch(`${base}/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${process.env.SMSPOP_API_KEY}`,
        },
        body: JSON.stringify({
          name: `SHM ${new Date().toISOString().slice(0, 16)}`,
          message: body,
          sender_id: process.env.SMSPOP_SENDER_ID,
          contact_import_method: "manual",
          manual_contacts: contacts,
        }),
      });

      let payload: any = null;
      try {
        payload = await res.json();
      } catch {
        /* non-JSON response */
      }

      if (!res.ok || payload?.success === false) {
        const error =
          payload?.message ||
          payload?.error ||
          `SMS Pop HTTP ${res.status}`;
        return { ok: false, provider: this.name, error };
      }
      // If the provider reports per-contact failures, treat all-failed as failure.
      if (payload?.summary && payload.summary.sent === 0 && payload.summary.failed > 0) {
        return { ok: false, provider: this.name, error: "All messages failed to send" };
      }
      return { ok: true, provider: this.name };
    } catch (e) {
      return { ok: false, provider: this.name, error: (e as Error).message };
    }
  },
};

// ── Generic BulkSMS HTTP adapter (kept as an alternative provider) ──
const bulkSmsProvider: SmsProvider = {
  name: "bulksms",
  isConfigured() {
    return Boolean(process.env.BULKSMS_API_KEY && process.env.BULKSMS_BASE_URL);
  },
  async send(to, body) {
    try {
      const res = await fetch(`${process.env.BULKSMS_BASE_URL}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.BULKSMS_API_KEY}`,
        },
        body: JSON.stringify({
          to: normalizeZwPhone(to),
          from: process.env.BULKSMS_SENDER_ID || "SHousing",
          body,
        }),
      });
      if (!res.ok) {
        return { ok: false, provider: this.name, error: `HTTP ${res.status}` };
      }
      return { ok: true, provider: this.name };
    } catch (e) {
      return { ok: false, provider: this.name, error: (e as Error).message };
    }
  },
};

// ── Development mock provider ──────────────────────────────────
const mockProvider: SmsProvider = {
  name: "mock",
  isConfigured() {
    return true;
  },
  async send(to, body) {
    console.info(`📱 [DEV SMS] to=${to} body="${body}"`);
    return { ok: true, provider: "mock" };
  },
};

function activeProvider(): SmsProvider {
  if (smsPopProvider.isConfigured()) return smsPopProvider;
  if (bulkSmsProvider.isConfigured()) return bulkSmsProvider;
  return mockProvider;
}

/** Send a single SMS, logging the attempt. */
export async function sendSMS(to: string, body: string): Promise<SmsResult> {
  const provider = activeProvider();
  const result = await provider.send(to, body);
  await prisma.smsLog
    .create({
      data: {
        to,
        body,
        provider: result.provider,
        status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED,
        error: result.error,
      },
    })
    .catch(() => undefined);
  return result;
}

/**
 * Send the same message to many recipients. Uses the provider's native bulk
 * endpoint when available (e.g. SMS Pop campaigns), else falls back to a loop.
 */
export async function sendBulkSMS(
  recipients: string[],
  body: string,
): Promise<{ sent: number; failed: number; results: SmsResult[] }> {
  const provider = activeProvider();
  const targets = recipients.filter(Boolean);

  if (provider.sendBulk && targets.length > 1) {
    const result = await provider.sendBulk(targets, body);
    await prisma.$transaction(
      targets.map((to) =>
        prisma.smsLog.create({
          data: {
            to,
            body,
            provider: result.provider,
            status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED,
            error: result.error,
          },
        }),
      ),
    ).catch(() => undefined);
    return {
      sent: result.ok ? targets.length : 0,
      failed: result.ok ? 0 : targets.length,
      results: [result],
    };
  }

  const results: SmsResult[] = [];
  let sent = 0;
  let failed = 0;
  for (const to of targets) {
    const r = await sendSMS(to, body);
    results.push(r);
    r.ok ? sent++ : failed++;
  }
  return { sent, failed, results };
}

/** Send a status SMS using a named template. */
export async function sendStatusSMS(
  to: string,
  template: keyof typeof SMS_TEMPLATES,
  data: Record<string, string | number>,
): Promise<SmsResult> {
  const body = renderTemplate(SMS_TEMPLATES[template], data);
  return sendSMS(to, body);
}

export function smsProviderStatus() {
  const provider = activeProvider();
  return {
    provider: provider.name,
    configured: provider.name !== "mock",
    mode: provider.name === "mock" ? "development (mock)" : "live",
  };
}
