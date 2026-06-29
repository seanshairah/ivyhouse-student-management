import { NextResponse, type NextRequest } from "next/server";
import { verifySession, homeForRole, SESSION_COOKIE_NAME } from "@/lib/auth";

const ROUTE_ROLES: { prefix: string; roles: string[] }[] = [
  { prefix: "/owner", roles: ["OWNER"] },
  { prefix: "/student", roles: ["STUDENT", "OWNER"] },
  { prefix: "/caretaker", roles: ["CARETAKER", "OWNER"] },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const match = ROUTE_ROLES.find((r) => pathname.startsWith(r.prefix));
  if (!match) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!match.roles.includes(session.role)) {
    const url = req.nextUrl.clone();
    url.pathname = homeForRole(session.role);
    return NextResponse.redirect(url);
  }

  // Expose the current path so server layouts can enforce route-level gates.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/owner/:path*", "/student/:path*", "/caretaker/:path*"],
};
