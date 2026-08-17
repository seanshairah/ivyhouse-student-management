import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseRosterWorkbook } from "@/lib/roster-xlsx";

/**
 * The parser is exercised against the REAL shape of the office's books:
 * a title row, several named money columns, and TOTAL/expense rows sharing
 * the table — not a clean CSV.
 */
function sheet(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("roster workbook parsing", () => {
  it("reads the owner's real book shape and sums the money columns", () => {
    const buf = sheet([
      ["Mufudzi House", null, null, null, null, null],
      ["Room", "Full Name", "Aug Deposit", "Cash Rent", "Bank", "Eco-Cash"],
      [1, "Tino Chitengwa", 30, 90, null, null],
      [1, "Praise Chanama", 30, null, null, null],
      [2, "Andria Chibeza", 30, null, 480, null],
      [null, "TOTAL CASH", 6870, null, null, null],
      [null, "Salaries", 950, null, null, null],
    ]);
    const parsed = parseRosterWorkbook(buf);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({ room: 1, fullName: "Tino Chitengwa", credited: 120 });
    expect(parsed.rows[1].credited).toBe(30);
    expect(parsed.rows[2].credited).toBe(510);
    // Totals and expense rows never leak into the roster.
    expect(parsed.rows.some((r) => /total|salar/i.test(r.fullName))).toBe(false);
    expect(parsed.moneyColumns).toEqual(["Aug Deposit", "Cash Rent", "Bank", "Eco-Cash"]);
  });

  it("picks up email and phone columns when the sheet has them", () => {
    const buf = sheet([
      ["Room", "Full Name", "Email", "Phone", "Paid"],
      [3, "Thandi Ncube", "thandi@gmail.com", "0771000000", 480],
      [3, "Rue Moyo", "not-an-email", null, 120],
    ]);
    const parsed = parseRosterWorkbook(buf);
    expect(parsed.rows[0]).toMatchObject({
      email: "thandi@gmail.com",
      phone: "0771000000",
      credited: 480,
    });
    // A malformed address is dropped with a warning, never imported broken.
    expect(parsed.rows[1].email).toBeNull();
    expect(parsed.warnings.some((w) => w.includes("not-an-email"))).toBe(true);
  });

  it("flags a student with an unreadable room instead of silently dropping them", () => {
    const buf = sheet([
      ["Room", "Full Name", "Paid"],
      ["Not sure", "Kuda Zhou", 120],
      [5, "Fadzi Moyo", 120],
    ]);
    const parsed = parseRosterWorkbook(buf);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.warnings.some((w) => w.includes("Kuda Zhou"))).toBe(true);
  });

  it("warns when a room is over capacity on the sheet", () => {
    const buf = sheet([
      ["Room", "Full Name", "Paid"],
      [7, "A One", 120],
      [7, "B Two", 120],
      [7, "C Three", 120],
    ]);
    const parsed = parseRosterWorkbook(buf);
    expect(parsed.warnings.some((w) => w.includes("Room 7 has 3"))).toBe(true);
  });
});
