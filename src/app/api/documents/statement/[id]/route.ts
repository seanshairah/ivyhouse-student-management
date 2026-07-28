import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { canAccessStudent } from "@/core/auth/access";
import { statementHtml } from "@/services/documents";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireUser();
  // NOTE: for statements the [id] IS the studentProfileId, so this route
  // exposed a whole account history — balances, charges and payment dates.
  const { id } = await params;

  const allowed = await canAccessStudent(
    { userId: session.userId, role: session.role },
    id,
  );
  if (!allowed) return new NextResponse("Statement not found", { status: 404 });

  const html = await statementHtml(id);
  if (!html) return new NextResponse("Statement not found", { status: 404 });
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
