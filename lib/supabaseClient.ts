// lib/supabaseClient.ts
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
if (!supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");

// ★ブラウザは createBrowserClient（cookie同期される）
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "loomroom-auth",
  },
});