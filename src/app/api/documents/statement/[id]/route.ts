import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { statementHtml } from "@/services/documents";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireUser();
  const { id } = await params;
  const html = await statementHtml(id);
  if (!html) return new NextResponse("Statement not found", { status: 404 });
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
