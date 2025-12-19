// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

function buildLoginRedirect(req: NextRequest) {
  const url = req.nextUrl.clone();
  const next = req.nextUrl.pathname + (req.nextUrl.search || "");
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ★最重要：OAuth callback は middleware で絶対に触らない
  if (isAuthCallbackPath(pathname)) {
    return NextResponse.next();
  }

  // ★ /admin 以外は触らない（全域 getUser はしない方針）
  if (!isAdminPath(pathname)) {
    return NextResponse.next();
  }

  // NextResponse は「リクエストヘッダを引き継ぐ」形で作る
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 環境変数欠落は安全側で弾く
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // middleware で cookie を更新する
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // 1) ログイン確認
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  if (userErr || !user) {
    return buildLoginRedirect(req);
  }

  // 2) 管理者判定（RPC is_admin）
  //   - public.is_admin() が作ってある前提
  //   - エラー時は安全側（拒否）
  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");

  if (adminErr) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (!isAdmin) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // OK
  return res;
}

/**
 * matcher は /admin のみ対象にする（最小・明確）
 * - callback/confirm は middleware 内でも素通しにしているが、
 *   matcher レベルでも対象外なので二重に安全
 */
export const config = {
  matcher: ["/admin", "/admin/:path*"],
};