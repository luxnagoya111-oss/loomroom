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

// ==============================
// Realtime auth sync（壊さない安全版）
// ==============================
// - Realtime(WebSocket) に JWT が乗っていないと RLS 下で changes が届かないことがあるため
//   Auth セッションと Realtime auth を同期する。
// - ここでは「token が取れた時だけ setAuth」し、例外は握りつぶす。
// - 同じ token を何度も setAuth しない（副作用最小化）
let lastRealtimeTokenHead: string | null = null;

function setRealtimeAuthSafe(token: string | null | undefined) {
  try {
    if (!token) return;

    // 同一 token の連続 setAuth を抑制（先頭だけ比較で十分）
    const head = token.slice(0, 24);
    if (lastRealtimeTokenHead === head) return;
    lastRealtimeTokenHead = head;

    supabase.realtime.setAuth(token);
  } catch {
    // noop（ここで落とさない）
  }
}

if (typeof window !== "undefined") {
  // 1) 初回ロード：persistSession の既存セッションがあれば同期
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