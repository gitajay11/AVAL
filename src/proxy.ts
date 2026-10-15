import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/cookie";

// Optimistic routing only: whether a session cookie exists. Real validation
// happens on the server for every page and API call.
const APP_PREFIXES = ["/chats", "/contacts", "/notifications", "/settings", "/saved", "/welcome"];
const AUTH_PAGES = ["/login", "/signup"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (pathname === "/") {
    return NextResponse.redirect(new URL(token ? "/chats" : "/login", req.url));
  }

  if (!token && APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  // Sliding session: refresh the cookie lifetime on page loads (not on login/signup,
  // where a stale cookie is about to be replaced anyway).
  if (token && !AUTH_PAGES.includes(pathname)) {
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  }
  return res;
}

export const config = {
  // Pages only: skip API routes, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|offline.html|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
