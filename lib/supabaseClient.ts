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
 *
 * ★追加：
 * - Realtime(WebSocket) へ auth(JWT) を常時同期（RLS下でも changes を受け取れるようにする）
 * - 初回ロード時の既存セッションも同期
 * - token refresh / login / logout を onAuthStateChange で追従
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

// ==============================
// Realtime auth sync（安全版）
// ==============================
// - supabase は Client Component から import される前提だが、念のため browser only ガード
// - エラーは握りつぶし（ここで落とさない）
function setRealtimeAuthSafe(token: string | null | undefined) {
  try {
    if (!token) return;
    supabase.realtime.setAuth(token);
  } catch {
    // noop（realtime未初期化/環境差異を吸収）
  }
}

if (typeof window !== "undefined") {
  // 1) 初回：既存セッションがあれば同期
  //    （persistSession=true のため、リロード後も token があることが多い）
  supabase.auth
    .getSession()
    .then(({ data }) => {
      setRealtimeAuthSafe(data.session?.access_token);
    })
    .catch(() => {
      // noop
    });

  // 2) 以後：ログイン/ログアウト/トークン更新に追従
  supabase.auth.onAuthStateChange((_event, session) => {
    setRealtimeAuthSafe(session?.access_token);
  });
}