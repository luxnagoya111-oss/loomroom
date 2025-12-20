// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/adminConfig";

/**
 * OAuth の callback / confirm は「無風地帯」
 * - middleware で触ると PKCE 競合の温床になるため、必ず素通し
 */
function isAuthCallbackPath(pathname: string) {
  return (
    pathname.startsWith("/auth/callback") || pathname.startsWith("/auth/confirm")
  );
}

function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

// /admin/login 自体はガードしない（無限リダイレクト防止）
function isAdminLoginPath(pathname: string) {
  return pathname === "/admin/login" || pathname.startsWith("/admin/login/");
}

function buildAdminLoginRedirect(req: NextRequest) {
  const url = req.nextUrl.clone();
  const next = req.nextUrl.pathname + (req.nextUrl.search || "");
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url); // 307になるのはNextの挙動。B1では許容でOK
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ★最重要：OAuth callback は middleware で絶対に触らない
  if (isAuthCallbackPath(pathname)) {
    return NextResponse.next();
  }

  // ★ /admin 以外は触らない（B1: 最小）
  if (!isAdminPath(pathname)) {
    return NextResponse.next();
  }

  // ★ /admin/login は素通し（無限リダイレクト防止）
  if (isAdminLoginPath(pathname)) {
    return NextResponse.next();
  }

  // ★ B1: admin session cookie の有無だけで入口を分岐
  const sid = req.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? null;
  if (!sid) {
    return buildAdminLoginRedirect(req);
  }

  // cookie があるなら通す（厳密なDB照会は server側でやるのが安全）
  return NextResponse.next();
}

/**
 * matcher は /admin のみ対象（最小・明確）
 */
export const config = {
  matcher: ["/admin", "/admin/:path*"],
};