// lib/auth.ts
import type { UserId, Role } from "@/types/user";
import { inferRoleFromId } from "@/types/user";
import { supabase } from "@/lib/supabaseClient";

/**
 * LoomRoom の「現在ID」保持ルール（互換維持）
 * - 未ログイン: guest-xxxxxx を localStorage に保存（旧仕様）
 * - ログイン済み: Supabase Auth の uuid を localStorage に保存（旧仕様）
 *
 * ★追加（NEW）：
 * - DB操作（いいね/通報/DMなど）は auth.uid() が必須なので、
 *   未ログイン時は Anonymous sign-in で UUID を発行し、それを返す。
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
 * UUID判定（Auth uid のみ “DB操作できるID”）
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(v: any): v is string {
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
 * 現在のユーザーIDを返す（同期・互換維持）
 *
 * - SSR / build 中： "guest" 固定（ブラウザ側で再評価される想定）
 * - ブラウザ：localStorage があればそれ、なければ guest を作成して保存
 *
 * 注意：
 * - これは “画面の識別子” としては使えるが、DB書き込み（like等）には使わないこと。
 * - DB書き込みは ensureViewerId() を使う。
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
 * 現在のユーザーロールを返すヘルパー（互換維持）
 */
export function getCurrentUserRole(): Role {
  const id = getCurrentUserId();
  return inferRoleFromId(id);
}

/**
 * Supabase Auth から現在のユーザーを取得し、
 * もしログイン済みなら localStorage に uuid を保存するユーティリティ（互換維持）
 */
export async function syncAuthUserToLocalId(): Promise<UserId | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const id = data.user.id as UserId;
  if (isBrowser()) persistCurrentUserId(id);
  return id;
}

/**
 * セッションがあるなら uuid を返す（互換維持）
 * - セッション無しなら null
 */
export async function getAuthUserId(): Promise<UserId | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id as UserId;
}

/**
 * ★NEW：DB操作のために「必ず UUID（auth.uid）」を返す
 *
 * - すでにセッションがあれば、その uuid を返す
 * - セッションが無ければ Anonymous sign-in して uuid を作る
 * - 取得した uuid は localStorage にも保存して、画面側も uuid に寄せられるようにする
 *
 * 前提：
 * - Supabase Dashboard で Anonymous Sign-ins を有効化しておくこと
 */
export async function ensureViewerId(): Promise<UserId> {
  // SSRでは実行しない（呼び出し側は useEffect などブラウザ限定で）
  if (!isBrowser()) return "guest";

  // 1) 既にセッションがあれば最優先
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUid = sessionData.session?.user?.id ?? null;
  if (sessionUid && isUuid(sessionUid)) {
    // localStorage が guest-* のままなら uuid に上書きしておく
    const stored = getStoredUserId();
    if (!stored || !isUuid(stored)) persistCurrentUserId(sessionUid as UserId);
    return sessionUid as UserId;
  }

  // 2) localStorage に uuid が入っている場合でも、セッションが無いならDBには使えない
  //    → 必ず anonymous sign-in を実行してセッションを作る
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;

  const uid = data.user?.id ?? null;
  if (!uid || !isUuid(uid)) {
    throw new Error("Anonymous sign-in succeeded but user.id is invalid");
  }

  persistCurrentUserId(uid as UserId);
  return uid as UserId;
}

/**
 * 追加：確認メールの再送（signup未確認ユーザー向け）
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
 * 追加：ログインエラーが「未確認メール」かどうか判定
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