// lib/supabaseClient.ts
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
if (!supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ★重要：OAuth を PKCE(code) に固定
    flowType: "pkce",

    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "loomroom-auth",
  },
});