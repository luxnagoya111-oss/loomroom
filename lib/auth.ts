// lib/auth.ts
import type { UserId, Role } from "@/types/user";
import { inferRoleFromId } from "@/types/user";
import { supabase } from "@/lib/supabaseClient";

/**
 * LoomRoom の「現在ID」保持ルール
 * - 未ログイン: guest-xxxxxx を localStorage に保存
 * - ログイン済み: Supabase Auth の uuid を localStorage に保存
 */
const STORAGE_KEY = "loomroom_current_user";

/**
 * 本番URL（Supabase Auth のメールリンク着地先）
 * ※ ここはプロジェクトの正として固定
 */
export const PROD_SITE_URL = "https://lroom.jp";
export const EMAIL_CONFIRM_REDIRECT_TO = `${PROD_SITE_URL}/auth/confirm`;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function createGuestId(): UserId {
  const random = Math.random().toString(36).slice(2, 8);
  return `guest-${random}`;
}

/**
 * localStorage に保存されているユーザーIDを取得
 */
export function getStoredUserId(): UserId | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return (raw ?? null) as UserId | null;
}

/**
 * 現在のユーザーIDを localStorage に保存
 * - Supabase Auth でログイン完了後に uuid を保存する想定
 */
export function persistCurrentUserId(id: UserId): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

/**
 * 保存済みのユーザーIDを削除
 * - ログアウト時に使用
 */
export function clearStoredUserId(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * 現在のユーザーIDを返す（同期）
 *
 * - SSR / build 中： "guest" 固定（ブラウザ側で再評価される想定）
 * - ブラウザ：localStorage があればそれ、なければ guest を作成して保存
 */
export function getCurrentUserId(): UserId {
  if (!isBrowser()) {
    return "guest";
  }

  const stored = getStoredUserId();
  if (stored) return stored;

  const guestId = createGuestId();
  persistCurrentUserId(guestId);
  return guestId;
}

/**
 * 現在のユーザーロールを返すヘルパー
 * - IDプレフィックスや UUID から Role を推定
 * - まだ何もない場合は "guest"
 */
export function getCurrentUserRole(): Role {
  const id = getCurrentUserId();
  return inferRoleFromId(id);
}

/**
 * Supabase Auth から現在のユーザーを取得し、
 * もしログイン済みなら localStorage に uuid を保存するユーティリティ
 *
 * 期待用途：
 * - /login 後の遷移直後
 * - /mypage 等の入口で「セッションがあるなら uuid に確定」させたい時
 */
export async function syncAuthUserToLocalId(): Promise<UserId | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const id = data.user.id as UserId;
  if (isBrowser()) persistCurrentUserId(id);
  return id;
}

/**
 * 追加：Supabase のセッションがあるなら優先して uuid を返す（非SSR向け）
 * - 画面側で「確実に会員IDが欲しい」場面に使える
 * - セッション無しなら null
 */
export async function getAuthUserId(): Promise<UserId | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id as UserId;
}

/**
 * 追加：確認メールの再送（signup未確認ユーザー向け）
 * - Email not confirmed が出た時の救済導線として使う
 *
 * 注意：
 * - emailRedirectTo は本番URLに固定（localhost事故防止）
 * - Redirect URLs に https://lroom.jp/** が入っている必要あり
 */
export async function resendSignupConfirmation(email: string): Promise<void> {
  const normalized = (email || "").trim();
  if (!normalized) {
    throw new Error("メールアドレスが未入力です。");
  }

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalized,
    options: {
      emailRedirectTo: EMAIL_CONFIRM_REDIRECT_TO,
    },
  });

  if (error) throw error;
}

/**
 * 追加：ログインエラーが「未確認メール」かどうか判定するヘルパー
 * - UI側で「再送ボタン」を出す条件に使う
 */
export function isEmailNotConfirmedError(message?: string | null): boolean {
  if (!message) return false;
  return message.toLowerCase().includes("email not confirmed");
}

/**
 * ログアウト処理（1か所に集約）
 * - Supabase から signOut
 * - localStorage の ID をクリア
 */
export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } finally {
    clearStoredUserId();
  }
}