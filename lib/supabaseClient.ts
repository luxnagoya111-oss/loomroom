// lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
}
if (!supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
}

/**
 * ブラウザ専用 Supabase Client
 *
 * - PKCE（Google OAuth）の code_verifier はブラウザ側ストレージを正とする
 * - OAuth の code 交換は /auth/callback のみで行う
 * - SSR / cookie 同期はここでは扱わない
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",
    detectSessionInUrl: false, // callback 以外で触らせない
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "loomroom-auth",
  },
});