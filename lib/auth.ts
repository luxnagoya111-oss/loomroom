// lib/auth.ts
import type { UserId, Role } from "@/types/user";
import { inferRoleFromId } from "@/types/user";
import { supabase } from "@/lib/supabaseClient";

/**
 * LRoom の「現在ID」保持ルール（互換維持）
 * - 未ログイン: guest-xxxxxx を localStorage に保存
 * - ログイン済み: Supabase Auth の uuid を localStorage に保存
 *
 * 方針：
 * - Anonymous sign-in は使わない
 * - DB書き込みは “ログイン済み(uuid)” のときだけ許可する
 */
const STORAGE_KEY = "loomroom_current_user";

/**
 * 本番URL（Supabase Auth のメールリンク着地先）
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
 * UUID判定（Auth uid のみ “DB操作できるID”）
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: any): v is string {
  return typeof v === "string" && UUID_REGEX.test(v);
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
 */
export function persistCurrentUserId(id: UserId): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

/**
 * 保存済みのユーザーIDを削除（ログアウト時）
 */
export function clearStoredUserId(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * 現在のユーザーIDを返す（画面識別用）
 *
 * - SSR/build： "guest" 固定
 * - ブラウザ：localStorage があればそれ、なければ guest を作成して保存
 */
export function getCurrentUserId(): UserId {
  if (!isBrowser()) return "guest";

  const stored = getStoredUserId();
  if (stored) return stored;

  const guestId = createGuestId();
  persistCurrentUserId(guestId);
  return guestId;
}

/**
 * 現在のユーザーロール（互換維持）
 */
export function getCurrentUserRole(): Role {
  const id = getCurrentUserId();
  return inferRoleFromId(id);
}

/**
 * Supabase Auth のユーザーが取れたら localStorage に uuid を同期
 */
export async function syncAuthUserToLocalId(): Promise<UserId | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const id = data.user.id as UserId;
  if (isBrowser()) persistCurrentUserId(id);
  return id;
}

/**
 * セッションがあるなら uuid を返す（なければ null）
 */
export async function getAuthUserId(): Promise<UserId | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id as UserId;
}

/**
 * ★重要：DB操作のための viewer uuid を返す
 * - ログイン済みなら uuid
 * - 未ログインなら null
 *
 * ※ Anonymous sign-in は行わない
 */
export async function ensureViewerId(): Promise<UserId | null> {
  if (!isBrowser()) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const uid = data.user.id;
  if (!isUuid(uid)) return null;

  // localStorage が guest-* のままなら uuid に寄せる
  const stored = getStoredUserId();
  if (!stored || !isUuid(stored)) persistCurrentUserId(uid as UserId);

  return uid as UserId;
}

/**
 * 確認メールの再送（signup未確認ユーザー向け）
 */
export async function resendSignupConfirmation(email: string): Promise<void> {
  const normalized = (email || "").trim();
  if (!normalized) throw new Error("メールアドレスが未入力です。");

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
 * ログインエラーが「未確認メール」かどうか判定
 */
export function isEmailNotConfirmedError(message?: string | null): boolean {
  if (!message) return false;
  return message.toLowerCase().includes("email not confirmed");
}

/**
 * ログアウト処理（1か所に集約）
 */
export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } finally {
    clearStoredUserId();
  }
}

/**
 * ===== OAuth/PKCE 事故復旧用（今回追加） =====
 * Google OAuth が途中で壊れると、ブラウザに PKCE / auth 状態が残って
 * /auth/callback で 400（code_verifier_missing など）を誘発し続ける。
 * その復旧のため「Supabase側のauthストレージ」を掃除できるようにする。
 */

/**
 * Supabase がブラウザに残す auth/PKCE 関連キーを掃除
 * - project ref が不明でも sb- で始まるキーを広く消す
 */
export function clearSupabaseAuthStorage(): void {
  if (!isBrowser()) return;

  try {
    const keys = Object.keys(window.localStorage);
    keys.forEach((k) => {
      // Supabase v2: "sb-<project-ref>-auth-token" など
      if (k.startsWith("sb-") && k.includes("auth")) {
        window.localStorage.removeItem(k);
      }
    });

    const sKeys = Object.keys(window.sessionStorage);
    sKeys.forEach((k) => {
      if (k.startsWith("sb-") && k.includes("auth")) {
        window.sessionStorage.removeItem(k);
      }
    });
  } catch {
    // noop
  }
}

/**
 * OAuth/ログインフローが壊れた時の復旧用（ブラウザ限定）
 * - supabase.auth.signOut()
 * - loomroom_current_user クリア
 * - supabase auth storage / PKCE verifier を掃除
 */
export async function resetAuthFlow(): Promise<void> {
  if (!isBrowser()) return;

  try {
    await supabase.auth.signOut();
  } catch {
    // noop
  } finally {
    clearStoredUserId();
    clearSupabaseAuthStorage();
  }
}