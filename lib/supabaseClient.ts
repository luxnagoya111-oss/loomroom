// lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
if (!supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,

    /**
     * ★重要：
     * OAuth callback の code を「自動で拾って交換」させない。
     * CallbackClient.tsx 側で exchangeCodeForSession(code) を明示的に呼ぶため。
     */
    detectSessionInUrl: false,

    /**
     * ★ storageKey を固定（あなたの方針を維持）
     * localStorage に loomroom-auth で保存される。
     */
    storageKey: "loomroom-auth",
  },
});