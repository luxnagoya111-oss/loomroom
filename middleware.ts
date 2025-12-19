// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

/**
 * OAuth の callback / confirm は「無風地帯」
 * - middleware で触ると PKCE 競合の温床になるため、必ず素通し
 */
function isAuthCallbackPath(pathname: string) {
  return pathname.startsWith("/auth/callback") || pathname.startsWith("/auth/confirm");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ★最重要：OAuth callback は middleware で絶対に触らない
  if (isAuthCallbackPath(pathname)) {
    return NextResponse.next();
  }

  /**
   * 現時点では「全域 getUser()」をしない。
   * 認証必須ページを作る場合のみ、限定したパスで createServerClient + getUser を入れる。
   */
  return NextResponse.next();
}

export const config = {
  matcher: [
    // callback/confirm は matcher レベルでも除外（2重ガード）
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|auth/callback|auth/confirm).*)",
  ],
};