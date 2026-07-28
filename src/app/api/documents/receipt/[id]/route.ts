import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { canAccessReceipt } from "@/core/auth/access";
import { receiptHtml } from "@/services/documents";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireUser();
  const { id } = await params;

  // Being signed in is not enough — a receipt is proof of somebody's payment.
  const allowed = await canAccessReceipt(
    { userId: session.userId, role: session.role },
    id,
  );
  if (!allowed) return new NextResponse("Receipt not found", { status: 404 });

  const html = await receiptHtml(id);
  if (!html) return new NextResponse("Receipt not found", { status: 404 });
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
