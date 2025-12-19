// lib/supabaseServer.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const cookieStore = await cookies(); // Next.js 16 は await が必要

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // ★最重要：ブラウザ側 Cookie のベース名に合わせる（loomroom-auth.0/.1 を読む）
      cookieOptions: {
        name: "loomroom-auth",
      },

      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Route Handler 以外で set できないケースは握りつぶしでOK
          }
        },
      },
    }
  );
}