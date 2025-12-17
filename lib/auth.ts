// lib/auth.ts
import type { UserId, Role } from "@/types/user";
import { inferRoleFromId } from "@/types/user";
import { supabase } from "@/lib/supabaseClient";

const STORAGE_KEY = "loomroom_current_user";

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

/**
 * ===== OAuth/PKCE 事故復旧用 =====
 * Supabase がブラウザに残す auth/PKCE 関連キーを掃除
 */
export function clearSupabaseAuthStorage(): void {
  if (!isBrowser()) return;

  try {
    const keys = Object.keys(window.localStorage);
    keys.forEach((k) => {
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

function isForbiddenAuthError(err: any): boolean {
  const status = err?.status ?? err?.code ?? null;
  const msg = String(err?.message ?? "").toLowerCase();
  return status === 403 || msg.includes("forbidden");
}

/**
 * OAuth/ログインフローが壊れた時の復旧用（ブラウザ限定）
 * - signOut（local）
 * - loomroom_current_user クリア
 * - supabase auth storage / PKCE verifier を掃除
 */
export async function resetAuthFlow(): Promise<void> {
  if (!isBrowser()) return;

  try {
    // local で十分（他端末まで落とさない）
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
      if (isForbiddenAuthError(error)) {
        await resetAuthFlow();
      }
      return null;
    }

    const id = data.user.id as UserId;
    persistCurrentUserId(id);
    return id;
  } catch (e: any) {
    if (isForbiddenAuthError(e)) {
      await resetAuthFlow();
    }
    return null;
  }
}

export async function getAuthUserId(): Promise<UserId | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id as UserId;
}

/**
 * DB操作のための viewer uuid を返す
 * - ログイン済みなら uuid
 * - 未ログインなら null
 * - 403なら自動掃除して null
 */
export async function ensureViewerId(): Promise<UserId | null> {
  if (!isBrowser()) return null;

  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    if (isForbiddenAuthError(error)) {
      await resetAuthFlow();
    }
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
    options: {
      emailRedirectTo: EMAIL_CONFIRM_REDIRECT_TO,
    },
  });

  if (error) throw error;
}

export function isEmailNotConfirmedError(message?: string | null): boolean {
  if (!message) return false;
  return message.toLowerCase().includes("email not confirmed");
}

/**
 * ログアウト処理（1か所に集約）
 * - Supabase から signOut（local）
 * - localStorage / supabase auth storage を掃除
 */
export async function logout(): Promise<void> {
  await resetAuthFlow();
}