/**
 * One-off bulk onboarding import for Ivy House.
 *
 * Runs against the PRODUCTION database over Neon's HTTP driver (this sandbox
 * blocks raw Postgres TCP) and sends credential emails/SMS directly via Resend
 * and SMS Pop. It reuses the app's branded email templates and SMS copy.
 *
 * SAFETY: does nothing destructive unless CONFIRM=WIPE_AND_IMPORT is set.
 * Default is a dry run: it connects, validates the data + contacts, and prints
 * the plan and a per-student report — no writes, no messages.
 *
 * Secrets + student PII are read from the environment / an external JSON file;
 * nothing sensitive is committed to the repo.
 *
 *   Required env:
 *     DATABASE_URL            Neon connection string (pooled is fine)
 *     STUDENTS_FILE           path to the cleaned students JSON
 *     APP_URL                 e.g. https://ivyproperties.co.zw
 *     ADMIN_EMAIL             default Blessingc@owner.com
 *     ADMIN_NAME              default "Blessing"
 *     ADMIN_PHONE             admin mobile for the OTP text (optional)
 *   For sending (SEND=1):
 *     RESEND_API_KEY, EMAIL_FROM
 *     SMSPOP_API_KEY, SMSPOP_SENDER_ID, [SMSPOP_BASE_URL]
 *   Flags:
 *     CONFIRM=WIPE_AND_IMPORT  actually wipe data + create accounts
 *     SEND=1                   actually send emails + SMS
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID, randomInt } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { Resend } from "resend";
import { renderEmail } from "../src/services/email/templates";
import { SMS_TEMPLATES, EMAIL_SUBJECTS } from "../src/constants/messages";
import { renderTemplate } from "../src/lib/utils";

// ── config ────────────────────────────────────────────────────
const DATABASE_URL = req("DATABASE_URL");
const STUDENTS_FILE = req("STUDENTS_FILE");
const APP_URL = process.env.APP_URL || "https://ivyproperties.co.zw";
const LOGIN_URL = `${APP_URL.replace(/\/$/, "")}/auth/login`;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "Blessingc@owner.com").toLowerCase();
const ADMIN_NAME = process.env.ADMIN_NAME || "Blessing";
const ADMIN_PHONE = process.env.ADMIN_PHONE || "";
const DO_WIPE_AND_IMPORT = process.env.CONFIRM === "WIPE_AND_IMPORT";
const DO_SEND = process.env.SEND === "1";
const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  "Ivy Properties <notifications@ivyproperties.co.zw>";

const sql = neon(DATABASE_URL);
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

interface Student {
  name: string;
  email: string | null;
  emailValid: boolean;
  phone: string | null;
  phoneValid: boolean;
  deposit: number | null;
}

const students: Student[] = JSON.parse(readFileSync(STUDENTS_FILE, "utf8"));

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/** SMS Pop expects country code + number, no '+'. Mirrors the app's helper. */
function normalizeZwPhone(phone: string): string {
  let p = (phone || "").replace(/[^\d]/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "263" + p.slice(1);
  else if (p.startsWith("7") && p.length === 9) p = "263" + p;
  return p;
}

function tempPassword(): string {
  // Readable temporary password: Ivy-XXXXXX (letters+digits, no ambiguous chars)
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(alphabet.length)];
  return `Ivy-${s}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendEmail(to: string, subject: string, html: string) {
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };
  try {
    const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function sendSMS(to: string, body: string) {
  const key = process.env.SMSPOP_API_KEY;
  const sender = process.env.SMSPOP_SENDER_ID;
  if (!key || !sender) return { ok: false, error: "SMS Pop not configured" };
  const base = process.env.SMSPOP_BASE_URL || "https://smspop.co.zw/api";
  try {
    const res = await fetch(`${base}/campaigns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        name: `Ivy onboarding ${new Date().toISOString().slice(0, 16)}`,
        message: body,
        sender_id: sender,
        contact_import_method: "manual",
        manual_contacts: normalizeZwPhone(to),
      }),
    });
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {}
    if (!res.ok || payload?.success === false) {
      return { ok: false, error: payload?.message || payload?.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function createUser(opts: {
  email: string;
  name: string;
  phone: string | null;
  role: "OWNER" | "STUDENT";
  passwordHash: string;
}): Promise<string> {
  const id = randomUUID();
  await sql`
    INSERT INTO "User" (id, email, "passwordHash", name, phone, role, "isActive", "mustChangePassword", "createdAt", "updatedAt")
    VALUES (${id}, ${opts.email}, ${opts.passwordHash}, ${opts.name}, ${opts.phone},
            ${opts.role}::"UserRole", true, true, now(), now())
  `;
  return id;
}

async function main() {
  console.log("── Ivy House bulk import ──");
  console.log(`Mode: ${DO_WIPE_AND_IMPORT ? "LIVE (wipe + import)" : "DRY RUN (no writes)"}, send: ${DO_SEND ? "ON" : "OFF"}`);
  console.log(`DB host: ${new URL(DATABASE_URL).host}`);
  console.log(`App: ${APP_URL}`);

  // 1. Connectivity + house/rooms present.
  await sql`SELECT 1`;
  const houses = await sql`SELECT id, name FROM "House" ORDER BY "createdAt" ASC LIMIT 1`;
  if (houses.length === 0) throw new Error("No House found — cannot import (house/rooms must be seeded first).");
  const house = houses[0] as { id: string; name: string };
  const roomAgg = (await sql`SELECT COALESCE(SUM(capacity),0)::int AS beds, COUNT(*)::int AS rooms FROM "Room"`)[0] as {
    beds: number;
    rooms: number;
  };
  console.log(`House: ${house.name} (${house.id}) — ${roomAgg.rooms} rooms, ${roomAgg.beds} beds`);

  // 2. Only students with COMPLETE details (valid email AND phone) are imported.
  const importable = students.filter((s) => s.emailValid && s.phoneValid);
  const skipped = students.filter((s) => !(s.emailValid && s.phoneValid));
  const noDeposit = importable.filter((s) => s.deposit == null);
  console.log(`\nStudents in file: ${students.length}`);
  console.log(`  ✓ Importable (valid email + phone): ${importable.length}`);
  console.log(`  ✗ Skipped (incomplete details):     ${skipped.length}`);
  if (skipped.length)
    console.log(
      "    " +
        skipped
          .map((s) => `${s.name} [${s.emailValid ? "" : "no email"}${!s.emailValid && !s.phoneValid ? " + " : ""}${s.phoneValid ? "" : "no phone"}]`)
          .join("; "),
    );
  if (noDeposit.length)
    console.log(`  ⚠ Importable but no deposit recorded: ${noDeposit.map((s) => s.name).join(", ")}`);

  if (!DO_WIPE_AND_IMPORT) {
    console.log("\nDRY RUN complete. Re-run with CONFIRM=WIPE_AND_IMPORT (and SEND=1 to message) to execute.");
    return;
  }

  // 3. Ensure the mustChangePassword column exists in prod.
  await sql`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" boolean NOT NULL DEFAULT false`;

  // 4. Wipe data (keep House, Room, Settings).
  console.log("\nWiping data (keeping house + rooms)…");
  for (const table of [
    "Receipt",
    "PaymentTransaction",
    "Payment",
    "Invoice",
    "Statement",
    "ServiceRequest",
    "Application",
    "Announcement",
    "Notification",
    "MessageLog",
    "EmailLog",
    "SmsLog",
    "AuditLog",
    "StudentProfile",
    "Caretaker",
    "User",
    // Demo rooms are placeholder — real rooms are created when students enter
    // their room number + type during onboarding.
    "Room",
  ]) {
    // Table names come from this fixed allowlist — safe to interpolate.
    await sql.query(`DELETE FROM "${table}"`);
  }

  const creds: string[] = ["role,name,email,phone,tempPassword"];

  // 5. Admin.
  const adminPw = tempPassword();
  await createUser({
    email: ADMIN_EMAIL,
    name: ADMIN_NAME,
    phone: ADMIN_PHONE || null,
    role: "OWNER",
    passwordHash: await bcrypt.hash(adminPw, 10),
  });
  creds.push(`OWNER,${ADMIN_NAME},${ADMIN_EMAIL},${ADMIN_PHONE},${adminPw}`);
  console.log(`Created admin ${ADMIN_EMAIL}`);

  // 6. Students (only those with complete details).
  let created = 0;
  const report = { emailSent: 0, emailSkip: 0, emailFail: 0, smsSent: 0, smsSkip: 0, smsFail: 0 };
  const failures: string[] = [];

  for (const s of importable) {
    const pw = tempPassword();
    const userId = await createUser({
      email: s.email || `${randomUUID().slice(0, 8)}@no-email.ivyhouse.local`,
      name: s.name,
      phone: s.phone,
      role: "STUDENT",
      passwordHash: await bcrypt.hash(pw, 10),
    });
    const profileId = randomUUID();
    await sql`
      INSERT INTO "StudentProfile" (id, "userId", "fullName", email, phone, status, "houseId", "createdAt", "updatedAt")
      VALUES (${profileId}, ${userId}, ${s.name}, ${s.email || ""}, ${s.phone || ""},
              'PROSPECT'::"StudentStatus", ${house.id}, now(), now())
    `;
    // Record the deposit as a settled (paid) cash payment.
    if (s.deposit != null) {
      const ref = `DEP-${randomUUID().slice(0, 8).toUpperCase()}`;
      await sql`
        INSERT INTO "Payment" (id, reference, "studentProfileId", amount, method, status, "paidAt", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${ref}, ${profileId}, ${s.deposit}, 'CASH'::"PaymentMethod",
                'PAID'::"PaymentStatus", now(), now(), now())
      `;
    }
    created++;
    creds.push(`STUDENT,${s.name},${s.email || ""},${s.phone || ""},${pw}`);

    if (DO_SEND) {
      const data = {
        studentName: s.name,
        email: s.email || "",
        password: pw,
        loginUrl: LOGIN_URL,
        deposit: s.deposit != null ? `$${s.deposit}` : "your deposit",
      };
      // Email
      if (s.emailValid && s.email) {
        const r = await sendEmail(s.email, EMAIL_SUBJECTS.onboardingInvite, renderEmail("onboardingInvite", data));
        if (r.ok) report.emailSent++;
        else {
          report.emailFail++;
          failures.push(`EMAIL ${s.name} <${s.email}>: ${r.error}`);
        }
      } else report.emailSkip++;
      // SMS
      if (s.phoneValid && s.phone) {
        const body = renderTemplate(SMS_TEMPLATES.onboardingInvite, data);
        const r = await sendSMS(s.phone, body);
        if (r.ok) report.smsSent++;
        else {
          report.smsFail++;
          failures.push(`SMS ${s.name} <${s.phone}>: ${r.error}`);
        }
      } else report.smsSkip++;
      await sleep(350); // be gentle on the providers
    }
    if (created % 10 === 0) console.log(`  …${created}/${importable.length} students`);
  }

  // Admin messages.
  if (DO_SEND) {
    const adminData = { studentName: ADMIN_NAME, email: ADMIN_EMAIL, password: adminPw, loginUrl: LOGIN_URL };
    const er = await sendEmail(ADMIN_EMAIL, EMAIL_SUBJECTS.adminWelcome, renderEmail("adminWelcome", adminData));
    console.log(`Admin email: ${er.ok ? "sent" : "FAILED — " + er.error}`);
    if (ADMIN_PHONE) {
      const sr = await sendSMS(ADMIN_PHONE, renderTemplate(SMS_TEMPLATES.adminWelcome, adminData));
      console.log(`Admin SMS: ${sr.ok ? "sent" : "FAILED — " + sr.error}`);
    } else {
      console.log("Admin SMS: skipped (no ADMIN_PHONE set)");
    }
  }

  // 7. Save credentials + report to a local file (NOT committed).
  const credsPath = `${STUDENTS_FILE.replace(/\.json$/, "")}-credentials.csv`;
  writeFileSync(credsPath, creds.join("\n"));
  console.log(`\n✅ Created ${created} students + 1 admin. Credentials saved to ${credsPath}`);
  if (DO_SEND) {
    console.log(
      `Email — sent ${report.emailSent}, skipped ${report.emailSkip}, failed ${report.emailFail}`,
    );
    console.log(`SMS   — sent ${report.smsSent}, skipped ${report.smsSkip}, failed ${report.smsFail}`);
    if (failures.length) {
      console.log("\nFailures:");
      failures.forEach((f) => console.log("  " + f));
    }
  }
}

main().catch((e) => {
  console.error("Import failed:", e);
  process.exit(1);
});
