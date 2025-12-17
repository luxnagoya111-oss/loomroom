// lib/supabaseClient.ts
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
if (!supabaseAnonKey) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // 通常は true（セッションを保持）
    persistSession: true,
    // 通常は true（期限切れ前に自動更新）
    autoRefreshToken: true,
    // URLのhashからセッションを拾う（/auth/confirm 等を使うなら true）
    detectSessionInUrl: true,
    // 他プロジェクト/別環境と混線しにくいように、保存キーを固定
    storageKey: "loomroom-auth",
  },
});

// 壊れた refresh token / セッション復元失敗を検知したら自動復旧
// ※ ここは「ブラウザ上で一度だけ」走れば良いのでモジュール直下でOK
(async () => {
  try {
    const { error } = await supabase.auth.getSession();
    if (error) {
      const msg = String((error as any)?.message ?? error);

      // よくある復元失敗系（Invalid Refresh Token等）は即サインアウトして初期化
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
    // ここで落としてもUXが悪いだけなので握りつぶす
  }
})();