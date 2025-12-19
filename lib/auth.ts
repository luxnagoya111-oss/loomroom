// lib/auth.ts
import type { UserId, Role } from "@/types/user";
import { inferRoleFromId } from "@/types/user";
import { supabase } from "@/lib/supabaseClient";

const STORAGE_KEY = "loomroom_current_user";

// ★ supabaseClient.ts の storageKey と必ず一致させる
const SUPABASE_STORAGE_KEY = "loomroom-auth";

export const PROD_SITE_URL = "https://lroom.jp";
export const EMAIL_CONFIRM_REDIRECT_TO = `${PROD_SITE_URL}/auth/confirm`;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function createGuestId(): UserId {
  const random = Math.random().toString(36).slice(2, 8);
  return `guest-${random}`;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: any): v is string {
  return typeof v === "string" && UUID_REGEX.test(v);
}

export function getStoredUserId(): UserId | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return (raw ?? null) as UserId | null;
}

export function persistCurrentUserId(id: UserId): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

export function clearStoredUserId(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * UI用途の「現在ID」
 * - ログイン済みであれば uuid を persistCurrentUserId で同期する（別関数で実施）
 * - 未ログインでも UI を動かすために guest-xxxx を生成して保持
 *
 * 注意：DB操作や権限判定には getCurrentUserId() を使わず、ensureViewerId() を使うこと。
 */
export function getCurrentUserId(): UserId {
  if (!isBrowser()) return "guest";

  const stored = getStoredUserId();
  if (stored) return stored;

  const guestId = createGuestId();
  persistCurrentUserId(guestId);
  return guestId;
}

export function getCurrentUserRole(): Role {
  const id = getCurrentUserId();
  return inferRoleFromId(id);
}

function isForbiddenAuthError(err: any): boolean {
  const status = err?.status ?? null;
  const msg = String(err?.message ?? "").toLowerCase();
  return status === 403 || msg.includes("forbidden");
}

/**
 * Supabaseのブラウザストレージを「対象限定」で掃除する
 * - SUPABASE_STORAGE_KEY（loomroom-auth）を正として削除
 * - 追加で、supabase-jsが作る可能性のあるPKCE関連のキーがあれば、それも限定削除
 *
 * ※ sb- プレフィックス一括削除は行わない（将来衝突しやすい）
 */
export function clearSupabaseAuthStorage(): void {
  if (!isBrowser()) return;

  try {
    // 1) アプリが指定している storageKey を確実に削除
    window.localStorage.removeItem(SUPABASE_STORAGE_KEY);

    // 2) 念のため「PKCE系っぽい」ものだけ限定掃除（存在すれば）
    //    - 実装差分や旧バージョンで残る可能性にだけ対応
    const candidates = [
      // Supabase/Authの実装で過去に見かける系（存在しないなら何もしない）
      "supabase.auth.token",
      "supabase.auth.expires_at",
      "supabase.auth.refresh_token",
      "supabase.auth.access_token",
    ];

    candidates.forEach((k) => {
      try {
        window.localStorage.removeItem(k);
        window.sessionStorage.removeItem(k);
      } catch {
        // noop
      }
    });

    // 3) sessionStorage に SUPABASE_STORAGE_KEY を使う実装差分対策
    try {
      window.sessionStorage.removeItem(SUPABASE_STORAGE_KEY);
    } catch {
      // noop
    }
  } catch {
    // noop
  }
}

/**
 * OAuth/ログインフローが壊れた時の復旧用（ブラウザ限定）
 * - signOut(local)
 * - loomroom_current_user クリア
 * - SUPABASE_STORAGE_KEY（loomroom-auth）を掃除
 *
 * ★重要：掃除対象を限定し、PKCEが必要な時に誤って別キーを破壊しない
 */
export async function resetAuthFlow(): Promise<void> {
  if (!isBrowser()) return;

  try {
    // localだけ（サーバー側のcookieは触らない）
    await supabase.auth.signOut({ scope: "local" } as any);
  } catch {
    // noop
  } finally {
    clearStoredUserId();
    clearSupabaseAuthStorage();
  }
}

/**
 * Supabase Auth のユーザーが取れたら localStorage に uuid を同期
 * - 403 なら自動で resetAuthFlow() して null
 */
export async function syncAuthUserToLocalId(): Promise<UserId | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      if (isForbiddenAuthError(error)) await resetAuthFlow();
      return null;
    }
    const id = data.user.id as UserId;
    persistCurrentUserId(id);
    return id;
  } catch (e: any) {
    if (isForbiddenAuthError(e)) await resetAuthFlow();
    return null;
  }
}

export async function getAuthUserId(): Promise<UserId | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id as UserId;
}

/**
 * DB操作のための viewer uuid を返す（Anonymousは使わない）
 * - ログイン済みなら uuid
 * - 未ログインなら null
 * - 403なら自動掃除して null
 *
 * 注意：isOwner判定・follow表示など「自分判定」は、基本これを使う。
 */
export async function ensureViewerId(): Promise<UserId | null> {
  if (!isBrowser()) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    if (isForbiddenAuthError(error)) await resetAuthFlow();
    return null;
  }

  const uid = data.user.id;
  if (!isUuid(uid)) return null;

  const stored = getStoredUserId();
  if (!stored || !isUuid(stored)) persistCurrentUserId(uid as UserId);

  return uid as UserId;
}

export async function resendSignupConfirmation(email: string): Promise<void> {
  const normalized = (email || "").trim();
  if (!normalized) throw new Error("メールアドレスが未入力です。");

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalized,
    options: { emailRedirectTo: EMAIL_CONFIRM_REDIRECT_TO },
  });

  if (error) throw error;
}

export function isEmailNotConfirmedError(message?: string | null): boolean {
  if (!message) return false;
  return message.toLowerCase().includes("email not confirmed");
}

/**
 * ログアウト処理（復旧掃除込み）
 */
export async function logout(): Promise<void> {
  await resetAuthFlow();
}