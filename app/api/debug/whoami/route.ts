// app/api/debug/whoami/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function GET() {
  // ★ Next.js 16: cookies() は Promise になっているので await が必要
  const cookieStore = await cookies();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        detectSessionInUrl: false,
        storage: {
          getItem: (key: string) => cookieStore.get(key)?.value ?? null,
          setItem: () => {},
          removeItem: () => {},
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();

  return NextResponse.json({
    user: data?.user ?? null,
    error,
  });
}