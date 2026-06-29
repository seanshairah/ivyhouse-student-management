import { Resend } from "resend";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { MessageStatus } from "@prisma/client";
import {
  renderEmail,
  type EmailTemplateName,
  type TemplateData,
} from "./templates";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  template?: string;
}

export interface EmailResult {
  ok: boolean;
  provider: "resend" | "smtp" | "none";
  error?: string;
}

const EMAIL_FROM =
  process.env.EMAIL_FROM || "Ivy House <no-reply@ivyhouse.local>";

function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

// ── Provider: Resend (primary) ────────────────────────────────
export async function sendWithResend(
  input: SendEmailInput,
): Promise<EmailResult> {
  if (!resendConfigured()) {
    return { ok: false, provider: "resend", error: "RESEND_API_KEY not set" };
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (error) return { ok: false, provider: "resend", error: error.message };
    return { ok: true, provider: "resend" };
  } catch (e) {
    return { ok: false, provider: "resend", error: (e as Error).message };
  }
}

// ── Provider: SMTP (fallback) ─────────────────────────────────
export async function sendWithSMTP(
  input: SendEmailInput,
): Promise<EmailResult> {
  if (!smtpConfigured()) {
    return { ok: false, provider: "smtp", error: "SMTP not configured" };
  }
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    return { ok: true, provider: "smtp" };
  } catch (e) {
    return { ok: false, provider: "smtp", error: (e as Error).message };
  }
}

/**
 * Core email send: tries Resend first, falls back to SMTP.
 * In development with no providers configured, logs to console and records
 * the attempt so workflows remain testable end-to-end.
 */
export async function sendEmail(input: SendEmailInput): Promise<EmailResult> {
  let result: EmailResult = { ok: false, provider: "none" };

  if (resendConfigured()) {
    result = await sendWithResend(input);
    if (!result.ok && smtpConfigured()) {
      result = await sendWithSMTP(input);
    }
  } else if (smtpConfigured()) {
    result = await sendWithSMTP(input);
  } else {
    // Development mock mode — no provider configured.
    console.info(
      `📧 [DEV EMAIL] to=${input.to} subject="${input.subject}" (no provider configured — logged only)`,
    );
    result = { ok: true, provider: "none" };
  }

  await prisma.emailLog
    .create({
      data: {
        to: input.to,
        subject: input.subject,
        template: input.template,
        provider: result.provider,
        status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED,
        error: result.error,
      },
    })
    .catch(() => undefined);

  return result;
}

/** Send a templated email by name. */
export async function sendTemplatedEmail(
  to: string,
  subject: string,
  template: EmailTemplateName,
  data: TemplateData,
): Promise<EmailResult> {
  const html = renderEmail(template, data);
  return sendEmail({ to, subject, html, template });
}

export function emailProviderStatus() {
  return {
    resend: resendConfigured(),
    smtp: smtpConfigured(),
    mode:
      resendConfigured() || smtpConfigured() ? "live" : "development (mock)",
  };
}
