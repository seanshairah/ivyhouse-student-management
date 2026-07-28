import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { canAccessInvoice } from "@/core/auth/access";
import { invoiceHtml } from "@/services/documents";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireUser();
  const { id } = await params;

  // Being signed in is not enough. Without this, any student could read any
  // other student's invoice by changing the id in the URL.
  const allowed = await canAccessInvoice(
    { userId: session.userId, role: session.role },
    id,
  );
  // 404 rather than 403 so the endpoint cannot be used to confirm which ids exist.
  if (!allowed) return new NextResponse("Invoice not found", { status: 404 });

  const html = await invoiceHtml(id);
  if (!html) return new NextResponse("Invoice not found", { status: 404 });
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
