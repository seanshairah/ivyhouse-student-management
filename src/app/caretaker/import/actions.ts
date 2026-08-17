"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { parseRosterWorkbook } from "@/lib/roster-xlsx";
import {
  runRosterImport,
  placeholderEmail,
  type RosterRow,
  type RosterImportSummary,
} from "@/services/students/roster-import";
import { audit } from "@/services/audit";

/**
 * Two-step Excel import from the caretaker's own dashboard.
 *
 * Step one parses the uploaded workbook and reports what WOULD happen —
 * who matches an existing account, who is new, who currently lives in the
 * house but is missing from the sheet. Nothing is written. Step two takes
 * the parsed rows back (the client round-trips them; the server re-validates)
 * and runs the same import engine the owner's curated August import uses.
 *
 * The sheet's content hash is the import's identity: the same file resumes
 * or no-ops, a corrected file rebuilds what changed.
 */

interface Scope {
  houseId: string;
  houseSlug: string;
  houseName: string;
}

async function importScope(): Promise<Scope> {
  const session = await requireRole(["CARETAKER", "OWNER"]);
  const caretaker = await prisma.caretaker.findFirst({
    where: { OR: [{ userId: session.userId }, { email: session.email }] },
    select: { house: { select: { id: true, slug: true, name: true } } },
  });
  const house =
    caretaker?.house ??
    (await prisma.house.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true },
    }));
  if (!house) throw new Error("No house found to import into.");
  return { houseId: house.id, houseSlug: house.slug, houseName: house.name };
}

export interface RosterPreview {
  ok: boolean;
  error?: string;
  houseName?: string;
  rows?: RosterRow[];
  rowsJson?: string;
  sheetKey?: string;
  warnings?: string[];
  moneyColumns?: string[];
  students?: number;
  roomsOnSheet?: number;
  matchesExisting?: number;
  newAccounts?: number;
  missingFromSheet?: string[];
  totalCredited?: number;
}

export async function previewRosterUpload(
  formData: FormData,
): Promise<RosterPreview> {
  try {
    const scope = await importScope();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose an .xlsx file first." };
    }
    if (file.size > 2 * 1024 * 1024) {
      return { ok: false, error: "That file is over 2MB — a roster sheet shouldn't be." };
    }
    const parsed = parseRosterWorkbook(Buffer.from(await file.arrayBuffer()));

    // Who already exists? Email first, exact (case-insensitive) name second.
    const existing = await prisma.studentProfile.findMany({
      where: {},
      select: { fullName: true, email: true, houseId: true, status: true },
    });
    const byEmail = new Set(existing.map((e) => e.email.toLowerCase()));
    const byName = new Set(existing.map((e) => e.fullName.trim().toLowerCase()));
    let matches = 0;
    for (const r of parsed.rows) {
      if (
        (r.email && byEmail.has(r.email)) ||
        byEmail.has(placeholderEmail(r.fullName)) ||
        byName.has(r.fullName.trim().toLowerCase())
      ) {
        matches++;
      }
    }

    const sheetNames = new Set(parsed.rows.map((r) => r.fullName.trim().toLowerCase()));
    const sheetEmails = new Set(parsed.rows.filter((r) => r.email).map((r) => r.email!));
    const missing = existing
      .filter(
        (e) =>
          e.houseId === scope.houseId &&
          e.status === "ACTIVE" &&
          !sheetNames.has(e.fullName.trim().toLowerCase()) &&
          !sheetEmails.has(e.email.toLowerCase()),
      )
      .map((e) => e.fullName);

    const rowsJson = JSON.stringify(parsed.rows);
    const sheetKey = createHash("sha256").update(rowsJson).digest("hex").slice(0, 6).toUpperCase();

    return {
      ok: true,
      houseName: scope.houseName,
      rows: parsed.rows.slice(0, 12),
      rowsJson,
      sheetKey,
      warnings: parsed.warnings,
      moneyColumns: parsed.moneyColumns,
      students: parsed.rows.length,
      roomsOnSheet: new Set(parsed.rows.map((r) => r.room)).size,
      matchesExisting: matches,
      newAccounts: parsed.rows.length - matches,
      missingFromSheet: missing,
      totalCredited: parsed.rows.reduce((s, r) => s + r.credited, 0),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface RosterApplyResult {
  ok: boolean;
  error?: string;
  message?: string;
  summary?: RosterImportSummary;
}

export async function applyRosterUpload(
  formData: FormData,
): Promise<RosterApplyResult> {
  try {
    const scope = await importScope();
    if (String(formData.get("confirm") || "").trim().toUpperCase() !== "IMPORT") {
      return { ok: false, error: "Type IMPORT to confirm." };
    }
    const rowsJson = String(formData.get("rowsJson") || "");
    if (!rowsJson) return { ok: false, error: "Upload and preview the sheet first." };

    let rows: RosterRow[];
    try {
      rows = JSON.parse(rowsJson);
    } catch {
      return { ok: false, error: "The previewed rows were corrupted — upload again." };
    }
    // Re-validate: the client round-tripped this; trust nothing about it.
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) {
      return { ok: false, error: "The previewed rows look wrong — upload again." };
    }
    for (const r of rows) {
      if (
        !Number.isInteger(r.room) || r.room <= 0 || r.room > 200 ||
        typeof r.fullName !== "string" || !r.fullName.trim() ||
        typeof r.credited !== "number" || r.credited < 0 || r.credited > 10000
      ) {
        return { ok: false, error: "A previewed row is invalid — upload the sheet again." };
      }
    }

    const sheetKey = createHash("sha256")
      .update(JSON.stringify(rows))
      .digest("hex")
      .slice(0, 6)
      .toUpperCase();

    const summary = await runRosterImport(rows, {
      houseSlug: scope.houseSlug,
      refPrefix: `SHT${sheetKey}`,
    });

    await audit({
      action: "roster.sheet_imported",
      metadata: { house: scope.houseSlug, sheetKey, ...summary },
    });

    revalidatePath("/caretaker/students");
    revalidatePath("/owner/students");
    revalidatePath("/owner/rooms");
    revalidatePath("/owner");
    revalidatePath("/houses");

    return {
      ok: true,
      summary,
      message: summary.done
        ? `Imported into ${scope.houseName}: ${summary.rooms} rooms, ${summary.processed} students ` +
          `(${summary.created} new, ${summary.updated} matched), ${summary.receipts} receipts. ` +
          `Paid in full: ${summary.paidInFull} · first month: ${summary.paidOneMonth} · ` +
          `part-paid: ${summary.partiallyPaid} · not paid: ${summary.notPaid}.`
        : `Ran out of time after ${summary.processed} students — click Import again with the same file to continue.`,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
