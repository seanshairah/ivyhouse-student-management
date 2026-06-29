import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { buildStatement } from "@/services/statements";
import { getSettings } from "@/services/numbering";

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
  return docShell(
    `Receipt ${r.number}`,
    `<div class="top"><div><div style="font-size:13px;opacity:.85">${s.businessName}</div><h1>Receipt</h1></div>
     <div class="doc"><div style="font-size:18px;font-weight:700">${r.number}</div><div style="opacity:.85;font-size:13px">${formatDate(r.issuedAt)}</div></div></div>
     <div class="body">
       <div class="grid">
         <div><div class="muted">Received from</div><div style="font-weight:600">${sp.fullName}</div><div class="muted">${sp.email}</div></div>
         <div><div class="muted">Accommodation</div><div style="font-weight:600">${sp.house?.name ?? "—"}</div><div class="muted">Room ${sp.room?.number ?? "—"}</div></div>
         <div><div class="muted">Payment ref</div><div style="font-weight:600">${r.payment.reference}</div><div class="muted">${r.payment.method}</div></div>
       </div>
       <table><thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
       <tbody><tr><td>${r.payment.invoice?.description ?? "Accommodation payment"}</td><td class="right">${formatCurrency(toNumber(r.amount), s.currency)}</td></tr>
       <tr><td class="right total">Total paid</td><td class="right total">${formatCurrency(toNumber(r.amount), s.currency)}</td></tr></tbody></table>
       <p class="muted" style="margin-top:24px"><span class="pill">PAID</span> &nbsp; Thank you for your payment.</p>
     </div>`,
  );
}

export async function statementHtml(studentProfileId: string): Promise<string | null> {
  const data = await buildStatement(studentProfileId);
  if (!data) return null;
  const s = await getSettings();
  const invRows = data.invoices
    .map(
      (i) =>
        `<tr><td>${formatDate(i.issuedAt)}</td><td>${i.number}</td><td>${i.description}</td><td>${i.status}</td><td class="right">${formatCurrency(i.amount, s.currency)}</td><td class="right">${formatCurrency(i.amountPaid, s.currency)}</td></tr>`,
    )
    .join("");
  const payRows = data.payments
    .map(
      (p) =>
        `<tr><td>${formatDate(p.paidAt ?? p.createdAt)}</td><td>${p.reference}</td><td>${p.method}</td><td>${p.status}</td><td class="right">${formatCurrency(p.amount, s.currency)}</td></tr>`,
    )
    .join("");
  return docShell(
    `Statement — ${data.student.fullName}`,
    `<div class="top"><div><div style="font-size:13px;opacity:.85">${s.businessName}</div><h1>Account Statement</h1></div>
     <div class="doc"><div style="opacity:.85;font-size:13px">${formatDate(new Date())}</div></div></div>
     <div class="body">
       <div class="grid">
         <div><div class="muted">Student</div><div style="font-weight:600">${data.student.fullName}</div><div class="muted">${data.student.email}</div><div class="muted">${data.student.phone}</div></div>
         <div><div class="muted">Accommodation</div><div style="font-weight:600">${data.student.house ?? "—"}</div><div class="muted">Room ${data.student.room ?? "—"}</div></div>
         <div><div class="muted">Outstanding balance</div><div class="total">${formatCurrency(data.totals.balance, s.currency)}</div></div>
       </div>
       <h3 style="margin:18px 0 0;font-size:15px">Invoices</h3>
       <table><thead><tr><th>Date</th><th>Number</th><th>Description</th><th>Status</th><th class="right">Amount</th><th class="right">Paid</th></tr></thead>
       <tbody>${invRows || '<tr><td colspan="6" class="muted">No invoices</td></tr>'}</tbody></table>
       <h3 style="margin:22px 0 0;font-size:15px">Payments</h3>
       <table><thead><tr><th>Date</th><th>Reference</th><th>Method</th><th>Status</th><th class="right">Amount</th></tr></thead>
       <tbody>${payRows || '<tr><td colspan="5" class="muted">No payments</td></tr>'}</tbody></table>
       <table style="margin-top:18px"><tbody>
         <tr><td class="right">Total invoiced</td><td class="right">${formatCurrency(data.totals.totalDue, s.currency)}</td></tr>
         <tr><td class="right">Total paid</td><td class="right">${formatCurrency(data.totals.totalPaid, s.currency)}</td></tr>
         <tr><td class="right total">Balance</td><td class="right total">${formatCurrency(data.totals.balance, s.currency)}</td></tr>
       </tbody></table>
     </div>`,
  );
}
