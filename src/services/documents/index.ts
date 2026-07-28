import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { buildStatement } from "@/services/statements";
import { getSettings } from "@/services/numbering";
import { getPaymentBreakdown, CATEGORY_LABEL } from "@/core/billing/ledger";

/** How a payment reached us, in words a student recognises. */
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  PAYNOW: "Paid online (Paynow)",
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  MANUAL: "Recorded by the office",
};

function docShell(title: string, inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  :root{--brand:#171716}
  *{box-sizing:border-box}
  body{font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#171716;margin:0;background:#faf9f7;padding:24px}
  .sheet{max-width:760px;margin:0 auto;background:#fff;border:1px solid #ececeb;border-radius:16px;overflow:hidden}
  .top{background:var(--brand);color:#fff;padding:28px 32px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px}
  .top h1{margin:0;font-size:22px;letter-spacing:-0.3px} .top .doc{text-align:right}
  .body{padding:28px 32px}
  .muted{color:#a3a39d;font-size:13px}
  .grid{display:flex;gap:32px;flex-wrap:wrap;margin:8px 0 20px}
  .grid>div{min-width:180px}
  table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}
  th{text-align:left;color:#a3a39d;font-size:12px;text-transform:uppercase;padding:8px;border-bottom:2px solid #ececeb}
  td{padding:10px 8px;border-bottom:1px solid #ececeb}
  .right{text-align:right} .total{font-weight:700;font-size:16px}
  .pill{display:inline-block;padding:3px 12px;border-radius:999px;background:#f1e9df;color:#a87c55;font-size:12px;font-weight:600}
  .actions{max-width:760px;margin:16px auto 0;text-align:center}
  .btn{display:inline-block;background:var(--brand);color:#fff;text-decoration:none;padding:10px 22px;border-radius:10px;font-weight:600;border:0;cursor:pointer;font-size:14px}
  @media print{body{background:#fff;padding:0}.sheet{box-shadow:none}.actions{display:none}}
</style></head><body>
<div class="sheet">${inner}</div>
<div class="actions"><button class="btn" onclick="window.print()">Print / Save as PDF</button></div>
</body></html>`;
}

export async function invoiceHtml(invoiceId: string): Promise<string | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { studentProfile: { include: { house: true, room: true } } },
  });
  if (!inv) return null;
  const s = await getSettings();
  const sp = inv.studentProfile;
  const outstanding = toNumber(inv.amount) - toNumber(inv.amountPaid);
  return docShell(
    `Invoice ${inv.number}`,
    `<div class="top"><div><div style="font-size:13px;opacity:.85">${s.businessName}</div><h1>Invoice</h1></div>
     <div class="doc"><div style="font-size:18px;font-weight:700">${inv.number}</div><div style="opacity:.85;font-size:13px">${formatDate(inv.issuedAt)}</div></div></div>
     <div class="body">
       <div class="grid">
         <div><div class="muted">Billed to</div><div style="font-weight:600">${sp.fullName}</div><div class="muted">${sp.email}</div><div class="muted">${sp.phone}</div></div>
         <div><div class="muted">Accommodation</div><div style="font-weight:600">${sp.house?.name ?? "—"}</div><div class="muted">Room ${sp.room?.number ?? "—"}</div></div>
         <div><div class="muted">Status</div><span class="pill">${inv.status}</span><div class="muted" style="margin-top:6px">Due ${inv.dueDate ? formatDate(inv.dueDate) : "—"}</div></div>
       </div>
       <table><thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
       <tbody><tr><td>${inv.description}</td><td class="right">${formatCurrency(toNumber(inv.amount), s.currency)}</td></tr>
       <tr><td class="right muted">Paid</td><td class="right">${formatCurrency(toNumber(inv.amountPaid), s.currency)}</td></tr>
       <tr><td class="right total">Balance due</td><td class="right total">${formatCurrency(outstanding, s.currency)}</td></tr></tbody></table>
       <p class="muted" style="margin-top:24px">Thank you. Please settle any outstanding balance via your student portal.</p>
     </div>`,
  );
}

export async function receiptHtml(receiptId: string): Promise<string | null> {
  const r = await prisma.receipt.findUnique({
    where: { id: receiptId },
    include: {
      payment: { include: { studentProfile: { include: { house: true, room: true } }, invoice: true } },
    },
  });
  if (!r) return null;
  const s = await getSettings();
  const sp = r.payment.studentProfile;

  // What the money was actually for, read from the allocations rather than from
  // a linked invoice. Most real payments are booking deposits with no invoice,
  // and those receipts used to read "Accommodation payment".
  const breakdown = await getPaymentBreakdown(r.payment.id);
  const kinds = [...new Set(breakdown.lines.map((l) => l.category))];
  const heading =
    kinds.length === 1 ? `${CATEGORY_LABEL[kinds[0]]} receipt` : "Receipt";

  const lineRows = breakdown.lines
    .map(
      (l) =>
        `<tr><td><span class="pill">${CATEGORY_LABEL[l.category]}</span> ${l.description}</td>` +
        `<td class="right">${formatCurrency(l.amount, s.currency)}</td></tr>`,
    )
    .join("");
  const unappliedRow = breakdown.unapplied > 0
    ? `<tr><td class="muted">Credit on account (not yet applied)</td>` +
      `<td class="right">${formatCurrency(breakdown.unapplied, s.currency)}</td></tr>`
    : "";

  return docShell(
    `${heading} ${r.number}`,
    `<div class="top"><div><div style="font-size:13px;opacity:.85">${s.businessName}</div><h1>${heading}</h1></div>
     <div class="doc"><div style="font-size:18px;font-weight:700">${r.number}</div><div style="opacity:.85;font-size:13px">${formatDate(r.issuedAt)}</div></div></div>
     <div class="body">
       <div class="grid">
         <div><div class="muted">Received from</div><div style="font-weight:600">${sp.fullName}</div><div class="muted">${sp.email}</div></div>
         <div><div class="muted">Accommodation</div><div style="font-weight:600">${sp.house?.name ?? "—"}</div><div class="muted">${sp.room?.number ? `Room ${sp.room.number}` : "Room not yet assigned"}</div></div>
         <div><div class="muted">Payment ref</div><div style="font-weight:600">${r.payment.reference}</div><div class="muted">${PAYMENT_METHOD_LABEL[r.payment.method] ?? r.payment.method}</div></div>
       </div>
       <table><thead><tr><th>What this paid for</th><th class="right">Amount</th></tr></thead>
       <tbody>${lineRows}${unappliedRow}
       <tr><td class="right total">Total paid</td><td class="right total">${formatCurrency(toNumber(r.amount), s.currency)}</td></tr></tbody></table>
       <p class="muted" style="margin-top:24px"><span class="pill">PAID</span> &nbsp; Thank you for your payment.</p>
     </div>`,
  );
}

export async function statementHtml(studentProfileId: string): Promise<string | null> {
  const data = await buildStatement(studentProfileId);
  if (!data) return null;
  const s = await getSettings();
  const chargeRows = data.charges
    .map(
      (c) =>
        `<tr><td>${formatDate(c.issuedAt)}</td>` +
        `<td><span class="pill">${c.categoryLabel}</span></td>` +
        `<td>${c.description}</td>` +
        `<td>${c.dueDate ? formatDate(c.dueDate) : "—"}${c.overdue ? ' <strong style="color:#b4232a">overdue</strong>' : ""}</td>` +
        `<td class="right">${formatCurrency(c.amount, s.currency)}</td>` +
        `<td class="right">${formatCurrency(c.paid, s.currency)}</td>` +
        `<td class="right">${formatCurrency(c.outstanding, s.currency)}</td></tr>`,
    )
    .join("");

  const t = data.totals;
  const splitRow = (label: string, v: { charged: number; paid: number; outstanding: number }) =>
    v.charged === 0 && v.outstanding === 0
      ? ""
      : `<tr><td>${label}</td>` +
        `<td class="right">${formatCurrency(v.charged, s.currency)}</td>` +
        `<td class="right">${formatCurrency(v.paid, s.currency)}</td>` +
        `<td class="right total">${formatCurrency(v.outstanding, s.currency)}</td></tr>`;
  const payRows = data.payments
    .map(
      (p) =>
        `<tr><td>${formatDate(p.paidAt ?? p.createdAt)}</td><td>${p.reference}</td><td>${PAYMENT_METHOD_LABEL[p.method] ?? p.method}</td><td>${p.status}</td><td class="right">${formatCurrency(p.amount, s.currency)}</td></tr>`,
    )
    .join("");
  return docShell(
    `Statement — ${data.student.fullName}`,
    `<div class="top"><div><div style="font-size:13px;opacity:.85">${s.businessName}</div><h1>Account Statement</h1></div>
     <div class="doc"><div style="opacity:.85;font-size:13px">${formatDate(new Date())}</div></div></div>
     <div class="body">
       <div class="grid">
         <div><div class="muted">Student</div><div style="font-weight:600">${data.student.fullName}</div><div class="muted">${data.student.email}</div><div class="muted">${data.student.phone}</div></div>
         <div><div class="muted">Accommodation</div><div style="font-weight:600">${data.student.house ?? "—"}</div><div class="muted">${data.student.room ? `Room ${data.student.room}` : "Room not yet assigned"}</div></div>
         <div><div class="muted">Outstanding balance</div><div class="total">${formatCurrency(data.totals.balance, s.currency)}</div></div>
       </div>
       <h3 style="margin:18px 0 0;font-size:15px">Account summary</h3>
       <table><thead><tr><th>Category</th><th class="right">Charged</th><th class="right">Paid</th><th class="right">Outstanding</th></tr></thead>
       <tbody>
         ${splitRow("Rent", t.rent)}
         ${splitRow("Transport", t.transport)}
         ${splitRow("Deposits &amp; other", t.other)}
         <tr><td class="total">Total</td><td class="right total">${formatCurrency(t.totalDue, s.currency)}</td><td class="right total">${formatCurrency(t.totalPaid, s.currency)}</td><td class="right total">${formatCurrency(t.balance, s.currency)}</td></tr>
       </tbody></table>
       ${t.arrears > 0 ? `<p style="margin-top:10px;color:#b4232a;font-weight:600">${formatCurrency(t.arrears, s.currency)} of this is past its due date.</p>` : ""}
       ${t.credit > 0 ? `<p class="muted" style="margin-top:10px">${formatCurrency(t.credit, s.currency)} is held on your account as credit.</p>` : ""}

       <h3 style="margin:22px 0 0;font-size:15px">Charges</h3>
       <table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Due</th><th class="right">Amount</th><th class="right">Paid</th><th class="right">Outstanding</th></tr></thead>
       <tbody>${chargeRows || '<tr><td colspan="7" class="muted">No charges yet</td></tr>'}</tbody></table>
       <h3 style="margin:22px 0 0;font-size:15px">Payments</h3>
       <table><thead><tr><th>Date</th><th>Reference</th><th>Method</th><th>Status</th><th class="right">Amount</th></tr></thead>
       <tbody>${payRows || '<tr><td colspan="5" class="muted">No payments</td></tr>'}</tbody></table>
     </div>`,
  );
}
