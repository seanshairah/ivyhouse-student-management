import { NextResponse, type NextRequest } from "next/server";
import { parsePaynowResult, settlePayment, failPayment } from "@/services/payments";

/**
 * Paynow server-to-server result webhook.
 *
 * Accepts either application/x-www-form-urlencoded or JSON. Always returns
 * 200 "ok" so Paynow does not retry indefinitely on bad input; errors are
 * logged instead of thrown. No auth — this is a server-to-server callback.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let body: Record<string, string> = {};

    if (contentType.includes("application/json")) {
      const json = await req.json().catch(() => ({}));
      body = normalize(json);
    } else {
      // form-urlencoded (default for Paynow) or anything else.
      const text = await req.text();
      const params = new URLSearchParams(text);
      params.forEach((value, key) => {
        body[key] = value;
      });
    }

    const result = parsePaynowResult(body);

    if (!result.reference) {
      console.error("[paynow/result] Missing reference in payload", body);
      return new NextResponse("ok");
    }

    if (result.paid) {
      await settlePayment(result.reference);
    } else {
      await failPayment(result.reference, result.status);
    }

    return new NextResponse("ok");
  } catch (err) {
    console.error("[paynow/result] Error handling webhook", err);
    // Never 500 — acknowledge so Paynow stops retrying.
    return new NextResponse("ok");
  }
}

function normalize(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = v == null ? "" : String(v);
    }
  }
  return out;
}
