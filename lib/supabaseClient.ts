// lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
if (!supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // OAuth(PKCE)を安定させる
    flowType: "pkce",
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "loomroom-auth",
  },
});

// ここは任意：壊れたrefresh tokenを引きずった時の自動掃除
(async () => {
  try {
    const { error } = await supabase.auth.getSession();
    if (error) {
      const msg = String((error as any)?.message ?? error);
      if (
        msg.includes("Invalid Refresh Token") ||
        msg.includes("Refresh Token Not Found") ||
        msg.includes("JWT expired") ||
        msg.includes("invalid JWT")
      ) {
        await supabase.auth.signOut();
      }
    }
  } catch {
    // 握りつぶし
  }
})();