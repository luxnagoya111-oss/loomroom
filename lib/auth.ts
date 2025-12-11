// lib/auth.ts
import type { UserId, Role } from "@/types/user";
import { inferRoleFromId } from "@/types/user";
import { supabase } from "@/lib/supabaseClient";

const STORAGE_KEY = "loomroom_current_user";

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
  return raw ?? null;
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
 * - ログイン済み：localStorage に保存されている uuid
 * - 未ログイン　：guest-xxxxxx を新規発行して保存
 * - SSR 中　　　："guest" 固定（ブラウザ側で再評価される想定）
 */
export function getCurrentUserId(): UserId {
  if (!isBrowser()) {
    // SSR / ビルド時
    return "guest";
  }

  const stored = getStoredUserId();
  if (stored) {
    return stored;
  }

  // 未保存 → ゲストIDを新規発行
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
 * （必要に応じて /login 以外のページでも使えるように）
 */
export async function syncAuthUserToLocalId(): Promise<UserId | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  const id = data.user.id as UserId;
  if (isBrowser()) {
    persistCurrentUserId(id);
  }
  return id;
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