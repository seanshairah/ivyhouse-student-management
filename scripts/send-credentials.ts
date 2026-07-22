/**
 * Deliver login credentials to imported students — the rotate-on-send way.
 *
 * Stored passwords are hashed and can't be read back, so "send credentials"
 * ROTATES each student to a fresh temporary password, delivers it, and only
 * then stamps StudentProfile.credentialsSentAt. Re-runs target ONLY students
 * with credentialsSentAt IS NULL, so nobody is re-rotated after they've been
 * notified. Throttled + retry-with-backoff for SMS rate limits; aborts early
 * if the very first send fails on auth (so we don't rotate everyone with no
 * delivery).
 *
 * Runs against production over Neon's HTTP driver (TCP is blocked here) and
 * calls Resend + SMS Pop directly. Reuses the app's branded templates.
 *
 *   Required env: DATABASE_URL, APP_URL
 *   For SMS:      SMSPOP_API_KEY, SMSPOP_SENDER_ID, [SMSPOP_BASE_URL]
 *   For email:    RESEND_API_KEY, EMAIL_FROM  (needs a verified domain)
 *   Flags:        SEND=1  actually rotate + send (default: dry run)
 *                 CHANNELS=sms|email|both  (default: both when configured)
 */
import { randomInt } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { renderEmail } from "../src/services/email/templates";
import { SMS_TEMPLATES, EMAIL_SUBJECTS } from "../src/constants/messages";
import { renderTemplate } from "../src/lib/utils";

const DATABASE_URL = req("DATABASE_URL");
const APP_URL = process.env.APP_URL || "https://ivyproperties.co.zw";
const LOGIN_URL = `${APP_URL.replace(/\/$/, "")}/auth/login`;
const DO_SEND = process.env.SEND === "1";
const CHANNELS = (process.env.CHANNELS || "both").toLowerCase();
const EMAIL_FROM = process.env.EMAIL_FROM || "Ivy House <no-reply@ivyhouse.local>";

const wantSms = CHANNELS === "both" || CHANNELS === "sms";
const wantEmail = CHANNELS === "both" || CHANNELS === "email";
const sql = neon(DATABASE_URL);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function tempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(alphabet.length)];
  return `Ivy-${s}`;
}
function normalizeZwPhone(phone: string): string {
  let p = (phone || "").replace(/[^\d]/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "263" + p.slice(1);
  else if (p.startsWith("7") && p.length === 9) p = "263" + p;
  return p;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) return { ok: false, status: 0, error: "RESEND_API_KEY not set" };
  try {
    const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
    return error ? { ok: false, status: 0, error: error.message } : { ok: true, status: 200 };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}
async function sendSms(to: string, body: string) {
  const key = process.env.SMSPOP_API_KEY;
  const sender = process.env.SMSPOP_SENDER_ID;
  if (!key || !sender) return { ok: false, status: 0, error: "SMS Pop not configured" };
  const base = process.env.SMSPOP_BASE_URL || "https://smspop.co.zw/api";
  try {
    const res = await fetch(`${base}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        name: `Ivy creds ${new Date().toISOString().slice(0, 16)}`,
        message: body,
        sender_id: sender,
        contact_import_method: "manual",
        manual_contacts: normalizeZwPhone(to),
      }),
    });
    let payload: any = null;
    try { payload = await res.json(); } catch {}
    if (!res.ok || payload?.success === false) {
      return { ok: false, status: res.status, error: payload?.message || payload?.error || `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

async function main() {
  await sql`ALTER TABLE "StudentProfile" ADD COLUMN IF NOT EXISTS "credentialsSentAt" timestamp`;

  const students = (await sql`
    SELECT sp.id, sp."fullName", sp.email, sp.phone
    FROM "StudentProfile" sp JOIN "User" u ON u.id = sp."userId"
    WHERE u.role = 'STUDENT' AND sp."credentialsSentAt" IS NULL
    ORDER BY sp."createdAt" ASC
  `) as { id: string; fullName: string; email: string; phone: string }[];

  console.log("── Send credentials ──");
  console.log(`Mode: ${DO_SEND ? "LIVE" : "DRY RUN"} | channels: ${wantSms ? "sms " : ""}${wantEmail ? "email" : ""}`);
  console.log(`Not-yet-notified students: ${students.length}`);
  console.log(`SMS Pop: ${process.env.SMSPOP_API_KEY ? "configured" : "MISSING"} | Resend: ${resend ? "configured" : "MISSING"}`);

  if (!DO_SEND) {
    const s = students[0];
    if (s)
      console.log(
        "\nExample SMS:\n  " +
          renderTemplate(SMS_TEMPLATES.credentialsIssued, {
            studentName: s.fullName, email: s.email, password: "Ivy-XXXXXX", loginUrl: LOGIN_URL,
          }),
      );
    console.log("\nDRY RUN — re-run with SEND=1 to rotate passwords and deliver.");
    return;
  }

  let sent = 0, failed = 0;
  const fails: string[] = [];

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    // Rotate BEFORE sending — the new password goes out in the message.
    const pw = tempPassword();
    const hash = await bcrypt.hash(pw, 10);
    await sql`UPDATE "User" SET "passwordHash" = ${hash}, "mustChangePassword" = true, "updatedAt" = now()
              WHERE id = (SELECT "userId" FROM "StudentProfile" WHERE id = ${s.id})`;

    const data = { studentName: s.fullName, email: s.email, password: pw, loginUrl: LOGIN_URL };
    let smsOk = !wantSms;
    let emailOk = !wantEmail;
    let firstErr: { status: number; error: string } | null = null;

    if (wantSms && s.phone) {
      let r, attempt = 0;
      while (true) {
        r = await sendSms(s.phone, renderTemplate(SMS_TEMPLATES.credentialsIssued, data));
        if (r.ok || !/too many/i.test(r.error || "") || attempt >= 5) break;
        attempt++;
        await sleep(5000 * attempt); // back off on rate limit
      }
      smsOk = r.ok;
      if (!r.ok) firstErr = { status: r.status, error: r.error || "sms failed" };
    }
    if (wantEmail) {
      const r = await sendEmail(s.email, EMAIL_SUBJECTS.credentialsIssued, renderEmail("credentialsIssued", data));
      emailOk = r.ok;
      if (!r.ok && !firstErr) firstErr = { status: r.status, error: r.error || "email failed" };
    }

    const delivered = (wantSms ? smsOk : false) || (wantEmail ? emailOk : false);
    if (delivered) {
      await sql`UPDATE "StudentProfile" SET "credentialsSentAt" = now() WHERE id = ${s.id}`;
      sent++;
      console.log(`  ✓ ${i + 1}/${students.length} ${s.fullName}`);
    } else {
      failed++;
      fails.push(`${s.fullName} (${s.phone}): ${firstErr?.error}`);
      console.log(`  ✗ ${i + 1}/${students.length} ${s.fullName}: ${firstErr?.error}`);
      // Abort if the very first send fails on auth — don't rotate everyone.
      if (i === 0 && firstErr && [401, 403].includes(firstErr.status)) {
        console.log("First send failed on auth — aborting before rotating the rest.");
        break;
      }
    }
    await sleep(2500); // throttle to respect provider rate limits
  }

  console.log(`\nDONE. Delivered: ${sent}, failed: ${failed}.`);
  if (fails.length) console.log("Failures:\n  " + fails.join("\n  "));
}

main().catch((e) => {
  console.error("send-credentials failed:", e);
  process.exit(1);
});
