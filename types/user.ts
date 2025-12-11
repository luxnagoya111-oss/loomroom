// types/user.ts
// LoomRoom 共通のユーザー型定義（ソース・オブ・トゥルース）

// アカウント種別
export type Role = "guest" | "user" | "therapist" | "store";

// 将来的に u_ / t_ / s_ / guest-xxxx / UUID をすべてこの型で扱う
export type UserId = string;

/**
 * IDのプレフィックス規則（LoomRoom 内部ID体系）
 *
 * - ゲスト: guest-xxxxxx 形式（localStorage 自動発行）
 * - 一般ユーザー: u_xxxxx
 * - セラピスト: t_xxxxx
 * - 店舗: s_xxxxx
 *
 * URL 対応（仕様書 9. 内部ID体系）:
 * - /mypage/u_xxxxx
 * - /therapist/t_xxxxx
 * - /store/s_xxxxx
 *
 * 追加：
 * - Supabase Auth ログインユーザー: UUID (auth.users.id)
 *   → プレフィックスは持たないが、基本ロールは "user" として扱う
 */

/**
 * Supabase Auth の UUID らしく見えるかをざっくり判定するユーティリティ
 * （厳密である必要はなく「それっぽい長さ・形式なら UUID 扱い」でOK）
 */
function looksLikeUuid(id: string): boolean {
  // 32文字以上でハイフンを含み、16進数＋ハイフンのみ
  if (id.length < 30) return false;
  if (!id.includes("-")) return false;
  return /^[0-9a-fA-F-]+$/.test(id);
}

/**
 * IDの文字列からざっくり Role を推定する
 *
 * - guest / guest-xxxx        → guest
 * - u_xxxxx                   → user
 * - t_xxxxx                   → therapist
 * - s_xxxxx                   → store
 * - それ以外で UUID っぽいもの → user（Supabase Auth ログインユーザー）
 *
 * 将来的に厳密なロールは users テーブルで管理する前提で、
 * ここでは「UI/ガード用のざっくり判定」として使う。
 */
export function inferRoleFromId(id: UserId | null | undefined): Role {
  if (!id) return "guest";

  if (id === "guest" || id.startsWith("guest-")) return "guest";
  if (id.startsWith("u_")) return "user";
  if (id.startsWith("t_")) return "therapist";
  if (id.startsWith("s_")) return "store";

  // Supabase Auth の UUID は、ひとまず user として扱う
  if (looksLikeUuid(id)) return "user";

  // 不明な形式は安全側で guest 扱い
  return "guest";
}

/**
 * ゲストIDかどうかの判定ヘルパー
 */
export function isGuestId(id: UserId | null | undefined): boolean {
  if (!id) return true;
  return id === "guest" || id.startsWith("guest-");
}