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
 * house but is missing from the sheet, and how everyone classifies (paid in
 * full / paid the month / not paid) under the monthly prices the human chose.
 * Nothing is written. Step two takes the parsed rows back (the client
 * round-trips them; the server re-validates everything) and runs the same
 * import engine as the curated roster imports.
 *
 * The import's identity is a hash of rows + beds + prices: the same file at
 * the same prices resumes or no-ops; changing any of them rebuilds exactly
 * the students affected.
 */

const ROOM_RE = /^[A-Z]{0,3}-?\d{1,4}[A-Z]?$/;

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

function readPrices(formData: FormData): Record<number, number> {
  const p2 = Number(formData.get("monthlyPrice2") || 0);
  const p3 = Number(formData.get("monthlyPrice3") || 0);
  const prices: Record<number, number> = {};
  if (p2 >= 20 && p2 <= 500) prices[2] = p2;
  if (p3 >= 20 && p3 <= 500) prices[3] = p3;
  return prices;
}

function capacityOf(beds: Record<string, number>, room: string): number {
  return Math.min(6, Math.max(2, beds[room] ?? 2));
}

function classify(
  rows: RosterRow[],
  beds: Record<string, number>,
  prices: Record<number, number>,
) {
  const out = { paidInFull: 0, paidOneMonth: 0, partiallyPaid: 0, notPaid: 0 };
  for (const r of rows) {
    const monthly = prices[capacityOf(beds, r.room)];
    if (!monthly) continue;
    if (r.credited >= monthly * 4) out.paidInFull++;
    else if (r.credited === monthly) out.paidOneMonth++;
    else if (r.credited < monthly / 2) out.notPaid++;
    else out.partiallyPaid++;
  }
  return out;
}

function sheetIdentity(
  rows: RosterRow[],
  beds: Record<string, number>,
  prices: Record<number, number>,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ rows, beds, prices }))
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
}

export interface RosterPreview {
  ok: boolean;
  error?: string;
  houseName?: string;
  rows?: RosterRow[];
  rowsJson?: string;
  bedsJson?: string;
  warnings?: string[];
  moneyColumns?: string[];
  students?: number;
  roomsTwoShare?: number;
  roomsThreeShare?: number;
  needsThreeSharePrice?: boolean;
  matchesExisting?: number;
  newAccounts?: number;
  missingFromSheet?: string[];
  totalCredited?: number;
  classification?: { paidInFull: number; paidOneMonth: number; partiallyPaid: number; notPaid: number };
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
    const prices = readPrices(formData);

    const capacities = Object.keys(parsed.beds).map((room) =>
      capacityOf(parsed.beds, room),
    );
    const roomsThreeShare = capacities.filter((c) => c >= 3).length;
    const needsThreeSharePrice = roomsThreeShare > 0 && !prices[3];

    // Who already exists? Email first, exact (case-insensitive) name second.
    const existing = await prisma.studentProfile.findMany({
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

    return {
      ok: true,
      houseName: scope.houseName,
      rows: parsed.rows.slice(0, 12),
      rowsJson: JSON.stringify(parsed.rows),
      bedsJson: JSON.stringify(parsed.beds),
      warnings: parsed.warnings,
      moneyColumns: parsed.moneyColumns,
      students: parsed.rows.length,
      roomsTwoShare: capacities.length - roomsThreeShare,
      roomsThreeShare,
      needsThreeSharePrice,
      matchesExisting: matches,
      newAccounts: parsed.rows.length - matches,
      missingFromSheet: missing,
      totalCredited: parsed.rows.reduce((s, r) => s + r.credited, 0),
      classification: classify(parsed.rows, parsed.beds, prices),
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
    const bedsJson = String(formData.get("bedsJson") || "");
    if (!rowsJson || !bedsJson) {
      return { ok: false, error: "Upload and preview the sheet first." };
    }

    let rows: RosterRow[];
    let beds: Record<string, number>;
    try {
      rows = JSON.parse(rowsJson);
      beds = JSON.parse(bedsJson);
    } catch {
      return { ok: false, error: "The previewed rows were corrupted — upload again." };
    }
    // Re-validate: the client round-tripped this; trust nothing about it.
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) {
      return { ok: false, error: "The previewed rows look wrong — upload again." };
    }
    if (typeof beds !== "object" || beds === null || Array.isArray(beds)) {
      return { ok: false, error: "The previewed room list looks wrong — upload again." };
    }
    for (const [room, n] of Object.entries(beds)) {
      if (!ROOM_RE.test(room) || !Number.isInteger(n) || (n as number) < 1 || (n as number) > 6) {
        return { ok: false, error: "The previewed room list is invalid — upload again." };
      }
    }
    for (const r of rows) {
      if (
        typeof r.room !== "string" || !ROOM_RE.test(r.room) ||
        typeof r.fullName !== "string" || !r.fullName.trim() ||
        typeof r.credited !== "number" || r.credited < 0 || r.credited > 10000
      ) {
        return { ok: false, error: "A previewed row is invalid — upload the sheet again." };
      }
    }

    const prices = readPrices(formData);
    if (!prices[2]) {
      return { ok: false, error: "Set the monthly rent for 2-sharing rooms." };
    }
    const needsThree = Object.keys(beds).some((room) => capacityOf(beds, room) >= 3);
    if (needsThree && !prices[3]) {
      return { ok: false, error: "This sheet has 3-sharing rooms — set their monthly rent too." };
    }

    const sheetKey = sheetIdentity(rows, beds, prices);
    const summary = await runRosterImport(rows, {
      houseSlug: scope.houseSlug,
      refPrefix: `SHT${sheetKey}`,
      beds,
      monthlyPriceByCapacity: prices,
    });

    await audit({
      action: "roster.sheet_imported",
      metadata: { house: scope.houseSlug, sheetKey, prices, ...summary },
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
