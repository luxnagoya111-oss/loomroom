// /middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function isAuthCallbackPath(pathname: string) {
  return pathname.startsWith("/auth/callback") || pathname.startsWith("/auth/confirm");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ★最重要：OAuth callback は middleware で絶対に触らない（PKCE競合の温床）
  if (isAuthCallbackPath(pathname)) {
    return NextResponse.next();
  }

  let res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  /**
   * ここで getUser() を「常に」呼ぶ必要はありません。
   * ログイン必須ページを作るなら、その matcher/分岐にだけ寄せて呼ぶのが安全です。
   *
   * まずは Google ログイン復旧を最優先するため、ここでは何もしない。
   * （将来ログイン保護を入れるときは、この下に限定して追加）
   */
  // await supabase.auth.getUser();

  return res;
}

export const config = {
  matcher: [
    // ★ callback/confirm を matcher レベルでも除外（2重ガード）
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|auth/callback|auth/confirm).*)",
  ],
};