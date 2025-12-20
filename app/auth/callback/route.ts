// app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function safeNext(next: string | null): string | null {
  if (!next) return null;
  return next.startsWith("/") ? next : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");
  const next = safeNext(url.searchParams.get("next"));

  // OAuth 側エラー
  if (error || errorDesc) {
    const to = new URL("/login", url.origin);
    if (next) to.searchParams.set("next", next);
    return NextResponse.redirect(to);
  }

  // code が無い場合
  if (!code) {
    const to = new URL("/login", url.origin);
    if (next) to.searchParams.set("next", next);
    return NextResponse.redirect(to);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // ★ Response を先に作る
  const res = NextResponse.redirect(new URL("/", url.origin));

  // ★ ここが重要：await cookies()
  const cookieStore = await cookies();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((c) => ({
          name: c.name,
          value: c.value,
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  // code → session（cookie がここで入る）
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);

  if (exErr) {
    const to = new URL("/login", url.origin);
    if (next) to.searchParams.set("next", next);
    return NextResponse.redirect(to);
  }

  // ログイン後遷移先
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id ?? null;

  const dest = next ?? (uid ? `/mypage/${uid}` : "/");
  res.headers.set("Location", dest);
  return res;
}