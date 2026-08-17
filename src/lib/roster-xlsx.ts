import * as XLSX from "xlsx";
import type { RosterRow } from "@/services/students/roster-import";

/**
 * Parse an owner/caretaker roster workbook into import rows.
 *
 * Built against the real books this office keeps, which are not clean CSVs:
 * a title row above the headers, money split across several named columns
 * ("Aug Deposit", "Cash Rent", "Bank", "Eco-Cash"), and TOTAL/expense rows at
 * the bottom that share the table. The rules that survive all of that:
 *
 *  - the header row is the first row containing both a "room"-ish and a
 *    "name"-ish cell;
 *  - a data row is any row below it with a positive whole room number and a
 *    non-empty name — the totals rows fail the room test and fall away;
 *  - every OTHER named column that isn't recognised as email/phone is treated
 *    as money and summed into `credited`, which is exactly how the owner
 *    reads their own book (and per the owner, the method split is not
 *    recorded anyway);
 *  - email/phone columns are picked up when present, so a richer sheet (the
 *    Ivy book is expected to carry emails) imports contacts too.
 *
 * Anything skipped or suspicious comes back as a warning — a silent parse is
 * how one mistyped row becomes eighty wrong ledgers.
 */

export interface ParsedRoster {
  rows: RosterRow[];
  warnings: string[];
  moneyColumns: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cellText(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function asMoney(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function parseRosterWorkbook(buf: Buffer | ArrayBuffer): ParsedRoster {
  const wb = XLSX.read(buf, { type: buf instanceof ArrayBuffer ? "array" : "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no sheets.");
  const grid: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
  });

  // Find the header row.
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const cells = (grid[i] ?? []).map((c) => cellText(c).toLowerCase());
    if (cells.some((c) => /room/.test(c)) && cells.some((c) => /name/.test(c))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error(
      'Could not find the header row — the sheet needs "Room" and "Name" columns.',
    );
  }

  const headers = (grid[headerIdx] ?? []).map((c) => cellText(c));
  let roomCol = -1, nameCol = -1, emailCol = -1, phoneCol = -1;
  const moneyCols: number[] = [];
  headers.forEach((h, i) => {
    const l = h.toLowerCase();
    if (!l) return;
    if (roomCol < 0 && /room/.test(l)) roomCol = i;
    else if (nameCol < 0 && /name/.test(l)) nameCol = i;
    else if (emailCol < 0 && /e-?mail/.test(l)) emailCol = i;
    else if (phoneCol < 0 && /phone|cell|mobile/.test(l)) phoneCol = i;
    else moneyCols.push(i);
  });

  const warnings: string[] = [];
  const rows: RosterRow[] = [];
  const seen = new Map<string, number>();

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i] ?? [];
    const roomRaw = cellText(r[roomCol]);
    const name = cellText(r[nameCol]);
    if (!roomRaw && !name) continue;
    const room = Number(roomRaw);
    if (!Number.isInteger(room) || room <= 0) {
      // Totals and expense rows land here by design; a named student with a
      // broken room number is worth flagging.
      if (name && !/total|salar|refund|cash in hand/i.test(name)) {
        warnings.push(`Row ${i + 1}: "${name}" skipped — room "${roomRaw || "(blank)"}" is not a number.`);
      }
      continue;
    }
    if (!name) {
      warnings.push(`Row ${i + 1}: room ${room} has an amount but no name — skipped.`);
      continue;
    }

    const emailRaw = emailCol >= 0 ? cellText(r[emailCol]).toLowerCase() : "";
    const email = EMAIL_RE.test(emailRaw) ? emailRaw : null;
    if (emailRaw && !email) {
      warnings.push(`Row ${i + 1}: "${name}" — "${emailRaw}" doesn't look like an email; ignored.`);
    }
    const phone = phoneCol >= 0 ? cellText(r[phoneCol]) || null : null;
    const credited = moneyCols.reduce((sum, c) => sum + asMoney(r[c]), 0);

    const key = `${room}|${name.toLowerCase()}`;
    if (seen.has(key)) {
      warnings.push(`Row ${i + 1}: duplicate of "${name}" in room ${room} — skipped.`);
      continue;
    }
    seen.set(key, i);
    rows.push({ room, fullName: name, email, phone, credited });
  }

  if (!rows.length) throw new Error("No student rows found under the header.");

  // Occupancy sanity per room.
  const perRoom = new Map<number, number>();
  for (const r of rows) perRoom.set(r.room, (perRoom.get(r.room) ?? 0) + 1);
  for (const [room, n] of [...perRoom.entries()].sort((a, b) => a[0] - b[0])) {
    if (n > 2) warnings.push(`Room ${room} has ${n} students on the sheet (capacity is 2).`);
  }

  return {
    rows,
    warnings,
    moneyColumns: moneyCols.map((i) => headers[i]).filter(Boolean),
  };
}
